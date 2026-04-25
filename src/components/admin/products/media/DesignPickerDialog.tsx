// Mobile-first. Test at 375px before merging.
//
// Multi-select picker for linking existing designs to a product.
// - Bubble checkbox in top-right of each tile (always tap-toggles selection on mobile)
// - Desktop: clicking the tile body toggles selection too; Shift extends a range,
//   Cmd/Ctrl adds individually
// - Sticky footer: count, placement, "Mark as variations" toggle, optional
//   "Variation of" + "Variation label" fields, and a Link Selected button
// - Modal stays open after a successful batch link, selection cleared
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

export interface PrimaryOption {
  id: string; // product_designs.id
  design_title: string;
}

interface Props {
  open: boolean;
  productId: string;
  excludedDesignIds: Set<string>;
  /** Existing primaries on this product, for the "Variation of" dropdown. */
  primaryOptions: PrimaryOption[];
  /** Pre-set the variation toggle ON when opening (e.g. from "+ Add Variation"). */
  defaultAsVariation?: boolean;
  onOpenChange: (o: boolean) => void;
  onLinked: () => void;
}

export function DesignPickerDialog({
  open,
  productId,
  excludedDesignIds,
  primaryOptions,
  defaultAsVariation = false,
  onOpenChange,
  onLinked,
}: Props) {
  const [designs, setDesigns] = useState<DesignRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [athleteFilter, setAthleteFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [placement, setPlacement] = useState<DesignPlacement>("front");
  const [asVariation, setAsVariation] = useState(false);
  const [variationOf, setVariationOf] = useState<string>("none");
  const [variationLabel, setVariationLabel] = useState("");
  const [linking, setLinking] = useState(false);
  const lastTileIndexRef = useRef<number | null>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setPlacement("front");
    setAsVariation(defaultAsVariation);
    setVariationOf("none");
    setVariationLabel("");
    lastTileIndexRef.current = null;
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
  }, [open, defaultAsVariation]);

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

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleTileClick(e: React.MouseEvent, id: string, index: number) {
    // On mobile we keep tile-body click as a no-op (per spec). Use a touch-capability heuristic.
    const isCoarse =
      typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
    if (isCoarse) {
      // Mobile: tile body click does nothing (the bubble handles selection).
      return;
    }
    if (e.shiftKey && lastTileIndexRef.current !== null) {
      const start = Math.min(lastTileIndexRef.current, index);
      const end = Math.max(lastTileIndexRef.current, index);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          const d = filtered[i];
          if (d) next.add(d.id);
        }
        return next;
      });
    } else if (e.metaKey || e.ctrlKey) {
      toggleOne(id);
    } else {
      toggleOne(id);
    }
    lastTileIndexRef.current = index;
  }

  async function handleLinkSelected() {
    if (selected.size === 0) return;
    setLinking(true);
    const trimmedLabel = variationLabel.trim().slice(0, 50);
    const rows = Array.from(selected).map((design_id) => ({
      product_id: productId,
      design_id,
      placement,
      is_variation: asVariation,
      variation_of: asVariation && variationOf !== "none" ? variationOf : null,
      variation_label: asVariation && trimmedLabel ? trimmedLabel : null,
    }));
    const { error } = await supabase.from("product_designs").insert(rows);
    setLinking(false);
    if (error) {
      toast.error(error.message ?? "Failed to link designs");
      return;
    }
    toast.success(
      `Linked ${rows.length} design${rows.length === 1 ? "" : "s"}${asVariation ? " as variation" + (rows.length === 1 ? "" : "s") : ""}`,
    );
    onLinked();
    setSelected(new Set());
    setVariationLabel("");
    // keep dialog open
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[85vh] flex flex-col p-0 gap-0 sm:rounded-lg rounded-none">
        <DialogHeader className="p-4 border-b border-border shrink-0 flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base">
            Link existing designs
            {selected.size > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                — {selected.size} selected
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-3 border-b border-border shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,180px] gap-2">
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
              No matching designs.{" "}
              {excludedDesignIds.size > 0 && "(Already-linked designs are hidden.)"}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((d, i) => {
                const isSel = selected.has(d.id);
                return (
                  <div
                    key={d.id}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleTileClick(e, d.id, i)}
                    onKeyDown={(e) => {
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggleOne(d.id);
                        lastTileIndexRef.current = i;
                      }
                    }}
                    className={cn(
                      "ax-card p-2 text-left space-y-2 cursor-pointer relative transition-colors select-none",
                      isSel ? "border-accent ring-2 ring-accent/40" : "hover:border-accent/60",
                    )}
                  >
                    {/* Bubble checkbox */}
                    <button
                      type="button"
                      aria-label={isSel ? "Deselect" : "Select"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleOne(d.id);
                        lastTileIndexRef.current = i;
                      }}
                      className={cn(
                        "absolute top-3 right-3 z-10 h-5 w-5 rounded-full border flex items-center justify-center transition-colors",
                        isSel
                          ? "bg-[hsl(145_63%_49%)] border-[hsl(145_63%_49%)] text-white"
                          : "bg-background/80 border-border hover:border-accent",
                      )}
                    >
                      {isSel && <Check className="h-3 w-3" strokeWidth={3} />}
                    </button>
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
                    </div>
                    <div className="text-xs font-medium truncate" title={d.title}>
                      {d.title}
                    </div>
                    {d.athlete_name && (
                      <div className="text-[10px] text-muted-foreground truncate">
                        {d.athlete_name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky footer */}
        <div className="border-t border-border bg-background p-3 sm:p-4 shrink-0 space-y-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs text-muted-foreground tabular-nums">
              {selected.size} selected
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="as-variation"
                checked={asVariation}
                onCheckedChange={setAsVariation}
              />
              <Label htmlFor="as-variation" className="text-xs cursor-pointer">
                Mark as variations
              </Label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Placement
              </Label>
              <Select value={placement} onValueChange={(v) => setPlacement(v as DesignPlacement)}>
                <SelectTrigger className="h-9 mt-1">
                  <SelectValue />
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
            {asVariation && (
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Variation of
                </Label>
                <Select value={variationOf} onValueChange={setVariationOf}>
                  <SelectTrigger className="h-9 mt-1">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (unlinked)</SelectItem>
                    {primaryOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.design_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {asVariation && (
            <div>
              <Label
                htmlFor="variation-label"
                className="text-[10px] uppercase tracking-wide text-muted-foreground"
              >
                Variation label (optional)
              </Label>
              <Input
                id="variation-label"
                value={variationLabel}
                onChange={(e) => setVariationLabel(e.target.value.slice(0, 50))}
                placeholder="e.g. Navy colorway, Alt layout, v2"
                maxLength={50}
                className="h-9 mt-1"
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="gap-1"
            >
              <X className="h-4 w-4" /> Done
            </Button>
            <Button
              type="button"
              onClick={handleLinkSelected}
              disabled={selected.size === 0 || linking}
              className="gap-2 bg-[hsl(145_63%_42%)] hover:bg-[hsl(145_63%_36%)] text-white"
            >
              {linking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Link {selected.size > 0 ? selected.size : ""} selected
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}