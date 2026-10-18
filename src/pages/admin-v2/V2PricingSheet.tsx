// Pricing sheet — every number behind one client's products, editable in place.
//
// Organised the way cost works: by BLANK and PRINT (front only / front + back).
// Presets per blank (blank cost, front print, back print) fill every product on
// that blank; a cell typed on a row overrides its preset. Cells select like a
// spreadsheet — click, drag, shift-click, ⌘/Ctrl-click, or a column header —
// and one value fills them all. Saving writes the real records: the bulk price
// here is what the client's portal orders are charged.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, Loader2, RotateCcw, X } from "lucide-react";
import { Chip, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";
import { useEntityWorkspace } from "@/lib/v2/data";
import { fmtMoney } from "@/lib/v2/pricing";
import { EMPTY_TERMS, brandTermsError, useSaveBrandTerms, type BrandTerms } from "@/lib/v2/brand-terms";
import {
  EMPTY_PRESET,
  FIELD_LABEL,
  NUMBER_FIELDS,
  SIDES_LABEL,
  arrangeRows,
  cellKey,
  cellRange,
  changedFields,
  draftOf,
  fillCells,
  parseCell,
  presetCosts,
  presetError,
  rowError,
  rowMaths,
  usePricingSheet,
  useSavePricingSheet,
  type BlankPreset,
  type GroupBy,
  type NumberField,
  type PrintSides,
  type RowDraft,
  type SheetProduct,
  type SortBy,
} from "@/lib/v2/pricing-sheet";

const btn =
  "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50";

const money = (n: number | null | undefined) => (n == null ? "—" : fmtMoney(n));
const pctText = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);
const isPct = (f: NumberField) => f === "sharePercent";

const GROUP_OPTIONS: Array<{ key: GroupBy; label: string }> = [
  { key: "blank", label: "Blank" },
  { key: "blank_print", label: "Blank + print" },
  { key: "print", label: "Print" },
  { key: "none", label: "None" },
];
const SORT_OPTIONS: Array<{ key: SortBy; label: string }> = [
  { key: "print", label: "Print (front first)" },
  { key: "blank", label: "Blank" },
  { key: "product", label: "Product name" },
  { key: "cost", label: "Cost (low → high)" },
  { key: "ax", label: "AX $ per sale (best first)" },
  { key: "bulk", label: "Bulk $ (best first)" },
];

/** A number box that keeps what is typed ("1." stays "1.") and reports a number, null or NaN. */
function NumInput({
  value,
  placeholder,
  onChange,
  prefix = "$",
  invalid,
  inputRef,
  onEnter,
  width = "w-14",
}: {
  value: number | null;
  placeholder?: string;
  onChange: (v: number | null) => void;
  prefix?: "$" | "%";
  invalid?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  onEnter?: () => void;
  width?: string;
}) {
  const [text, setText] = useState(value == null || Number.isNaN(value) ? "" : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value == null || Number.isNaN(value) ? "" : String(value));
  }, [value, focused]);
  return (
    <label
      className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-1 text-[12px] ${
        invalid ? "border-[hsl(var(--ax-red))]" : "border-[hsl(var(--ax-border))]"
      } focus-within:border-[hsl(var(--ax-accent))]`}
    >
      {prefix === "$" && <span className="text-[hsl(var(--ax-faint))]">$</span>}
      <input
        ref={inputRef}
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
        }}
        onChange={(e) => {
          const v = e.target.value.replace(/[$,%\s]/g, "");
          setText(v);
          onChange(v === "" ? null : Number(v));
        }}
        className={`${width} min-w-0 bg-transparent tabular-nums outline-none placeholder:text-[hsl(var(--ax-faint))]`}
      />
      {prefix === "%" && <span className="text-[hsl(var(--ax-faint))]">%</span>}
    </label>
  );
}

function Th({ children, right, title, onClick }: { children: ReactNode; right?: boolean; title?: string; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <th
      title={title}
      onClick={onClick}
      className={`select-none whitespace-nowrap px-2 py-2 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--ax-faint))] ${
        right ? "text-right" : "text-left"
      } ${onClick ? "cursor-pointer hover:text-[hsl(var(--ax-ink))]" : ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, right, strong, tone }: { children: ReactNode; right?: boolean; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <td
      className={`whitespace-nowrap px-2 py-1.5 text-[12px] tabular-nums ${right ? "text-right" : ""} ${strong ? "font-semibold" : ""} ${
        tone === "bad" ? "text-[hsl(var(--ax-red))]" : tone === "good" ? "text-[hsl(var(--ax-accent))]" : ""
      }`}
    >
      {children}
    </td>
  );
}

