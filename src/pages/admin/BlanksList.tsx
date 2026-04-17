import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Search, Shirt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BLANK_AVAILABILITIES,
  GARMENT_TYPES,
  type BlankAvailability,
  type GarmentType,
  availabilityBadgeClass,
  formatAvailability,
  formatGarmentType,
} from "@/lib/blank-status";
import { BlankFormDialog } from "@/components/admin/blanks/BlankFormDialog";
import { cn } from "@/lib/utils";

interface BlankRow {
  id: string;
  name: string;
  vendor: string | null;
  brand: string | null;
  style_number: string | null;
  garment_type: GarmentType;
  cost: number | null;
  moq: number | null;
  availability_status: BlankAvailability;
  sellable_as_blank: boolean;
  internal_only: boolean;
  color_count: number;
  size_count: number;
}

const PAGE_SIZE = 25;

export default function BlanksList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<BlankRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [garmentFilter, setGarmentFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [sellableOnly, setSellableOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const blanksRes = await supabase
        .from("blanks")
        .select(
          "id, name, vendor, brand, style_number, garment_type, cost, moq, availability_status, sellable_as_blank, internal_only",
        )
        .order("updated_at", { ascending: false });
      if (blanksRes.error) console.error(blanksRes.error);
      const blanks = blanksRes.data ?? [];

      const ids = blanks.map((b) => b.id);
      const colorMap = new Map<string, number>();
      const sizeMap = new Map<string, number>();
      if (ids.length) {
        const [cRes, sRes] = await Promise.all([
          supabase.from("blank_colors").select("blank_id").in("blank_id", ids),
          supabase.from("blank_sizes").select("blank_id").in("blank_id", ids),
        ]);
        (cRes.data ?? []).forEach((r) => colorMap.set(r.blank_id, (colorMap.get(r.blank_id) ?? 0) + 1));
        (sRes.data ?? []).forEach((r) => sizeMap.set(r.blank_id, (sizeMap.get(r.blank_id) ?? 0) + 1));
      }

      setRows(
        blanks.map((b) => ({
          id: b.id,
          name: b.name,
          vendor: b.vendor,
          brand: b.brand,
          style_number: b.style_number,
          garment_type: b.garment_type as GarmentType,
          cost: b.cost,
          moq: b.moq,
          availability_status: b.availability_status as BlankAvailability,
          sellable_as_blank: b.sellable_as_blank,
          internal_only: b.internal_only,
          color_count: colorMap.get(b.id) ?? 0,
          size_count: sizeMap.get(b.id) ?? 0,
        })),
      );
    } catch (err) {
      console.error("BlanksList load failed:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (garmentFilter !== "all" && r.garment_type !== garmentFilter) return false;
      if (availabilityFilter !== "all" && r.availability_status !== availabilityFilter) return false;
      if (sellableOnly && !r.sellable_as_blank) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.vendor ?? "").toLowerCase().includes(q) ||
        (r.brand ?? "").toLowerCase().includes(q) ||
        (r.style_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, garmentFilter, availabilityFilter, sellableOnly]);

  useEffect(() => setPage(1), [search, garmentFilter, availabilityFilter, sellableOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const isEmpty = !loading && rows && rows.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Catalog</div>
          <h1 className="text-3xl font-bold">Blanks</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Blank
        </Button>
      </header>

      {!isEmpty && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, vendor, brand, style #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={garmentFilter} onValueChange={setGarmentFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All garments</SelectItem>
              {GARMENT_TYPES.map((g) => (
                <SelectItem key={g} value={g} className="capitalize">
                  {formatGarmentType(g)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All availability</SelectItem>
              {BLANK_AVAILABILITIES.map((a) => (
                <SelectItem key={a} value={a} className="capitalize">
                  {formatAvailability(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 px-3 h-10 rounded-md border border-border bg-card">
            <Switch id="sellable" checked={sellableOnly} onCheckedChange={setSellableOnly} />
            <Label htmlFor="sellable" className="text-sm cursor-pointer">Sellable as Blank</Label>
          </div>
        </div>
      )}

      {loading && (
        <div className="ax-card p-0 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-border last:border-b-0">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/6" />
              <Skeleton className="h-4 w-1/12" />
              <Skeleton className="h-4 w-1/12" />
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-4">
          <Shirt className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">
            No blanks yet. Add your first garment base to start building products.
          </p>
          <div className="flex justify-center">
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Blank
            </Button>
          </div>
        </div>
      )}

      {!loading && rows && rows.length > 0 && (
        <>
          <div className="ax-card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 text-muted-foreground font-medium">Name</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Vendor</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Brand</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Style #</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Type</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Cost</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">MOQ</th>
                    <th className="text-left p-3 text-muted-foreground font-medium">Availability</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Colors</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">Sizes</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">Sellable</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">Internal</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b border-border last:border-b-0 ax-row-hover cursor-pointer"
                      onClick={() => navigate(`/admin/blanks/${b.id}`)}
                    >
                      <td className="p-3 font-medium">{b.name}</td>
                      <td className="p-3 text-muted-foreground">{b.vendor ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{b.brand ?? "—"}</td>
                      <td className="p-3 text-muted-foreground tabular-nums">{b.style_number ?? "—"}</td>
                      <td className="p-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs border border-border bg-muted text-muted-foreground capitalize">
                          {formatGarmentType(b.garment_type)}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {b.cost != null ? `$${Number(b.cost).toFixed(2)}` : "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums">{b.moq ?? "—"}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "inline-flex px-2 py-0.5 rounded-full text-xs border capitalize",
                            availabilityBadgeClass(b.availability_status),
                          )}
                        >
                          {formatAvailability(b.availability_status)}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums">{b.color_count}</td>
                      <td className="p-3 text-right tabular-nums">{b.size_count}</td>
                      <td className="p-3 text-center text-xs text-muted-foreground">
                        {b.sellable_as_blank ? "Yes" : "—"}
                      </td>
                      <td className="p-3 text-center text-xs text-muted-foreground">
                        {b.internal_only ? "Yes" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="ax-card p-8 text-center text-sm text-muted-foreground">
              No blanks match your filters.
            </div>
          )}

          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Button>
                <span className="text-muted-foreground tabular-nums">{page} / {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <BlankFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </div>
  );
}
