// One blank experience: Catalog · Assortments · Pricing · Media.
//
// These used to be three sidebar entries that behaved like separate
// applications despite describing the same 48 records. They are now views of
// one catalogue — the view lives in the URL, so a filtered pricing view is a
// link you can send someone.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  LayoutGrid, Table2, SlidersHorizontal, X, Loader2, Plus, Check,
  Eye, FolderPlus, Trash2, ImageOff, DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import {
  EMPTY_FILTERS, activeFilterCount, addToAssortment, bulkPrice, createAssortment, facetsOf,
  groupByCategory, loadAssortments, loadCatalog, matchesFilters, prettyCategory,
  previewFor, priceCatalogBlank, removeFromAssortment, setAvailability,
  type Assortment, type CatalogFilters, type PricedCatalogBlank,
} from "@/lib/ecosystem/blank-catalog";
import {
  DEFAULT_RULES, PRICE_TIERS, formatMoney, formatPercent, loadPricingRules,
  type PriceTier, type PricingRule,
} from "@/lib/ecosystem/pricing";
import { BLANK_AVAILABILITIES, formatAvailability, type BlankAvailability } from "@/lib/blank-status";
import { getCurrentOrgId } from "@/hooks/useTasks";
import { useTabParam } from "@/hooks/useTabParam";
import { BlankGrid, BlankTable } from "@/components/admin/blanks/BlankCatalogCards";
import { BlankDetailDrawer } from "@/components/admin/blanks/BlankDetailDrawer";
import { BlankFormDialog } from "@/components/admin/blanks/BlankFormDialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const VIEWS = ["catalog", "assortments", "pricing", "media"] as const;
type View = (typeof VIEWS)[number];