/** One selectable number cell. Shows its own value, or the inherited one faintly with where it came from. */
function Cell({
  k,
  value,
  inherited,
  source,
  selected,
  locked,
  percent,
  invalid,
  onDown,
  onEnter,
  onOpen,
}: {
  k: string;
  value: number | null;
  inherited: number | null;
  source: string | null;
  selected: boolean;
  locked?: string;
  percent?: boolean;
  invalid?: boolean;
  onDown: (k: string, e: React.MouseEvent) => void;
  onEnter: (k: string) => void;
  onOpen: (k: string) => void;
}) {
  const shown = value ?? inherited;
  const text = shown == null || Number.isNaN(shown) ? "—" : percent ? `${shown}%` : fmtMoney(shown);
  return (
    <td className="px-1 py-1">
      <div
        role="gridcell"
        aria-selected={selected}
        title={locked ?? (value == null && source ? `From ${source} — type to override` : "Double-click to edit")}
        onMouseDown={(e) => !locked && onDown(k, e)}
        onMouseEnter={() => !locked && onEnter(k)}
        onDoubleClick={() => !locked && onOpen(k)}
        className={`flex min-w-[64px] cursor-cell select-none items-center justify-end gap-1 rounded-md border px-1.5 py-1 text-[12px] tabular-nums ${
          selected
            ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.16)]"
            : invalid
              ? "border-[hsl(var(--ax-red))]"
              : "border-transparent hover:border-[hsl(var(--ax-border))]"
        } ${locked ? "cursor-not-allowed opacity-60" : ""}`}
      >
        {value == null && source && <span className="text-[9px] uppercase tracking-wider text-[hsl(var(--ax-faint))]">{source}</span>}
        <span className={value == null ? "text-[hsl(var(--ax-faint))]" : "font-medium"}>{text}</span>
      </div>
    </td>
  );
}

function SidesToggle({ value, detected, onChange }: { value: PrintSides | null; detected: PrintSides | null; onChange: (v: PrintSides | null) => void }) {
  const current = value ?? detected;
  return (
    <div className="inline-flex overflow-hidden rounded-full border border-[hsl(var(--ax-border))] text-[10.5px]" role="group" aria-label="Print">
      {(["front", "front_back"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(detected === s ? null : s)}
          title={value == null && current === s ? "From the product's pictures" : undefined}
          className={`px-2 py-0.5 ${current === s ? "bg-[hsl(var(--ax-accent))] font-semibold text-[hsl(var(--ax-on-accent))]" : "text-[hsl(var(--ax-secondary))]"}`}
        >
          {s === "front" ? "Front" : "F + B"}
        </button>
      ))}
    </div>
  );
}

