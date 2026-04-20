// Mobile-first. Test at 375px before merging.
//
// Picker dialog for linking an existing design to a product.
// Shows all org designs with a primary thumbnail (when available),
// filterable by athlete and a free-text search. Choosing a design
// inserts a row into product_designs with the chosen placement.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getSignedUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { PLACEMENT_OPTIONS, type DesignPlacement } from "./placements";

interface DesignRow {
  id: string;
  title: string;
  primary_athlete_id: string | null;
  athlete_name: string | null;
  thumb_url: string | null;
}

interface Props {
  open: boolean;
  productId: string;
  excludedDesignIds: Set<string>;
  onOpenChange: (o: boolean) => void;
  onLinked: () => void;
}

export function DesignPickerDialog({
  open,
  productId,
  excludedDesignIds,
  onOpenChange,
  onLinked,
}: Props) {
  const [designs, setDesigns] = useState<DesignRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [athleteFilter, setAthleteFilter] = useState<string>("all");
  const [linking, setLinking] = useState<string | null>(null);
  const [placement, setPlacement] = useState<DesignPlacement>("front");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setDesigns(null);
      const { data, error } = await supabase
        .from("designs")
        .select(
          `
          id, title, primary_athlete_id,
          athlete:athletes!designs_primary_athlete_id_fkey(id, full_name, first_name, last_name),
          design_files(id, storage_bucket, storage_path, file_type, mime_type, is_primary, sort_order)
        `,
        )
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) {
        console.error(error);
        if (!cancelled) setDesigns([]);
        return;
      }
      const rows: DesignRow[] = await Promise.all(
        (data ?? []).map(async (d) => {
          const a = Array.isArray(d.athlete) ? d.athlete[0] : d.athlete;
          const name =
            a?.full_name ?? (a ? `${a.first_name} ${a.last_name}`.trim() : null);
          // Pick a thumb: primary file > first mockup > first export > first source
          const files = (d.design_files ?? []) as Array<{
            id: string;
            storage_bucket: string;
            storage_path: string;
            file_type: string;
            mime_type: string | null;
            is_primary: boolean;
            sort_order: number;
          }>;
          const imageFiles = files.filter((f) => (f.mime_type ?? "").startsWith("image/"));
          const ranked =
            imageFiles.find((f) => f.is_primary) ??
            imageFiles.find((f) => f.file_type === "mockup") ??
            imageFiles.find((f) => f.file_type === "export") ??
            imageFiles[0];
          let thumb_url: string | null = null;
          if (ranked) {
            thumb_url = await getSignedUrl(ranked.storage_bucket, ranked.storage_path, 3600);
          }
          return {
            id: d.id,
            title: d.title,
            primary_athlete_id: d.primary_athlete_id,
            athlete_name: name,
            thumb_url,
          };
        }),
      );
      if (!cancelled) setDesigns(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const athleteOptions = useMemo(() => {
    const map = new Map<string, string>();
    designs?.forEach((d) => {
      if (d.primary_athlete_id && d.athlete_name) {
        map.set(d.primary_athlete_id, d.athlete_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [designs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (designs ?? []).filter((d) => {
      if (excludedDesignIds.has(d.id)) return false;
      if (athleteFilter !== "all" && d.primary_athlete_id !== athleteFilter) return false;
      if (q && !d.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [designs, search, athleteFilter, excludedDesignIds]);

  async function link(designId: string) {
    setLinking(designId);
    const { error } = await supabase.from("product_designs").insert({
      product_id: productId,
      design_id: designId,
      placement,
    });
    setLinking(null);
    if (error) {
      toast.error(error.message ?? "Failed to link design");
      return;
    }
    toast.success("Design linked");
    onLinked();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-4 border-b border-border shrink-0">
          <DialogTitle>Link existing design</DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-3 border-b border-border shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,180px,180px] gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search designs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={athleteFilter} onValueChange={setAthleteFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Athlete" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All athletes</SelectItem>
                {athleteOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={placement} onValueChange={(v) => setPlacement(v as DesignPlacement)}>
              <SelectTrigger>
                <SelectValue placeholder="Placement" />
              </SelectTrigger>
              <SelectContent>
                {PLACEMENT_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto scroll-touch p-4">
          {!designs ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="ax-card p-8 text-center text-sm text-muted-foreground">
              No matching designs. {excludedDesignIds.size > 0 && "(All matching designs are already linked.)"}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => link(d.id)}
                  disabled={linking === d.id}
                  className={cn(
                    "ax-card p-2 text-left space-y-2 hover:border-accent transition-colors pressable",
                    linking === d.id && "opacity-60 pointer-events-none",
                  )}
                >
                  <div className="relative aspect-square rounded-md overflow-hidden bg-muted">
                    {d.thumb_url ? (
                      <img
                        src={d.thumb_url}
                        alt={d.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        No preview
                      </div>
                    )}
                    {linking === d.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      </div>
                    )}
                  </div>
                  <div className="text-xs font-medium truncate" title={d.title}>
                    {d.title}
                  </div>
                  {d.athlete_name && (
                    <div className="text-[10px] text-muted-foreground truncate">{d.athlete_name}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
