// Pricing sheet — every number behind one client's products, editable in place.
//
// Top: the C-level breakdown, per blank. Two layers on every line — what it
// truly costs AX, and what AX charges the client — so the margin on the blank,
// the front print, the back print and services is visible line by line, and the
// store sale shows how the profit after the client's cost splits.
//
// Below: every product, organised by blank and print (front / front + back).
// Presets fill each row; a typed cell overrides its preset. Cells select like a
// spreadsheet — click, drag, shift-click, ⌘/Ctrl-click, or a column name — and
// one value fills them all. Save writes the real records, including the client
// price the portal charges (products.athlete_price).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, Loader2, RotateCcw, X } from "lucide-react";
import { Chip, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";
import { useEntityWorkspace } from "@/lib/v2/data";
import { fmtMoney } from "@/lib/v2/pricing";
import { EMPTY_TERMS, brandTermsError, useSaveBrandTerms, type BrandTerms } from "@/lib/v2/brand-terms";
import {
  COMPONENTS,
  COMPONENT_LABEL,
  FIELD_LABEL,
  SIDES_LABEL,
  arrangeRows,
  cellKey,
  cellRange,
  changedFields,
  draftOf,
  emptyPreset,
  fillCells,
  parseCell,
  presetBreakdown,
  presetCosts,
  presetError,
  rowError,
  rowMaths,
  usePricingSheet,
  useSavePricingSheet,
  type BlankPreset,
  type Component,
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
  { key: "cost", label: "True cost (low → high)" },
  { key: "unit", label: "AX per unit (best first)" },
  { key: "ax", label: "AX per store sale (best first)" },
];

/** The most common retail among some products — the price a breakdown is shown at. */
function typicalRetail(rows: SheetProduct[]): number | null {
  const counts = new Map<number, number>();
  for (const r of rows) if (r.retail != null) counts.set(r.retail, (counts.get(r.retail) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

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

/** One blank's C-level breakdown: cost vs client price per line, the totals, and a store sale. */
function BlankEconomics({
  blank,
  preset,
  onChange,
  retail,
  terms,
  clientName,
}: {
  blank: { id: string; name: string; catalog: number | null; count: number; sides: PrintSides[] };
  preset: BlankPreset;
  onChange: (c: Component, k: "cost" | "price", v: number | null) => void;
  retail: number | null;
  terms: BrandTerms;
  clientName: string;
}) {
  const first = clientName.split(" ")[0] || "Client";
  const fb = presetBreakdown(preset, "front_back", blank.catalog);
  const f = presetBreakdown(preset, "front", blank.catalog);
  const totals: Array<{ sides: PrintSides; b: typeof fb }> = [
    { sides: "front", b: f },
    { sides: "front_back", b: fb },
  ];
  const share = terms.revenueSharePercent;
  const sale = (b: typeof fb) => {
    if (retail == null || b.price == null || share == null) return null;
    const profit = Math.round((retail - b.price) * 100) / 100;
    const client = terms.splitBasis === "gross" ? Math.round(retail * share) / 100 : Math.round(Math.max(0, profit) * share) / 100;
    const axSplit = terms.splitBasis === "gross" ? null : Math.round((profit - client) * 100) / 100;
    const axTotal = b.cost == null ? null : Math.round((retail - b.cost - client) * 100) / 100;
    return { profit, client, axSplit, axTotal };
  };
  return (
    <div className="ax-card min-w-0 px-3.5 py-3">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h3 className="text-[14px] font-semibold">{blank.name}</h3>
        <span className="text-[11px] text-[hsl(var(--ax-faint))]">
          {blank.count} product{blank.count === 1 ? "" : "s"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[hsl(var(--ax-line))]">
              <Th>Line</Th>
              <Th title="What it truly costs AX">Our cost</Th>
              <Th title={`What AX charges ${first}`}>Client price</Th>
              <Th right>AX makes</Th>
              <Th right>Margin</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--ax-line))]">
            {COMPONENTS.map((c) => {
              const line = fb.lines.find((l) => l.component === c)!;
              return (
                <tr key={c}>
                  <td className="px-2 py-1.5 text-[12px] font-medium">
                    {COMPONENT_LABEL[c]}
                    {c === "back" && <span className="block text-[10px] text-[hsl(var(--ax-faint))]">added when printed front + back</span>}
                  </td>
                  <td className="px-1 py-1.5">
                    <NumInput value={preset[c].cost} placeholder={c === "blank" && blank.catalog != null ? String(blank.catalog) : "—"} onChange={(v) => onChange(c, "cost", v)} />
                  </td>
                  <td className="px-1 py-1.5">
                    <NumInput value={preset[c].price} placeholder="—" invalid={c === "blank" && preset.blank.price == null} onChange={(v) => onChange(c, "price", v)} />
                  </td>
                  <Td right tone={line.margin != null && line.margin < 0 ? "bad" : undefined}>{money(line.margin)}</Td>
                  <Td right>{line.margin != null && line.price ? pctText(Math.round((line.margin / line.price) * 1000) / 10) : "—"}</Td>
                </tr>
              );
            })}
          </tbody>
          <tbody className="border-t-2 border-[hsl(var(--ax-line))]">
            {totals
              .filter((t) => blank.sides.includes(t.sides) || blank.sides.length === 0)
              .map(({ sides, b }) => (
                <tr key={sides}>
                  <td className="px-2 py-1.5 text-[12px] font-semibold">{SIDES_LABEL[sides]} total</td>
                  <Td strong>{money(b.cost)}</Td>
                  <Td strong>{money(b.price)}</Td>
                  <Td right strong tone={b.margin != null ? (b.margin < 0 ? "bad" : "good") : undefined}>{money(b.margin)}</Td>
                  <Td right>{pctText(b.marginPercent)}</Td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {retail != null && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {totals
            .filter((t) => blank.sides.includes(t.sides) || blank.sides.length === 0)
            .map(({ sides, b }) => {
              const s = sale(b);
              return (
                <div key={sides} className="rounded-lg border border-[hsl(var(--ax-line))] px-3 py-2 text-[12px]">
                  <div className="mb-1 text-[10.5px] uppercase tracking-[0.1em] text-[hsl(var(--ax-faint))]">
                    {SIDES_LABEL[sides]} · {money(retail)} store sale
                  </div>
                  {s ? (
                    <div className="grid gap-0.5 tabular-nums">
                      <div className="flex justify-between"><span>Fan pays</span><b>{money(retail)}</b></div>
                      <div className="flex justify-between text-[hsl(var(--ax-secondary))]"><span>{first}'s cost</span><span>−{money(b.price)}</span></div>
                      {terms.splitBasis !== "gross" && <div className="flex justify-between"><span>Profit</span><b>{money(s.profit)}</b></div>}
                      <div className="flex justify-between text-[hsl(var(--ax-accent))]">
                        <span>{first} keeps {terms.splitBasis === "gross" ? `${share}% of retail` : `${share}%`}</span>
                        <b>{money(s.client)}</b>
                      </div>
                      {s.axSplit != null && <div className="flex justify-between"><span>AX split ({100 - share!}%)</span><span>{money(s.axSplit)}</span></div>}
                      <div className="mt-1 flex justify-between border-t border-[hsl(var(--ax-line))] pt-1">
                        <span>AX total{b.margin != null && s.axSplit != null ? ` (${money(b.margin)} unit + ${money(s.axSplit)} split)` : ""}</span>
                        <b>{money(s.axTotal)}</b>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[hsl(var(--ax-faint))]">Set the blank's client price and the split to see this sale.</p>
                  )}
                </div>
              );
            })}
        </div>
      )}
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
  const first = entityName.split(" ")[0] || "Client";

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
  const setPresetLine = (blankId: string, c: Component, k: "cost" | "price", v: number | null) =>
    setPresetDrafts((d) => {
      const base = d[blankId] ?? savedPresets[blankId] ?? emptyPreset();
      return { ...d, [blankId]: { ...base, [c]: { ...base[c], [k]: v } } };
    });

  const groups = useMemo(() => arrangeRows(products, drafts, { groupBy, sortBy, terms, presets }), [products, drafts, groupBy, sortBy, terms, presets]);
  const rowOrder = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.id)), [groups]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const maths = useMemo(
    () => new Map(products.map((p) => [p.id, rowMaths(p, drafts[p.id] ?? draftOf(p), terms, presets)])),
    [products, drafts, terms, presets],
  );

  const blanks = useMemo(() => {
    const m = new Map<string, { id: string; name: string; catalog: number | null; count: number; sides: PrintSides[]; rows: SheetProduct[] }>();
    for (const p of products) {
      if (!p.blankId) continue;
      const e = m.get(p.blankId) ?? { id: p.blankId, name: p.blankName ?? "Blank", catalog: p.blankCatalogCost, count: 0, sides: [], rows: [] };
      e.count++;
      e.rows.push(p);
      const s = maths.get(p.id)?.sides;
      if (s && !e.sides.includes(s)) e.sides.push(s);
      m.set(p.blankId, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, maths]);

  const dirtyRows = products.filter((p) => drafts[p.id] && changedFields(p, drafts[p.id]).length > 0);
  const dirtyPresets = Object.entries(presetDrafts).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(savedPresets[k] ?? emptyPreset()));
  const priceUpdates = products.filter((p) => maths.get(p.id)?.priceChanges);
  const termsDirty = JSON.stringify(terms) !== JSON.stringify(savedTerms);
  const errors = dirtyRows.map((p) => rowError(p, drafts[p.id])).filter(Boolean) as string[];
  const presetProblems = dirtyPresets.map(([, v]) => presetError(v)).filter(Boolean);
  const termsProblem = brandTermsError(terms);
  const dirtyCount = dirtyRows.length + dirtyPresets.length + (termsDirty ? 1 : 0);
  const pendingAnything = dirtyCount > 0 || priceUpdates.length > 0;
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
  const openEditor = (k: string) => {
    if (!selected.has(k)) {
      setSelected(new Set([k]));
      setAnchor(k);
    }
    const { productId, field } = parseCell(k);
    const p = byId.get(productId);
    const v = p ? draft(p)[field] : null;
    setFillText(v == null ? "" : String(v));
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
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
      for (const pid of selectedRows) {
        const p = byId.get(pid);
        if (p) n[pid] = { ...(n[pid] ?? draftOf(p)), printSides: p.detectedSides === s ? null : s };
      }
      return n;
    });
  };

  // ---------------------------------------------------------- save
  async function saveAll() {
    if (errors.length || termsProblem || presetProblems.length) return;
    try {
      if (termsDirty) await saveTerms.mutateAsync(terms);
      await save.mutateAsync({
        changes: dirtyRows.map((p) => ({ product: p, draft: drafts[p.id] })),
        presets: dirtyPresets.map(([blankId, preset]) => ({ blankId, preset })),
        prices: priceUpdates.map((p) => ({ product: p, athletePrice: maths.get(p.id)!.storedPriceTarget })),
      });
      setDrafts({});
      setPresetDrafts({});
      await sheet.refetch();
      toast.success(`Saved.${priceUpdates.length ? ` ${priceUpdates.length} portal price${priceUpdates.length === 1 ? "" : "s"} updated.` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    }
  }

  const summary = useMemo(() => {
    const ms = products.map((p) => maths.get(p.id)!);
    const avg = (xs: Array<number | null>) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100 : null;
    };
    return {
      count: ms.length,
      incomplete: ms.filter((m) => m.missing.length > 0).length,
      unit: avg(ms.map((m) => m.unitMargin)),
      clientCost: avg(ms.map((m) => m.clientPrice)),
      client: avg(ms.map((m) => m.clientPerSale)),
      ax: avg(ms.map((m) => m.axPerSale)),
    };
  }, [products, maths]);

  const label = (s: string) => <span className="text-[10.5px] uppercase tracking-[0.12em] text-[hsl(var(--ax-faint))]">{s}</span>;
  const axKeeps = terms.revenueSharePercent == null ? null : Math.round((100 - terms.revenueSharePercent) * 100) / 100;

  return (
    <div className="pb-28">
      <Link to={`/admin-v2/people/${entityId}`} className="mb-3 inline-block text-[11px] text-[hsl(var(--ax-faint))]">
        ← {entityName}
      </Link>
      <PageHeader
        title="Pricing sheet"
        subtitle={`Our true cost, what we charge ${first}, and how a store sale splits. Saving updates what their portal charges.`}
        actions={
          <a className={btn} href={`/portal/analytics?as=${entityId}&guide=money`} target="_blank" rel="noreferrer">
            Their Brand HQ <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        }
      />

      {/* The split */}
      <div className="ax-card mb-4 grid gap-4 px-3.5 py-3 lg:grid-cols-[auto_auto_minmax(0,1fr)] lg:items-end">
        <div className="grid gap-1">
          {label("Store sale split")}
          <div className="flex gap-1">
            {(["profit", "gross"] as const).map((b) => (
              <Chip key={b} active={terms.splitBasis === b} onClick={() => setTerms((x) => ({ ...x, splitBasis: b }))}>
                {b === "profit" ? `Profit after ${first}'s cost` : "Gross sale"}
              </Chip>
            ))}
          </div>
        </div>
        {terms.splitBasis === "profit" ? (
          <div className="flex items-end gap-3">
            <div className="grid gap-1">
              {label("AX keeps")}
              <NumInput
                prefix="%"
                value={axKeeps}
                placeholder="—"
                invalid={!!termsProblem}
                onChange={(v) => setTerms((x) => ({ ...x, revenueSharePercent: v == null ? null : Math.round((100 - v) * 100) / 100 }))}
              />
            </div>
            <div className="pb-1.5 text-[12px] text-[hsl(var(--ax-secondary))]">
              {first} keeps <b className="text-[hsl(var(--ax-ink))]">{terms.revenueSharePercent == null ? "—" : `${terms.revenueSharePercent}%`}</b> of the profit
            </div>
          </div>
        ) : (
          <div className="grid gap-1">
            {label(`${first} gets of retail`)}
            <NumInput prefix="%" value={terms.revenueSharePercent} placeholder="—" invalid={!!termsProblem} onChange={(v) => setTerms((x) => ({ ...x, revenueSharePercent: v }))} />
          </div>
        )}
        <label className="grid gap-1">
          {label("How they pay for orders (shown on every order confirmation)")}
          <input
            value={terms.paymentInstructions}
            onChange={(e) => setTerms((x) => ({ ...x, paymentInstructions: e.target.value }))}
            placeholder="e.g. Zelle to payments@athletexclusive.com, or pay the invoice we email you"
            className="rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2.5 py-1.5 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
          />
        </label>
        {termsProblem && <p className="text-[11px] text-[hsl(var(--ax-red))] lg:col-span-3">{termsProblem}</p>}
      </div>

      {/* C-level breakdown per blank */}
      {blanks.length > 0 && (
        <section className="mb-5">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-[15px] font-semibold">Unit economics</h2>
            <span className="text-[11px] text-[hsl(var(--ax-faint))]">
              Per blank: our true cost and what we charge {first}, line by line. Every product on the blank uses these until its row overrides them.
            </span>
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            {blanks.map((b) => (
              <BlankEconomics
                key={b.id}
                blank={b}
                preset={presets[b.id] ?? emptyPreset()}
                onChange={(c, k, v) => setPresetLine(b.id, c, k, v)}
                retail={typicalRetail(b.rows)}
                terms={terms}
                clientName={entityName}
              />
            ))}
          </div>
        </section>
      )}

      {sheet.isError && <ErrorState error={sheet.error} what="the pricing sheet" onRetry={() => void sheet.refetch()} />}
      {sheet.isLoading && <Skeleton className="h-96" />}
      {sheet.data && products.length === 0 && <EmptyState>No products for {entityName} yet.</EmptyState>}

      {products.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Products", String(summary.count)],
              [`${first}'s cost per unit (avg)`, money(summary.clientCost)],
              ["AX per unit (avg)", money(summary.unit)],
              [`${first} per store sale (avg)`, money(summary.client)],
              ["AX per store sale (avg)", money(summary.ax)],
            ].map(([l, v]) => (
              <div key={l} className="ax-card px-3 py-2.5">
                <div className="text-[10.5px] uppercase tracking-[0.1em] text-[hsl(var(--ax-faint))]">{l}</div>
                <div className="mt-0.5 text-[18px] font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>

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
              {summary.incomplete} of {summary.count} rows are missing a print type, print cost, client price, retail or split.
            </p>
          )}

          {groups.map((g) => {
            const head = (field: NumberField, text: string, title?: string) => (
              <Th
                title={title ?? `Select every ${FIELD_LABEL[field].toLowerCase()} in this group (shift to add)`}
                onClick={(e) => selectColumn(field, g.rows, e.shiftKey || e.metaKey || e.ctrlKey)}
              >
                {text}
              </Th>
            );
            return (
              <section key={g.key} className="mb-6">
                <h2 className="mb-2 text-[14px] font-semibold">
                  {g.label} <span className="text-[hsl(var(--ax-faint))]">{g.rows.length}</span>
                </h2>
                <div className="ax-card overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead className="border-b border-[hsl(var(--ax-line))]">
                      <tr>
                        <Th>Print</Th>
                        <Th>Blank · product</Th>
                        {head("blankCost", "Blank", "Our blank cost — empty uses the preset")}
                        {head("printCost", "Print", "Our print cost — empty uses front (+ back) presets")}
                        {head("otherCost", "Services", "Our services cost — empty uses the preset")}
                        <Th right title="Our true cost for one unit">True cost</Th>
                        {head("clientPrice", "Client price", `What one unit costs ${first} — and what the portal charges. Empty uses the presets.`)}
                        <Th right title="Client price − true cost">AX / unit</Th>
                        {head("retail", "Retail", "What a fan pays (internal products only)")}
                        <Th right title={`Retail − ${first}'s cost`}>Profit</Th>
                        {head("sharePercent", `${first} %`, `Override ${first}'s share for this product`)}
                        <Th right>{first} $</Th>
                        <Th right title="AX's share of the profit">AX split</Th>
                        <Th right title="AX per store sale: unit margin + split">AX total</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--ax-line))]">
                      {g.rows.map((p) => {
                        const d = draft(p);
                        const m = maths.get(p.id)!;
                        const err = rowError(p, d);
                        const dirty = !!drafts[p.id] && changedFields(p, drafts[p.id]).length > 0;
                        const pre = presetCosts(p, m.sides, presets);
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
                              onOpen={openEditor}
                              {...extra}
                            />
                          );
                        };
                        const blankSource = pre.blank != null ? (p.blankId && presets[p.blankId]?.blank.cost != null ? "preset" : "catalog") : null;
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
                              {(m.priceChanges || err || p.onShopify || p.status === "archived") && (
                                <span className="block truncate text-[10px] text-[hsl(var(--ax-faint))]">
                                  {m.priceChanges && (
                                    <span className="text-[hsl(var(--ax-amber))]">
                                      Portal {money(p.athletePrice ?? p.ruleAthletePrice)} → {money(m.clientPrice)} on Save
                                    </span>
                                  )}
                                  {[p.onShopify ? " On Shopify" : null, p.status === "archived" ? " Archived" : null].filter(Boolean).join(" ·")}
                                  {err && <span className="ml-1 text-[hsl(var(--ax-red))]">{err}</span>}
                                </span>
                              )}
                            </td>
                            {cell("blankCost", pre.blank, blankSource)}
                            {cell("printCost", pre.print, pre.print != null ? "preset" : null, { invalid: m.printCost == null })}
                            {cell("otherCost", pre.services, pre.services != null ? "preset" : null)}
                            <Td right strong>{money(m.trueCost)}</Td>
                            {cell("clientPrice", m.clientPriceSource === "row" ? null : m.clientPrice, m.clientPriceSource === "row" ? null : m.clientPriceSource, {
                              invalid: m.clientPriceSource === "rule",
                            })}
                            <Td right strong tone={m.unitMargin != null ? (m.unitMargin < 0 ? "bad" : "good") : undefined}>{money(m.unitMargin)}</Td>
                            {cell("retail", null, null, { locked: p.onShopify ? "Retail is set in Shopify for this product" : undefined, invalid: d.retail == null })}
                            <Td right tone={m.storeProfit != null && m.storeProfit < 0 ? "bad" : undefined}>{money(m.storeProfit)}</Td>
                            {cell("sharePercent", terms.revenueSharePercent, terms.revenueSharePercent != null ? "terms" : null)}
                            <Td right>{money(m.clientPerSale)}</Td>
                            <Td right>{money(m.axSplit)}</Td>
                            <Td right strong tone={m.axPerSale != null && m.axPerSale < 0 ? "bad" : undefined}>{money(m.axPerSale)}</Td>
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
            True cost = blank + print + services (ours). Client price = the same lines at what we charge — the price {first}'s portal orders are
            charged. AX / unit = client price − true cost. On a store sale, profit = retail − client price; {first} keeps their share and AX
            keeps the split. Our costs are private to AX.
          </p>
        </>
      )}

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

      {pendingAnything && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-4 py-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <span className="text-[13px]">
              {dirtyCount > 0 && `${dirtyCount} change${dirtyCount === 1 ? "" : "s"} not saved`}
              {dirtyCount > 0 && priceUpdates.length > 0 && " · "}
              {priceUpdates.length > 0 && (
                <span className="text-[hsl(var(--ax-amber))]">
                  {priceUpdates.length} portal price{priceUpdates.length === 1 ? "" : "s"} will update
                </span>
              )}
              {(errors.length > 0 || presetProblems.length > 0) && (
                <span className="ml-2 text-[hsl(var(--ax-red))]">· fix {errors.length + presetProblems.length} first</span>
              )}
            </span>
            <span className="flex-1" />
            {dirtyCount > 0 && (
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
            )}
            <button type="button" className={btnPrimary} onClick={() => void saveAll()} disabled={saving || errors.length > 0 || !!termsProblem || presetProblems.length > 0}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