export default function V2PricingSheet() {
  const { id } = useParams();
  const entityId = id ?? "";
  const ws = useEntityWorkspace(id);
  const [showArchived, setShowArchived] = useState(false);
  const sheet = usePricingSheet(entityId, showArchived);
  const save = useSavePricingSheet(entityId);
  const saveTerms = useSaveBrandTerms(entityId);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [terms, setTerms] = useState<BrandTerms>(EMPTY_TERMS);
  const [presetDrafts, setPresetDrafts] = useState<Record<string, BlankPreset>>({});
  const [groupBy, setGroupBy] = useState<GroupBy>("blank");
  const [sortBy, setSortBy] = useState<SortBy>("print");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [fillText, setFillText] = useState("");
  const fillRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const entityName = ws.data?.entity?.name ?? "this client";

  const products = useMemo(() => sheet.data?.products ?? [], [sheet.data]);
  const savedTerms = sheet.data?.terms ?? EMPTY_TERMS;
  const savedPresets = useMemo(() => sheet.data?.presets ?? {}, [sheet.data]);
  useEffect(() => {
    if (sheet.data) setTerms(sheet.data.terms);
  }, [sheet.data]);

  const presets = useMemo(() => ({ ...savedPresets, ...presetDrafts }), [savedPresets, presetDrafts]);
  const draft = useCallback((p: SheetProduct): RowDraft => drafts[p.id] ?? draftOf(p), [drafts]);
  const setField = (p: SheetProduct, k: keyof RowDraft, v: RowDraft[keyof RowDraft]) =>
    setDrafts((d) => ({ ...d, [p.id]: { ...(d[p.id] ?? draftOf(p)), [k]: v } }));

  const groups = useMemo(() => arrangeRows(products, drafts, { groupBy, sortBy, terms, presets }), [products, drafts, groupBy, sortBy, terms, presets]);
  const rowOrder = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.id)), [groups]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Blanks this client's products use, for the presets panel.
  const blanks = useMemo(() => {
    const m = new Map<string, { id: string; name: string; catalog: number | null; count: number }>();
    for (const p of products) {
      if (!p.blankId) continue;
      const e = m.get(p.blankId) ?? { id: p.blankId, name: p.blankName ?? "Blank", catalog: p.blankCatalogCost, count: 0 };
      e.count++;
      m.set(p.blankId, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const dirtyRows = products.filter((p) => drafts[p.id] && changedFields(p, drafts[p.id]).length > 0);
  const dirtyPresets = Object.entries(presetDrafts).filter(
    ([k, v]) => JSON.stringify(v) !== JSON.stringify(savedPresets[k] ?? EMPTY_PRESET),
  );
  const termsDirty = JSON.stringify(terms) !== JSON.stringify(savedTerms);
  const errors = dirtyRows.map((p) => rowError(p, drafts[p.id])).filter(Boolean) as string[];
  const presetProblems = dirtyPresets.map(([, v]) => presetError(v)).filter(Boolean);
  const termsProblem = brandTermsError(terms);
  const dirtyCount = dirtyRows.length + dirtyPresets.length + (termsDirty ? 1 : 0);
  const saving = save.isPending || saveTerms.isPending;

  // ---------------------------------------------------------- selection
  const onDown = (k: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (e.shiftKey && anchor) {
      setSelected(new Set(cellRange(anchor, k, rowOrder)));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(k)) n.delete(k);
        else n.add(k);
        return n;
      });
      setAnchor(k);
      return;
    }
    dragging.current = true;
    setAnchor(k);
    setSelected(new Set([k]));
  };
  const onEnter = (k: string) => {
    if (dragging.current && anchor) setSelected(new Set(cellRange(anchor, k, rowOrder)));
  };
  const openEditor = (k: string, initial?: string) => {
    if (!selected.has(k)) {
      setSelected(new Set([k]));
      setAnchor(k);
    }
    const { productId, field } = parseCell(k);
    const p = byId.get(productId);
    const v = p ? draft(p)[field] : null;
    setFillText(initial ?? (v == null ? "" : String(v)));
    requestAnimationFrame(() => fillRef.current?.focus());
  };
  const selectColumn = (field: NumberField, rows: SheetProduct[], add: boolean) => {
    const keys = rows.filter((r) => !(field === "retail" && r.onShopify)).map((r) => cellKey(r.id, field));
    setSelected((s) => new Set(add ? [...s, ...keys] : keys));
    setAnchor(keys[0] ?? null);
  };

  useEffect(() => {
    const up = () => {
      dragging.current = false;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const applyFill = (value: number | null) => {
    if (!selected.size) return;
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      toast.error("Use a positive number.");
      return;
    }
    const r = fillCells(products, drafts, selected, value);
    setDrafts(r.drafts);
    toast.success(
      `${value == null ? "Reset" : "Set"} ${r.filled} cell${r.filled === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} Shopify retail skipped` : ""} — Save when ready.`,
    );
  };

  // Typing a number with cells selected starts the fill; Delete resets them to presets; Esc clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (!selected.size) return;
      if (/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        setFillText(e.key);
        requestAnimationFrame(() => fillRef.current?.focus());
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        applyFill(null);
      } else if (e.key === "Escape") {
        setSelected(new Set());
      } else if (e.key === "Enter") {
        e.preventDefault();
        fillRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const selectedRows = useMemo(() => [...new Set([...selected].map((k) => parseCell(k).productId))], [selected]);
  const selectedFields = useMemo(() => {
    const c: Partial<Record<NumberField, number>> = {};
    for (const k of selected) {
      const f = parseCell(k).field;
      c[f] = (c[f] ?? 0) + 1;
    }
    return c;
  }, [selected]);
  const setSidesForSelected = (s: PrintSides) => {
    setDrafts((d) => {
      const n = { ...d };
      for (const id of selectedRows) {
        const p = byId.get(id);
        if (p) n[id] = { ...(n[id] ?? draftOf(p)), printSides: p.detectedSides === s ? null : s };
      }
      return n;
    });
  };

  // ---------------------------------------------------------- save
  async function saveAll() {
    if (errors.length || termsProblem || presetProblems.length) return;
    try {
      if (termsDirty) await saveTerms.mutateAsync(terms);
      if (dirtyRows.length || dirtyPresets.length) {
        await save.mutateAsync({
          changes: dirtyRows.map((p) => ({ product: p, draft: drafts[p.id] })),
          presets: dirtyPresets.map(([blankId, preset]) => ({ blankId, preset })),
        });
      }
      setDrafts({});
      setPresetDrafts({});
      await sheet.refetch();
      toast.success("Saved. Portal prices and Brand HQ use these numbers now.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    }
  }

  const summary = useMemo(() => {
    const rows = products.map((p) => ({ p, m: rowMaths(p, drafts[p.id] ?? draftOf(p), terms, presets) }));
    const avg = (xs: Array<number | null>) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100 : null;
    };
    return {
      count: rows.length,
      incomplete: rows.filter((r) => r.m.missing.length > 0).length,
      costPct: avg(rows.map((r) => r.m.costPercent)),
      ax: avg(rows.map((r) => r.m.axPerSale)),
      client: avg(rows.map((r) => r.m.clientPerSale)),
      bulk: avg(rows.map((r) => r.m.bulkProfit)),
    };
  }, [products, drafts, terms, presets]);

  const label = (s: string) => <span className="text-[10.5px] uppercase tracking-[0.12em] text-[hsl(var(--ax-faint))]">{s}</span>;

  return (
    <div className="pb-28">
      <Link to={`/admin-v2/people/${entityId}`} className="mb-3 inline-block text-[11px] text-[hsl(var(--ax-faint))]">
        ← {entityName}
      </Link>
      <PageHeader
        title="Pricing sheet"
        subtitle={`Cost by blank and print, retail, ${entityName}'s bulk price and the split. Saving updates what their portal charges.`}
        actions={
          <a className={btn} href={`/portal/analytics?as=${entityId}&guide=money`} target="_blank" rel="noreferrer">
            Their Brand HQ <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        }
      />

      {/* Terms */}
      <div className="ax-card mb-4 grid gap-4 px-3.5 py-3 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-end">
        <div className="grid gap-1">
          {label(`${entityName}'s share`)}
          <NumInput prefix="%" value={terms.revenueSharePercent} placeholder="—" invalid={!!termsProblem} onChange={(v) => setTerms((x) => ({ ...x, revenueSharePercent: v }))} />
        </div>
        <div className="grid gap-1">
          {label("Taken from")}
          <div className="flex gap-1">
            {(["gross", "profit"] as const).map((b) => (
              <Chip key={b} active={terms.splitBasis === b} onClick={() => setTerms((x) => ({ ...x, splitBasis: b }))}>
                {b === "gross" ? "Gross sale" : "Profit after cost"}
              </Chip>
            ))}
          </div>
        </div>
        <label className="grid gap-1">
          {label("How they pay for orders (shown on every order confirmation)")}
          <input
            value={terms.paymentInstructions}
            onChange={(e) => setTerms((x) => ({ ...x, paymentInstructions: e.target.value }))}
            placeholder="e.g. Zelle to payments@athletexclusive.com, or pay the invoice we email you"
            className="rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2.5 py-1.5 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
          />
        </label>
        {termsProblem && <p className="text-[11px] text-[hsl(var(--ax-red))] sm:col-span-3">{termsProblem}</p>}
      </div>

      {/* Presets by blank */}
      {blanks.length > 0 && (
        <div className="ax-card mb-4 px-3.5 py-3">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-[14px] font-semibold">Cost presets</h2>
            <span className="text-[11px] text-[hsl(var(--ax-faint))]">
              Set once per blank. Every product on that blank uses these until a row overrides them.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[hsl(var(--ax-line))]">
                  <Th>Blank</Th>
                  <Th title="Empty uses the catalogue cost">Blank cost</Th>
                  <Th>Front print</Th>
                  <Th>Back print</Th>
                  <Th right>Front only</Th>
                  <Th right>Front + back</Th>
                  <Th right>Products</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[hsl(var(--ax-line))]">
                {blanks.map((b) => {
                  const pre = presets[b.id] ?? EMPTY_PRESET;
                  const set = (k: keyof BlankPreset, v: number | null) =>
                    setPresetDrafts((d) => ({ ...d, [b.id]: { ...(d[b.id] ?? savedPresets[b.id] ?? EMPTY_PRESET), [k]: v } }));
                  const probe = products.find((p) => p.blankId === b.id)!;
                  const f = presetCosts(probe, "front", presets);
                  const fb = presetCosts(probe, "front_back", presets);
                  const tot = (x: { blank: number | null; print: number | null }) => (x.print == null ? null : (x.blank ?? 0) + x.print);
                  return (
                    <tr key={b.id}>
                      <td className="px-2 py-1.5 text-[12px] font-semibold">{b.name}</td>
                      <td className="px-1 py-1.5"><NumInput value={pre.blank} placeholder={b.catalog != null ? String(b.catalog) : "—"} onChange={(v) => set("blank", v)} /></td>
                      <td className="px-1 py-1.5"><NumInput value={pre.front} placeholder="—" invalid={pre.front == null} onChange={(v) => set("front", v)} /></td>
                      <td className="px-1 py-1.5"><NumInput value={pre.back} placeholder="—" onChange={(v) => set("back", v)} /></td>
                      <Td right strong>{money(tot(f))}</Td>
                      <Td right strong>{money(tot(fb))}</Td>
                      <Td right>{b.count}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sheet.isError && <ErrorState error={sheet.error} what="the pricing sheet" onRetry={() => void sheet.refetch()} />}
      {sheet.isLoading && <Skeleton className="h-96" />}
      {sheet.data && products.length === 0 && <EmptyState>No products for {entityName} yet.</EmptyState>}

      {products.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Products", String(summary.count)],
              ["Avg cost % of retail", pctText(summary.costPct)],
              [`${entityName.split(" ")[0]} per sale (avg)`, money(summary.client)],
              ["AX per sale (avg)", money(summary.ax)],
              ["AX per bulk unit (avg)", money(summary.bulk)],
            ].map(([l, v]) => (
              <div key={l} className="ax-card px-3 py-2.5">
                <div className="text-[10.5px] uppercase tracking-[0.1em] text-[hsl(var(--ax-faint))]">{l}</div>
                <div className="mt-0.5 text-[18px] font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>

          {/* Organise */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {label("Group")}
            {GROUP_OPTIONS.map((g) => (
              <Chip key={g.key} active={groupBy === g.key} onClick={() => setGroupBy(g.key)}>
                {g.label}
              </Chip>
            ))}
            <span className="mx-1 h-4 w-px bg-[hsl(var(--ax-line))]" />
            {label("Sort")}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="rounded-full border border-[hsl(var(--ax-border))] bg-transparent px-3 py-1 text-[12px] outline-none"
              aria-label="Sort"
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="flex-1" />
            <Chip active={showArchived} onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Including archived" : "Live only"}
            </Chip>
          </div>
          <p className="mb-3 text-[11px] text-[hsl(var(--ax-faint))]">
            Click a cell, drag across cells, shift-click for a range, ⌘/Ctrl-click to add one, or click a column name to select it. Then type a
            number. Delete resets cells back to their preset.
          </p>
          {summary.incomplete > 0 && (
            <p className="mb-3 flex items-center gap-1.5 text-[12px] text-[hsl(var(--ax-amber))]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {summary.incomplete} of {summary.count} rows are missing a print type, print cost, retail or share. Their margins are partial until filled.
            </p>
          )}

          {groups.map((g) => {
            const pre = g.blankId ? presets[g.blankId] : null;
            const head = (field: NumberField, text: string, title?: string) => (
              <Th title={title ?? `Select every ${FIELD_LABEL[field].toLowerCase()} in this group (shift to add)`} onClick={(e) => selectColumn(field, g.rows, e.shiftKey || e.metaKey || e.ctrlKey)}>
                {text}
              </Th>
            );
            return (
              <section key={g.key} className="mb-6">
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <h2 className="text-[14px] font-semibold">
                    {g.label} <span className="text-[hsl(var(--ax-faint))]">{g.rows.length}</span>
                  </h2>
                  {pre && (
                    <span className="text-[11px] text-[hsl(var(--ax-faint))]">
                      Presets: front {money(pre.front)} · back {money(pre.back)}
                    </span>
                  )}
                </div>
                <div className="ax-card overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead className="border-b border-[hsl(var(--ax-line))]">
                      <tr>
                        <Th>Print</Th>
                        <Th>Blank · product</Th>
                        {head("blankCost", "Blank", "Blank cost — empty uses the preset / catalogue cost")}
                        {head("printCost", "Print", "Print cost — empty uses front (+ back) presets")}
                        {head("otherCost", "Other", "Packaging, labels, labour")}
                        <Th right>Cost</Th>
                        {head("retail", "Retail", "What a fan pays (internal products only)")}
                        <Th right>Cost %</Th>
                        {head("sharePercent", "Share", "Empty uses the client's share above")}
                        <Th right title="Client's take per store sale">Client $</Th>
                        <Th right title="AX's take per store sale, after cost and the client's share">AX $</Th>
                        <Th right>AX %</Th>
                        {head("athletePrice", "Bulk price", "What the client pays per unit on a bulk order. Empty uses the rule.")}
                        <Th right title="AX profit per bulk unit">Bulk $</Th>
                        <Th right>Bulk %</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--ax-line))]">
                      {g.rows.map((p) => {
                        const d = draft(p);
                        const m = rowMaths(p, d, terms, presets);
                        const err = rowError(p, d);
                        const dirty = !!drafts[p.id] && changedFields(p, drafts[p.id]).length > 0;
                        const cell = (field: NumberField, inherited: number | null, source: string | null, extra?: { locked?: string; invalid?: boolean }) => {
                          const k = cellKey(p.id, field);
                          return (
                            <Cell
                              key={field}
                              k={k}
                              value={d[field]}
                              inherited={inherited}
                              source={source}
                              selected={selected.has(k)}
                              percent={isPct(field)}
                              onDown={onDown}
                              onEnter={onEnter}
                              onOpen={(key) => openEditor(key)}
                              {...extra}
                            />
                          );
                        };
                        const pr = presetCosts(p, m.sides, presets);
                        return (
                          <tr key={p.id} className={dirty ? "bg-[hsl(var(--ax-accent)/0.05)]" : undefined}>
                            <td className="px-2 py-1.5">
                              <SidesToggle value={d.printSides} detected={p.detectedSides} onChange={(v) => setField(p, "printSides", v)} />
                            </td>
                            <td className="max-w-[240px] px-2 py-1.5 text-[12px]">
                              <span className="block truncate font-semibold">{p.blankName ?? "No blank linked"}</span>
                              <Link to={`/admin-v2/products/${p.id}`} className="block truncate text-[11px] text-[hsl(var(--ax-faint))] hover:underline" title={p.title}>
                                {p.title}
                              </Link>
                              {(err || p.onShopify || p.status === "archived") && (
                                <span className="block truncate text-[10px] text-[hsl(var(--ax-faint))]">
                                  {[p.onShopify ? "On Shopify" : null, p.status === "archived" ? "Archived" : null].filter(Boolean).join(" · ")}
                                  {err && <span className="ml-1 text-[hsl(var(--ax-red))]">{err}</span>}
                                </span>
                              )}
                            </td>
                            {cell("blankCost", pr.blank, pr.blank != null ? (p.blankId && presets[p.blankId]?.blank != null ? "preset" : "catalog") : null)}
                            {cell("printCost", pr.print, pr.print != null ? "preset" : null, { invalid: m.printCost == null })}
                            {cell("otherCost", null, null)}
                            <Td right strong>{money(m.totalCost)}</Td>
                            {cell("retail", null, null, { locked: p.onShopify ? "Retail is set in Shopify for this product" : undefined, invalid: d.retail == null })}
                            <Td right tone={m.costPercent != null && m.costPercent > 50 ? "bad" : undefined}>{pctText(m.costPercent)}</Td>
                            {cell("sharePercent", terms.revenueSharePercent, terms.revenueSharePercent != null ? "terms" : null)}
                            <Td right>{money(m.clientPerSale)}</Td>
                            <Td right strong tone={m.axPerSale != null && m.axPerSale < 0 ? "bad" : undefined}>{money(m.axPerSale)}</Td>
                            <Td right>{pctText(m.axMarginPercent)}</Td>
                            {cell("athletePrice", p.ruleAthletePrice, "rule")}
                            <Td right tone={m.bulkProfit != null && m.bulkProfit < 0 ? "bad" : undefined}>{money(m.bulkProfit)}</Td>
                            <Td right>{pctText(m.bulkMarginPercent)}</Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
          <p className="text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
            Cost = blank + print + other. Print = front preset, plus the back preset when printed front and back. AX $ = retail − cost − the
            client's share. Bulk $ = bulk price − cost, before the volume discount. Costs are private to AX; the client only sees their bulk price
            and retail.
          </p>
        </>
      )}

      {/* Fill bar: appears with a selection. */}
      {selected.size > 0 && (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-[hsl(var(--ax-accent)/0.5)] bg-[hsl(var(--ax-card))] px-4 py-2.5 shadow-lg">
          <form
            className="mx-auto flex max-w-6xl flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              applyFill(fillText.trim() === "" ? null : Number(fillText.replace(/[$,%\s]/g, "")));
            }}
          >
            <span className="text-[13px] font-semibold">
              {selected.size} cell{selected.size === 1 ? "" : "s"}
            </span>
            <span className="text-[11px] text-[hsl(var(--ax-faint))]">
              {Object.entries(selectedFields)
                .map(([f, n]) => `${FIELD_LABEL[f as NumberField]} ×${n}`)
                .join(" · ")}
            </span>
            <input
              ref={fillRef}
              inputMode="decimal"
              value={fillText}
              onChange={(e) => setFillText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSelected(new Set());
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Value for all"
              className="w-28 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2.5 py-1.5 text-[13px] tabular-nums outline-none focus:border-[hsl(var(--ax-accent))]"
            />
            <button type="submit" className={btnPrimary}>
              Set {selected.size}
            </button>
            <button type="button" className={btn} onClick={() => applyFill(null)} title="Clear these cells so they use their preset again">
              Use preset
            </button>
            <span className="mx-1 h-4 w-px bg-[hsl(var(--ax-line))]" />
            <span className="text-[11px] text-[hsl(var(--ax-faint))]">
              Print for {selectedRows.length} row{selectedRows.length === 1 ? "" : "s"}:
            </span>
            {(["front", "front_back"] as const).map((s) => (
              <button key={s} type="button" className={btn} onClick={() => setSidesForSelected(s)}>
                {SIDES_LABEL[s]}
              </button>
            ))}
            <span className="flex-1" />
            <button type="button" className={btn} onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}

      {dirtyCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-4 py-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <span className="text-[13px]">
              {dirtyCount} change{dirtyCount === 1 ? "" : "s"} not saved
              {(errors.length > 0 || presetProblems.length > 0) && (
                <span className="ml-2 text-[hsl(var(--ax-red))]">· fix {errors.length + presetProblems.length} first</span>
              )}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              className={btn}
              onClick={() => {
                setDrafts({});
                setPresetDrafts({});
                setTerms(savedTerms);
              }}
              disabled={saving}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Discard
            </button>
            <button type="button" className={btnPrimary} onClick={() => void saveAll()} disabled={saving || errors.length > 0 || !!termsProblem || presetProblems.length > 0}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
