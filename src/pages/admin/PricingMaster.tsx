import { useEffect, useMemo, useState, useCallback } from "react";
import { Search, DollarSign, CheckCircle2, Layers, TrendingUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type TierKey = "athlete" | "corporate" | "standard";
type PriceField = "price_athlete" | "price_corporate" | "price_standard";

interface Row {
  id: string;
  name: string;
  style_number: string | null;
  brand: string | null;
  blank_cost: number | null;
  decoration_cost: number;
  additional_cost: number;
  price_athlete: number | null;
  price_corporate: number | null;
  price_standard: number | null;
}

const TIERS: { key: TierKey; field: PriceField; label: string }[] = [
  { key: "athlete", field: "price_athlete", label: "Athlete" },
  { key: "corporate", field: "price_corporate", label: "Corporate" },
  { key: "standard", field: "price_standard", label: "Standard" },
];

function trueCost(r: Row) {
  return (r.blank_cost ?? 0) + (r.decoration_cost ?? 0) + (r.additional_cost ?? 0);
}
function isComplete(r: Row) {
  return r.price_athlete != null && r.price_corporate != null && r.price_standard != null;
}
function fmt(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${Number(n).toFixed(digits)}`;
}
function marginPct(price: number | null, cost: number) {
  if (price == null || price <= 0) return null;
  return ((price - cost) / price) * 100;
}

export default function PricingMaster() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const isMobile = useIsMobile();
  const [editingMobile, setEditingMobile] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("blanks")
      .select(
        "id, name, style_number, brand, blank_cost, decoration_cost, additional_cost, price_athlete, price_corporate, price_standard",
      )
      .order("name");
    if (error) {
      toast.error("Failed to load blanks");
      setRows([]);
    } else {
      setRows((data ?? []) as Row[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updatePrice(id: string, field: PriceField, value: number | null) {
    const prev = rows;
    setRows((rs) =>
      rs ? rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)) : rs,
    );
    const { error } = await supabase.from("blanks").update({ [field]: value }).eq("id", id);
    if (error) {
      toast.error("Save failed");
      setRows(prev);
    }
  }

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (incompleteOnly && isComplete(r)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.brand ?? "").toLowerCase().includes(q) ||
        (r.style_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, incompleteOnly]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const total = list.length;
    const complete = list.filter(isComplete).length;
    const costs = list.map(trueCost).filter((c) => c > 0);
    const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
    const stdPrices = list.map((r) => r.price_standard).filter((p): p is number => p != null);
    const avgStd = stdPrices.length ? stdPrices.reduce((a, b) => a + b, 0) / stdPrices.length : 0;
    const margins = list
      .map((r) => marginPct(r.price_standard, trueCost(r)))
      .filter((m): m is number => m != null);
    const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
    return { total, complete, avgCost, avgStd, avgMargin };
  }, [rows]);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header>
        <div className="ax-section-header mb-2">Back office</div>
        <h1 className="text-3xl font-bold">Pricing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Per-blank MOQ price for each tier. Volume breaks apply on top automatically.
        </p>
      </header>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard icon={<Layers className="h-4 w-4" />} label="Total blanks" value={String(stats.total)} />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Avg true cost" value={fmt(stats.avgCost)} />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Avg Standard price" value={fmt(stats.avgStd)} />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Avg margin (Std)"
          value={`${stats.avgMargin.toFixed(1)}%`}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Pricing complete"
          value={`${stats.complete} / ${stats.total}`}
          active={incompleteOnly}
          onClick={() => setIncompleteOnly((v) => !v)}
          hint={incompleteOnly ? "Showing incomplete · click to clear" : "Click to filter incomplete"}
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, brand, style #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {incompleteOnly && (
          <Button variant="outline" size="sm" onClick={() => setIncompleteOnly(false)}>
            Clear incomplete filter
          </Button>
        )}
      </div>

      {loading && (
        <div className="ax-card p-0 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 border-b border-border last:border-b-0">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="ax-card p-8 text-center text-sm text-muted-foreground">
          {incompleteOnly ? "All blanks have complete pricing 🎉" : "No blanks match your search."}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        isMobile ? (
          <div className="space-y-3">
            {filtered.map((r) => (
              <MobileCard key={r.id} row={r} onEdit={() => setEditingMobile(r)} />
            ))}
          </div>
        ) : (
          <div className="ax-card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                    <th className="text-left p-3 font-medium">Blank</th>
                    <th className="text-right p-3 font-medium">True cost</th>
                    {TIERS.map((t) => (
                      <th key={t.key} className="text-right p-3 font-medium">
                        {t.label}
                      </th>
                    ))}
                    <th className="text-right p-3 font-medium">Margin (Std)</th>
                    <th className="text-center p-3 font-medium w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const cost = trueCost(r);
                    const stdMargin = marginPct(r.price_standard, cost);
                    const complete = isComplete(r);
                    return (
                      <tr key={r.id} className="border-b border-border last:border-b-0 hover:bg-muted/20">
                        <td className="p-3">
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {r.brand ?? "—"} {r.style_number ? `· ${r.style_number}` : ""}
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {cost > 0 ? fmt(cost) : "—"}
                        </td>
                        {TIERS.map((t) => (
                          <td key={t.key} className="p-1 text-right">
                            <PriceCell
                              value={r[t.field]}
                              onSave={(v) => updatePrice(r.id, t.field, v)}
                            />
                          </td>
                        ))}
                        <td className="p-3 text-right tabular-nums">
                          {stdMargin == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={cn(stdMargin < 20 ? "text-orange-400" : "text-accent")}>
                              {stdMargin.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {complete ? (
                            <CheckCircle2 className="h-4 w-4 text-accent inline" />
                          ) : (
                            <span
                              className="inline-block h-2 w-2 rounded-full bg-orange-400"
                              title="Incomplete pricing"
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      <MobileEditDialog
        row={editingMobile}
        onClose={() => setEditingMobile(null)}
        onSave={async (field, value) => {
          if (editingMobile) await updatePrice(editingMobile.id, field, value);
        }}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  onClick,
  active,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
  active?: boolean;
  hint?: string;
}) {
  const Wrapper: React.ElementType = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "ax-card p-4 text-left transition-colors",
        onClick && "cursor-pointer hover:border-accent/50",
        active && "border-accent ring-1 ring-accent/40",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold mt-2 tabular-nums">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-1">{hint}</div>}
    </Wrapper>
  );
}

function PriceCell({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (v: number | null) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value == null ? "" : String(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value == null ? "" : String(value));
  }, [value, editing]);

  async function commit() {
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error("Enter a valid price");
      setDraft(value == null ? "" : String(value));
      setEditing(false);
      return;
    }
    if (parsed === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    await onSave(parsed);
    setSaving(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="relative inline-flex items-center">
        <span className="absolute left-2 text-muted-foreground text-xs">$</span>
        <input
          autoFocus
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            else if (e.key === "Escape") {
              setDraft(value == null ? "" : String(value));
              setEditing(false);
            }
          }}
          className="w-24 h-8 pl-5 pr-2 rounded-md border border-accent bg-background text-right tabular-nums text-sm focus:outline-none"
        />
        {saving && <Loader2 className="h-3 w-3 animate-spin ml-1 text-muted-foreground" />}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className={cn(
        "inline-block w-24 h-8 px-2 rounded-md text-right tabular-nums text-sm border border-transparent",
        "hover:border-border hover:bg-muted/40 transition-colors",
        value == null && "text-muted-foreground/50 italic",
      )}
    >
      {value == null ? "Set price" : fmt(value)}
    </button>
  );
}

function MobileCard({ row, onEdit }: { row: Row; onEdit: () => void }) {
  const cost = trueCost(row);
  const complete = isComplete(row);
  return (
    <button
      onClick={onEdit}
      className="ax-card p-4 w-full text-left space-y-3 hover:border-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{row.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.brand ?? "—"} {row.style_number ? `· ${row.style_number}` : ""}
          </div>
        </div>
        {complete ? (
          <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-orange-400 mt-2 shrink-0" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Field label="True cost" value={cost > 0 ? fmt(cost) : "—"} />
        {TIERS.map((t) => (
          <Field
            key={t.key}
            label={t.label}
            value={row[t.field] == null ? "Set price" : fmt(row[t.field])}
            muted={row[t.field] == null}
          />
        ))}
      </div>
    </button>
  );
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("tabular-nums", muted && "text-muted-foreground/50 italic")}>{value}</div>
    </div>
  );
}

function MobileEditDialog({
  row,
  onClose,
  onSave,
}: {
  row: Row | null;
  onClose: () => void;
  onSave: (field: PriceField, value: number | null) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<PriceField, string>>({
    price_athlete: "",
    price_corporate: "",
    price_standard: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      setDrafts({
        price_athlete: row.price_athlete == null ? "" : String(row.price_athlete),
        price_corporate: row.price_corporate == null ? "" : String(row.price_corporate),
        price_standard: row.price_standard == null ? "" : String(row.price_standard),
      });
    }
  }, [row]);

  if (!row) return null;

  async function save() {
    if (!row) return;
    setSaving(true);
    for (const t of TIERS) {
      const raw = drafts[t.field].trim();
      const parsed = raw === "" ? null : Number(raw);
      if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
        toast.error(`Invalid ${t.label} price`);
        setSaving(false);
        return;
      }
      if (parsed !== row[t.field]) {
        await onSave(t.field, parsed);
      }
    }
    setSaving(false);
    onClose();
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {TIERS.map((t) => (
            <div key={t.key} className="space-y-1.5">
              <Label>{t.label} MOQ price</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  className="pl-7"
                  placeholder="Set price"
                  value={drafts[t.field]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [t.field]: e.target.value }))}
                />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}