export default function BlankCatalog() {
  const [view, setView] = useTabParam<View>("view", VIEWS, "catalog");
  const [mode, setMode] = useTabParam<"grid" | "table">("mode", ["grid", "table"] as const, "grid");

  const [raw, setRaw] = useState<PricedCatalogBlank[] | null>(null);
  const [assortments, setAssortments] = useState<Assortment[]>([]);
  const [rules, setRules] = useState<Record<PriceTier, PricingRule>>(DEFAULT_RULES);
  const [orgId, setOrgId] = useState<string | null>(null);

  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [assortPicker, setAssortPicker] = useState<"add" | "remove" | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const org = orgId ?? (await getCurrentOrgId());
    setOrgId(org);
    const [cat, ass, rl] = await Promise.all([
      loadCatalog().catch(() => []),
      loadAssortments().catch(() => []),
      org ? loadPricingRules(org).catch(() => DEFAULT_RULES) : Promise.resolve(DEFAULT_RULES),
    ]);
    setRules(rl);
    setAssortments(ass);
    setRaw(cat.map((b) => priceCatalogBlank(b, rl)));
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-price in place when rules change, rather than refetching the catalogue.
  const blanks = raw ?? [];
  const facets = useMemo(() => facetsOf(blanks), [blanks]);
  const tier = filters.priceTier ?? "standard";

  const shown = useMemo(
    () => blanks.filter((b) => matchesFilters(b, filters)),
    [blanks, filters],
  );

  const detailBlank = blanks.find((b) => b.id === detail) ?? null;
  const filterCount = activeFilterCount(filters);

  function toggle(id: string) {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }
  function toggleAll() {
    setSelected((p) => (shown.every((b) => p.includes(b.id)) ? [] : shown.map((b) => b.id)));
  }

  async function applyAssortment(a: Assortment, action: "add" | "remove") {
    setBusy(true);
    try {
      if (action === "add") await addToAssortment(a.id, selected);
      else await removeFromAssortment(a.id, selected);
      toast.success(`${selected.length} blank${selected.length === 1 ? "" : "s"} ${action === "add" ? "added to" : "removed from"} ${a.name}`);
      setAssortPicker(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  async function bulkAvailability(status: BlankAvailability) {
    setBusy(true);
    try {
      await setAvailability(selected, status);
      toast.success(`${selected.length} set to ${status}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  if (raw === null) {
    return <div className="p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5 pb-28">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Blanks</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {blanks.length} blanks · what they are, what they cost, and who can use them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreateOpen(true)}
            className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5"
          ><Plus className="h-4 w-4" /> New blank</button>
          <div className="flex gap-1 rounded-xl bg-[hsl(var(--ax-line))] p-1">
          {VIEWS.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "h-8 px-3.5 rounded-lg text-[13px] font-semibold capitalize transition-colors",
                view === v ? "bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
          </div>
        </div>
      </div>

      {(view === "catalog" || view === "pricing") && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={filters.search ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search blanks, SKUs, style numbers…"
              className="h-9 flex-1 min-w-[220px] max-w-md text-[13px]"
            />
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              className={cn(
                "h-9 px-3 rounded-lg border text-[13px] font-semibold inline-flex items-center gap-1.5",
                filterCount > 0
                  ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-accent))]"
                  : "border-[hsl(var(--ax-border))] text-muted-foreground",
              )}
            >
              <SlidersHorizontal className="h-4 w-4" /> Filters{filterCount > 0 ? ` (${filterCount})` : ""}
            </button>

            {view === "catalog" && (
              <div className="flex gap-1 rounded-lg bg-[hsl(var(--ax-line))] p-0.5 ml-auto">
                <button
                  onClick={() => setMode("grid")}
                  className={cn("h-8 px-2.5 rounded-md", mode === "grid" ? "bg-[hsl(var(--ax-card))]" : "text-muted-foreground")}
                  aria-label="Grid"
                ><LayoutGrid className="h-4 w-4" /></button>
                <button
                  onClick={() => setMode("table")}
                  className={cn("h-8 px-2.5 rounded-md", mode === "table" ? "bg-[hsl(var(--ax-card))]" : "text-muted-foreground")}
                  aria-label="Table"
                ><Table2 className="h-4 w-4" /></button>
              </div>
            )}
          </div>

          {filtersOpen && (
            <FilterPanel
              filters={filters}
              setFilters={setFilters}
              facets={facets}
              assortments={assortments}
              onClose={() => setFiltersOpen(false)}
            />
          )}

          {filterCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="text-[hsl(var(--ax-faint))]">{shown.length} of {blanks.length}</span>
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="font-semibold text-[hsl(var(--ax-accent))]"
              >Clear filters</button>
            </div>
          )}

          {view === "pricing" && <PricingSummary blanks={shown} tier={tier} />}

          {view === "pricing" || mode === "table" ? (
            <BlankTable
              blanks={shown}
              assortments={assortments}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onOpen={(b) => setDetail(b.id)}
              tier={tier}
            />
          ) : (
            <BlankGrid
              blanks={shown}
              assortments={assortments}
              selected={selected}
              onToggle={toggle}
              onOpen={(b) => setDetail(b.id)}
            />
          )}
        </>
      )}

      {view === "assortments" && (
        <AssortmentsView
          assortments={assortments}
          blanks={blanks}
          orgId={orgId}
          onChanged={load}
          onOpenBlank={(id) => setDetail(id)}
          previewKey={previewKey}
          setPreviewKey={setPreviewKey}
        />
      )}

      {view === "media" && (
        <div className="space-y-3">
          <p className="text-[13px] text-muted-foreground max-w-[75ch]">
            Photography coverage across the catalogue. Importing here writes to the same colourways the catalog and
            product creation read from — there is only one copy of any blank photo.
          </p>
          <Link
            to="/admin/blanks/import-images"
            className="inline-flex h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm items-center gap-1.5"
          >
            Open the photo importer
          </Link>
          <MediaCoverage blanks={blanks} onOpen={(id) => setDetail(id)} />
        </div>
      )}

      {detailBlank && (
        <BlankDetailDrawer
          blank={detailBlank}
          assortments={assortments}
          onClose={() => setDetail(null)}
          onChanged={load}
        />
      )}

      {/* BULK BAR */}
      {selected.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 ax-card px-4 py-3 shadow-xl flex items-center gap-3 flex-wrap max-w-[95vw]">
          <span className="text-[13px] font-semibold tabular-nums">{selected.length} selected</span>
          <button
            onClick={() => setAssortPicker("add")}
            disabled={busy}
            className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5"
          ><FolderPlus className="h-3.5 w-3.5" /> Add to assortment</button>
          <button
            onClick={() => setAssortPicker("remove")}
            disabled={busy}
            className="h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5"
          ><Trash2 className="h-3.5 w-3.5" /> Remove from</button>
          <button
            onClick={() => setPricingOpen(true)}
            disabled={busy}
            className="h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5"
          ><DollarSign className="h-3.5 w-3.5" /> Pricing</button>
          <select
            onChange={(e) => { if (e.target.value) bulkAvailability(e.target.value as BlankAvailability); e.target.value = ""; }}
            disabled={busy}
            defaultValue=""
            className="h-8 rounded-lg border border-[hsl(var(--ax-border))] bg-card text-foreground text-[12px] px-2"
          >
            <option value="">Set availability…</option>
            {BLANK_AVAILABILITIES.map((a) => (
              <option key={a} value={a}>{formatAvailability(a)}</option>
            ))}
          </select>
          <button onClick={() => setSelected([])} className="text-muted-foreground hover:text-foreground" aria-label="Clear">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {pricingOpen && (
        <BulkPricingDialog
          blanks={blanks.filter((b) => selected.includes(b.id))}
          onClose={() => setPricingOpen(false)}
          onDone={async () => { setPricingOpen(false); await load(); }}
        />
      )}

      <BlankFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />

      {assortPicker && (
        <AssortmentPicker
          mode={assortPicker}
          assortments={assortments}
          count={selected.length}
          busy={busy}
          orgId={orgId}
          onPick={(a) => applyAssortment(a, assortPicker)}
          onCreated={load}
          onClose={() => setAssortPicker(null)}
        />
      )}
    </div>
  );
}

// ---- Filters --------------------------------------------------------------

function Chips({ options, value, onChange, labelOf }: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  labelOf?: (v: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cn(
              "text-[11px] font-semibold rounded-full px-2.5 py-1 border",
              on
                ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                : "border-[hsl(var(--ax-border))] text-muted-foreground",
            )}
          >{labelOf ? labelOf(o) : o}</button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function FilterPanel({ filters, setFilters, facets, assortments, onClose }: {
  filters: CatalogFilters;
  setFilters: React.Dispatch<React.SetStateAction<CatalogFilters>>;
  facets: { categories: string[]; brands: string[] };
  assortments: Assortment[];
  onClose: () => void;
}) {
  return (
    <div className="ax-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold">Filters</span>
        <button onClick={onClose} className="text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Category">
          <Chips
            options={facets.categories}
            value={filters.categories ?? []}
            onChange={(categories) => setFilters((f) => ({ ...f, categories }))}
            labelOf={prettyCategory}
          />
        </Field>
        <Field label="Audience / assortment">
          <Chips
            options={assortments.map((a) => a.key)}
            value={filters.assortments ?? []}
            onChange={(a) => setFilters((f) => ({ ...f, assortments: a }))}
            labelOf={(k) => assortments.find((a) => a.key === k)?.name ?? k}
          />
        </Field>
        <Field label="Brand">
          <Chips
            options={facets.brands}
            value={filters.brands ?? []}
            onChange={(brands) => setFilters((f) => ({ ...f, brands }))}
          />
        </Field>
        <Field label="Photography">
          <Chips
            options={["complete", "missing"]}
            value={filters.media ? [filters.media] : []}
            onChange={(v) => setFilters((f) => ({ ...f, media: (v[v.length - 1] as "complete" | "missing") ?? null }))}
          />
        </Field>
        <Field label="Status">
          <Chips
            options={["active", "inactive"]}
            value={filters.status ? [filters.status] : []}
            onChange={(v) => setFilters((f) => ({ ...f, status: (v[v.length - 1] as "active" | "inactive") ?? null }))}
          />
        </Field>
        <Field label="Price tier & range">
          <div className="flex items-center gap-1.5">
            <select
              value={filters.priceTier ?? "standard"}
              onChange={(e) => setFilters((f) => ({ ...f, priceTier: e.target.value as PriceTier }))}
              className="h-8 rounded-lg border border-[hsl(var(--ax-border))] bg-card text-foreground px-2 text-[12px]"
            >
              {PRICE_TIERS.map((t) => <option key={t.tier} value={t.tier}>{t.label}</option>)}
            </select>
            <Input
              value={filters.minPrice ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value === "" ? null : Number(e.target.value) }))}
              placeholder="min" inputMode="decimal" className="h-8 w-16 text-[12px]"
            />
            <Input
              value={filters.maxPrice ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value === "" ? null : Number(e.target.value) }))}
              placeholder="max" inputMode="decimal" className="h-8 w-16 text-[12px]"
            />
          </div>
        </Field>
      </div>
    </div>
  );
}

// ---- Assortments ----------------------------------------------------------

function AssortmentsView({
  assortments, blanks, orgId, onChanged, onOpenBlank, previewKey, setPreviewKey,
}: {
  assortments: Assortment[];
  blanks: PricedCatalogBlank[];
  orgId: string | null;
  onChanged: () => void;
  onOpenBlank: (id: string) => void;
  previewKey: string | null;
  setPreviewKey: (k: string | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const open = assortments.find((a) => a.key === previewKey) ?? null;

  if (open) {
    const preview = previewFor(open, blanks);
    const sections = groupByCategory(preview.blanks);
    const avg = preview.blanks.length
      ? preview.blanks.reduce((s, b) => s + (b.prices[preview.tier] ?? 0), 0) / preview.blanks.length
      : 0;

    return (
      <div className="space-y-5">
        <button onClick={() => setPreviewKey(null)} className="text-[13px] text-muted-foreground hover:text-foreground">
          ← All assortments
        </button>
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold">{open.name}</h2>
            <p className="text-[13px] text-muted-foreground">
              {preview.blanks.length} blanks · avg {formatMoney(avg || null)} at the {preview.tier} tier
            </p>
          </div>
          <span className="text-[11px] uppercase tracking-wider text-[hsl(var(--ax-accent))] inline-flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" /> Previewing as this audience
          </span>
        </div>

        {sections.map((s) => (
          <section key={s.category} className="space-y-2">
            <h3 className="ax-section-header">{prettyCategory(s.category)} ({s.blanks.length})</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {s.blanks.map((b) => (
                <button key={b.id} onClick={() => onOpenBlank(b.id)} className="ax-card p-2 text-left">
                  <span className="block aspect-square rounded-md overflow-hidden bg-[hsl(var(--ax-line))]">
                    {b.primaryImage
                      ? <img src={b.primaryImage} alt="" loading="lazy" className="h-full w-full object-cover" />
                      : <span className="h-full w-full flex items-center justify-center"><ImageOff className="h-4 w-4 text-[hsl(var(--ax-faint))]" /></span>}
                  </span>
                  <div className="mt-1.5 text-[12px] font-semibold truncate">{b.name}</div>
                  <div className="text-[11px] text-[hsl(var(--ax-accent))] tabular-nums">
                    {formatMoney(b.prices[preview.tier])}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
        {preview.blanks.length === 0 && (
          <p className="text-[13px] text-muted-foreground">
            Nothing in this assortment yet. Select blanks in the Catalog view and use “Add to assortment”.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground max-w-[75ch]">
        An assortment is a reusable group of blanks offered to an audience. Membership answers who can USE a blank —
        what they PAY is the pricing tier, kept separate on purpose so a premium blank can be athlete-only while still
        carrying every price.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {assortments.map((a) => {
          const members = blanks.filter((b) => b.assortments.includes(a.key));
          const thumbs = members.map((b) => b.primaryImage).filter(Boolean).slice(0, 4) as string[];
          return (
            <button key={a.id} onClick={() => setPreviewKey(a.key)} className="ax-card-hover p-3 text-left">
              <span className="grid grid-cols-2 gap-1 h-24 rounded-lg overflow-hidden">
                {thumbs.length
                  ? thumbs.map((t, i) => (
                      <span key={i} className={cn("block bg-[hsl(var(--ax-line))]", thumbs.length === 1 && "col-span-2")}>
                        <img src={t} alt="" className="h-full w-full object-cover" />
                      </span>
                    ))
                  : <span className="col-span-2 bg-[hsl(var(--ax-line))]" />}
              </span>
              <div className="mt-2 font-bold text-[14px]">{a.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {members.length} blanks{a.default_price_tier ? ` · pays ${a.default_price_tier}` : ""}
              </div>
            </button>
          );
        })}

        {creating ? (
          <div className="ax-card p-3 space-y-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Camp Catalog" className="h-9 text-[13px]" autoFocus />
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!orgId || name.trim().length < 2) return;
                  try {
                    await createAssortment({ organization_id: orgId, name });
                    setName(""); setCreating(false); onChanged();
                  } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
                }}
                className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold"
              >Create</button>
              <button onClick={() => setCreating(false)} className="h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px]">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="ax-card p-3 border-dashed flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-[hsl(var(--ax-accent))] min-h-[160px]"
          >
            <Plus className="h-5 w-5" />
            <span className="text-[13px] font-semibold">New assortment</span>
          </button>
        )}
      </div>
    </div>
  );
}

function AssortmentPicker({ mode, assortments, count, busy, onPick, onClose }: {
  mode: "add" | "remove";
  assortments: Assortment[];
  count: number;
  busy: boolean;
  orgId: string | null;
  onPick: (a: Assortment) => void;
  onCreated: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-sm ax-card p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold">
          {mode === "add" ? "Add" : "Remove"} {count} blank{count === 1 ? "" : "s"} {mode === "add" ? "to" : "from"}
        </h3>
        <div className="space-y-1.5">
          {assortments.map((a) => (
            <button
              key={a.id}
              onClick={() => onPick(a)}
              disabled={busy}
              className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent))] text-left"
            >
              <Check className="h-4 w-4 text-[hsl(var(--ax-accent))] shrink-0" />
              <span className="text-[13px] font-semibold">{a.name}</span>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="w-full h-9 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---- Pricing summary ------------------------------------------------------

/**
 * Where the prices on this screen are actually coming from.
 *
 * Worth stating plainly: every blank in the database currently carries a
 * hand-set price, so the margin rules aren't driving anything yet. Without this
 * strip the rules look live while quietly deciding nothing — the same trap that
 * had the catalogue and the old pricing sheet quoting different numbers.
 */
function PricingSummary({ blanks, tier }: { blanks: PricedCatalogBlank[]; tier: PriceTier }) {
  const pinned = blanks.filter((b) => b.overrides[tier] != null);
  const priced = blanks.filter((b) => b.prices[tier] != null);
  const avgMargin = priced.length
    ? priced.reduce((s, b) => s + (b.margins[tier] ?? 0), 0) / priced.length
    : null;
  const gap = pinned
    .filter((b) => b.computed[tier] != null)
    .reduce((s, b) => s + (b.prices[tier]! - b.computed[tier]!), 0);

  return (
    <div className="ax-card p-3 flex items-center gap-6 flex-wrap text-[12px]">
      <Stat label="Priced" value={`${priced.length} of ${blanks.length}`} />
      <Stat label={`Avg margin (${tier})`} value={formatPercent(avgMargin)} />
      <Stat
        label="Set by hand"
        value={`${pinned.length}`}
        tone={pinned.length > 0 ? "accent" : undefined}
      />
      {pinned.length > 0 && (
        <span className="text-[11px] text-muted-foreground max-w-[46ch]">
          {pinned.length === blanks.length ? "Every price here was typed, not computed" : "Some prices were typed, not computed"} —
          the margin rules aren't deciding them. Together they sit {formatMoney(Math.abs(gap / pinned.length))}{" "}
          {gap < 0 ? "below" : "above"} what the rules would charge, on average. Select them and use Pricing → Follow the
          margin rule to hand them back.
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "accent" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))]">{label}</div>
      <div className={cn("text-lg font-bold tabular-nums", tone === "accent" && "text-[hsl(var(--ax-accent))]")}>
        {value}
      </div>
    </div>
  );
}

// ---- Bulk pricing ---------------------------------------------------------

/**
 * Two operations, because there are only two honest ones.
 *
 * "Follow the margin rule" clears hand-entered prices so the selection tracks
 * cost again — the fix for a batch someone priced by hand months ago and never
 * revisited. "Pin to one price" is the flat-price case (every tee $35 for a
 * camp). Margin itself is not editable here: it belongs to the rule, and a
 * per-blank copy would be a second source of truth for the same number.
 */
function BulkPricingDialog({ blanks, onClose, onDone }: {
  blanks: PricedCatalogBlank[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [tiers, setTiers] = useState<PriceTier[]>(["standard", "athlete", "corporate"]);
  const [mode, setMode] = useState<"computed" | "fixed">("computed");
  const [fixed, setFixed] = useState("");
  const [busy, setBusy] = useState(false);

  const pinned = blanks.filter((b) => tiers.some((t) => b.overrides[t] != null)).length;
  const amount = Number(fixed);
  const valid = mode === "computed" || (Number.isFinite(amount) && amount > 0);

  async function run() {
    if (!valid || tiers.length === 0) return;
    setBusy(true);
    try {
      const n = await bulkPrice(blanks, tiers, mode, mode === "fixed" ? amount : null);
      toast.success(
        mode === "computed"
          ? `${n} blank${n === 1 ? "" : "s"} back on the margin rule`
          : `${n} blank${n === 1 ? "" : "s"} pinned to ${formatMoney(amount)}`,
      );
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md ax-card p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-bold">Pricing · {blanks.length} blank{blanks.length === 1 ? "" : "s"}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {pinned > 0
              ? `${pinned} of them currently carry a hand-set price.`
              : "All of them currently follow the margin rule."}
          </p>
        </div>

        <Field label="Tiers">
          <Chips
            options={PRICE_TIERS.map((t) => t.tier)}
            value={tiers}
            onChange={(v) => setTiers(v as PriceTier[])}
            labelOf={(t) => PRICE_TIERS.find((x) => x.tier === t)?.label ?? t}
          />
        </Field>

        <div className="space-y-2">
          {([
            ["computed", "Follow the margin rule", "Clears any hand-set price. Prices track cost from here on."],
            ["fixed", "Pin to one price", "Every selected blank charges the same, at the tiers above."],
          ] as const).map(([key, title, blurb]) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={cn(
                "w-full text-left p-3 rounded-lg border transition-colors",
                mode === key
                  ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]"
                  : "border-[hsl(var(--ax-border))]",
              )}
            >
              <div className="text-[13px] font-semibold">{title}</div>
              <div className="text-[11px] text-muted-foreground">{blurb}</div>
              {key === "fixed" && mode === "fixed" && (
                <Input
                  value={fixed}
                  onChange={(e) => setFixed(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="35.00"
                  inputMode="decimal"
                  autoFocus
                  className="h-8 mt-2 w-28 text-[13px]"
                />
              )}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={run}
            disabled={busy || !valid || tiers.length === 0}
            className="flex-1 h-9 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[13px] font-bold disabled:opacity-50"
          >{busy ? "Applying…" : "Apply"}</button>
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function MediaCoverage({ blanks, onOpen }: { blanks: PricedCatalogBlank[]; onOpen: (id: string) => void }) {
  const sorted = [...blanks].sort((a, b) => a.mediaPercent - b.mediaPercent);
  return (
    <div className="ax-card divide-y divide-[hsl(var(--ax-border))] p-0">
      {sorted.map((b) => (
        <button key={b.id} onClick={() => onOpen(b.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[hsl(var(--ax-line)/0.5)]">
          <span className="h-9 w-9 shrink-0 rounded overflow-hidden bg-[hsl(var(--ax-line))]">
            {b.primaryImage && <img src={b.primaryImage} alt="" loading="lazy" className="h-full w-full object-cover" />}
          </span>
          <span className="w-24 shrink-0 text-[12px] font-mono text-muted-foreground">{b.sku ?? "—"}</span>
          <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">{b.name}</span>
          <span className="w-28 shrink-0">
            <span className="block h-1.5 rounded-full bg-[hsl(var(--ax-line))] overflow-hidden">
              <span
                className={cn("block h-full", b.mediaComplete ? "bg-[hsl(var(--ax-accent))]" : "bg-amber-500")}
                style={{ width: `${b.mediaPercent}%` }}
              />
            </span>
          </span>
          <span className="w-10 text-right text-[11px] tabular-nums">{b.mediaPercent}%</span>
        </button>
      ))}
    </div>
  );
}
