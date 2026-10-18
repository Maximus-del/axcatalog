// Pricing sheet — every number behind one client's products, editable in place.
//
// Cost (blank + print + other), cost %, retail, the client's bulk price, and how
// a store sale splits between the client and AX. Saving writes the real
// records: the bulk price typed here is the price the client's portal orders
// are charged. See lib/v2/pricing-sheet.ts for where each number lives.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowUpRight, Loader2, RotateCcw } from "lucide-react";
import { Chip, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";
import { useEntityWorkspace } from "@/lib/v2/data";
import { fmtMoney } from "@/lib/v2/pricing";
import { EMPTY_TERMS, brandTermsError, useSaveBrandTerms, type BrandTerms } from "@/lib/v2/brand-terms";
import {
  changedFields,
  draftOf,
  rowError,
  rowMaths,
  usePricingSheet,
  useSavePricingSheet,
  type Garment,
  type RowDraft,
  type SheetProduct,
} from "@/lib/v2/pricing-sheet";

const btn =
  "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50";

const GROUPS: Array<{ key: Garment; label: string }> = [
  { key: "tee", label: "Tees" },
  { key: "hoodie", label: "Hoodies" },
  { key: "other", label: "Other" },
];

const money = (n: number | null | undefined) => (n == null ? "—" : fmtMoney(n));
const pctText = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);

/** A number box that keeps what is typed ("1." stays "1.") and reports a number, null or NaN. */
function NumCell({
  value,
  placeholder,
  onChange,
  disabled,
  title,
  prefix = "$",
  invalid,
}: {
  value: number | null;
  placeholder?: string;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  title?: string;
  prefix?: string;
  invalid?: boolean;
}) {
  const [text, setText] = useState(value == null || Number.isNaN(value) ? "" : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value == null || Number.isNaN(value) ? "" : String(value));
  }, [value, focused]);
  return (
    <label
      className={`flex items-center gap-0.5 rounded-md border px-1.5 py-1 text-[12px] ${
        invalid ? "border-[hsl(var(--ax-red))]" : "border-[hsl(var(--ax-border))]"
      } ${disabled ? "opacity-60" : "focus-within:border-[hsl(var(--ax-accent))]"}`}
      title={title}
    >
      {prefix === "$" && <span className="text-[hsl(var(--ax-faint))]">$</span>}
      <input
        inputMode="decimal"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const v = e.target.value.replace(/[$,%\s]/g, "");
          setText(v);
          onChange(v === "" ? null : Number(v));
        }}
        className="w-14 min-w-0 bg-transparent tabular-nums outline-none placeholder:text-[hsl(var(--ax-faint))]"
      />
      {prefix === "%" && <span className="text-[hsl(var(--ax-faint))]">%</span>}
    </label>
  );
}

function Th({ children, right, title }: { children: ReactNode; right?: boolean; title?: string }) {
  return (
    <th title={title} className={`whitespace-nowrap px-2 py-2 text-[10.5px] font-medium uppercase tracking-[0.1em] text-[hsl(var(--ax-faint))] ${right ? "text-right" : "text-left"}`}>
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

type GroupFill = Partial<Pick<RowDraft, "printCost" | "otherCost" | "athletePrice" | "retail" | "sharePercent">>;

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
  const [fills, setFills] = useState<Record<string, GroupFill>>({});
  const entityName = ws.data?.entity?.name ?? "this client";

  const products = useMemo(() => sheet.data?.products ?? [], [sheet.data]);
  const savedTerms = sheet.data?.terms ?? EMPTY_TERMS;
  useEffect(() => {
    if (sheet.data) setTerms(sheet.data.terms);
  }, [sheet.data]);

  const draft = (p: SheetProduct): RowDraft => drafts[p.id] ?? draftOf(p);
  const setField = (p: SheetProduct, k: keyof RowDraft, v: RowDraft[keyof RowDraft]) =>
    setDrafts((d) => ({ ...d, [p.id]: { ...(d[p.id] ?? draftOf(p)), [k]: v } }));

  const dirtyRows = products.filter((p) => drafts[p.id] && changedFields(p, drafts[p.id]).length > 0);
  const termsDirty = JSON.stringify(terms) !== JSON.stringify(savedTerms);
  const errors = dirtyRows.map((p) => rowError(p, drafts[p.id])).filter(Boolean) as string[];
  const termsProblem = brandTermsError(terms);
  const dirtyCount = dirtyRows.length + (termsDirty ? 1 : 0);

  const maths = (p: SheetProduct) => rowMaths(p, draft(p), terms);

  const summary = useMemo(() => {
    const rows = products.map((p) => ({ p, m: rowMaths(p, drafts[p.id] ?? draftOf(p), terms) }));
    const by = (g: Garment) => rows.filter((r) => r.p.garment === g);
    const avg = (xs: Array<number | null>) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100 : null;
    };
    return {
      count: rows.length,
      incomplete: rows.filter((r) => r.m.missing.length > 0).length,
      costPct: avg(rows.map((r) => r.m.costPercent)),
      teeAx: avg(by("tee").map((r) => r.m.axPerSale)),
      hoodieAx: avg(by("hoodie").map((r) => r.m.axPerSale)),
      teeClient: avg(by("tee").map((r) => r.m.clientPerSale)),
    };
  }, [products, drafts, terms]);

  function applyFill(group: Garment) {
    const f = fills[group] ?? {};
    const entries = Object.entries(f).filter(([, v]) => v !== undefined) as Array<[keyof GroupFill, number | null]>;
    if (!entries.length) return;
    const rows = products.filter((p) => p.garment === group);
    setDrafts((d) => {
      const next = { ...d };
      for (const p of rows) {
        const base = { ...(next[p.id] ?? draftOf(p)) };
        for (const [k, v] of entries) {
          if (k === "retail" && p.onShopify) continue;
          base[k] = v;
        }
        next[p.id] = base;
      }
      return next;
    });
    toast.success(`Filled ${rows.length} ${GROUPS.find((g) => g.key === group)?.label.toLowerCase()} — review, then Save.`);
  }

  async function saveAll() {
    if (errors.length || termsProblem) return;
    try {
      if (termsDirty) await saveTerms.mutateAsync(terms);
      if (dirtyRows.length) await save.mutateAsync(dirtyRows.map((p) => ({ product: p, draft: drafts[p.id] })));
      setDrafts({});
      await sheet.refetch();
      toast.success("Saved. Portal prices and Brand HQ use these numbers now.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save.");
    }
  }

  const saving = save.isPending || saveTerms.isPending;

  return (
    <div className="pb-24">
      <Link to={`/admin-v2/people/${entityId}`} className="mb-3 inline-block text-[11px] text-[hsl(var(--ax-faint))]">
        ← {entityName}
      </Link>
      <PageHeader
        title="Pricing sheet"
        subtitle={`Cost, retail, ${entityName}'s bulk price and the split, per product. Saving updates what their portal charges.`}
        actions={
          <>
            <Chip active={showArchived} onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Including archived" : "Live only"}
            </Chip>
            <a className={btn} href={`/portal/analytics?as=${entityId}&guide=money`} target="_blank" rel="noreferrer">
              Their Brand HQ <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </>
        }
      />

      {/* Terms: the split every row uses unless a row overrides its share. */}
      <div className="ax-card mb-4 grid gap-4 px-3.5 py-3 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-end">
        <div className="grid gap-1">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-[hsl(var(--ax-faint))]">{entityName}'s share</span>
          <NumCell
            prefix="%"
            value={terms.revenueSharePercent}
            placeholder="—"
            invalid={!!termsProblem}
            onChange={(v) => setTerms((x) => ({ ...x, revenueSharePercent: v }))}
          />
        </div>
        <div className="grid gap-1">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-[hsl(var(--ax-faint))]">Taken from</span>
          <div className="flex gap-1">
            {(["gross", "profit"] as const).map((b) => (
              <Chip key={b} active={terms.splitBasis === b} onClick={() => setTerms((x) => ({ ...x, splitBasis: b }))}>
                {b === "gross" ? "Gross sale" : "Profit after cost"}
              </Chip>
            ))}
          </div>
        </div>
        <label className="grid gap-1">
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-[hsl(var(--ax-faint))]">How they pay for orders (shown on every order confirmation)</span>
          <input
            value={terms.paymentInstructions}
            onChange={(e) => setTerms((x) => ({ ...x, paymentInstructions: e.target.value }))}
            placeholder="e.g. Zelle to payments@athletexclusive.com, or pay the invoice we email you"
            className="rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2.5 py-1.5 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
          />
        </label>
        {termsProblem && <p className="text-[11px] text-[hsl(var(--ax-red))] sm:col-span-3">{termsProblem}</p>}
      </div>

      {sheet.isError && <ErrorState error={sheet.error} what="the pricing sheet" onRetry={() => void sheet.refetch()} />}
      {sheet.isLoading && <Skeleton className="h-96" />}
      {sheet.data && products.length === 0 && <EmptyState>No products for {entityName} yet.</EmptyState>}

      {products.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Products", String(summary.count)],
              ["Avg cost % of retail", pctText(summary.costPct)],
              [`${entityName.split(" ")[0]} per tee sale`, money(summary.teeClient)],
              ["AX per tee sale", money(summary.teeAx)],
              ["AX per hoodie sale", money(summary.hoodieAx)],
            ].map(([label, value]) => (
              <div key={label} className="ax-card px-3 py-2.5">
                <div className="text-[10.5px] uppercase tracking-[0.1em] text-[hsl(var(--ax-faint))]">{label}</div>
                <div className="mt-0.5 text-[18px] font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          {summary.incomplete > 0 && (
            <p className="mb-3 flex items-center gap-1.5 text-[12px] text-[hsl(var(--ax-amber))]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {summary.incomplete} of {summary.count} rows are missing a print cost, retail or share — their margins are partial until filled.
            </p>
          )}

          {GROUPS.map((g) => {
            const rows = products.filter((p) => p.garment === g.key);
            if (!rows.length) return null;
            const fill = fills[g.key] ?? {};
            const setFill = (k: keyof GroupFill, v: number | null) => setFills((f) => ({ ...f, [g.key]: { ...(f[g.key] ?? {}), [k]: v } }));
            return (
              <section key={g.key} className="mb-6">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-[14px] font-semibold">
                    {g.label} <span className="text-[hsl(var(--ax-faint))]">{rows.length}</span>
                  </h2>
                  <span className="flex-1" />
                  <span className="text-[11px] text-[hsl(var(--ax-faint))]">Set for all {g.label.toLowerCase()}:</span>
                  <NumCell value={fill.printCost ?? null} placeholder="Print" onChange={(v) => setFill("printCost", v)} title="Print cost" />
                  <NumCell value={fill.otherCost ?? null} placeholder="Other" onChange={(v) => setFill("otherCost", v)} title="Other cost" />
                  <NumCell value={fill.retail ?? null} placeholder="Retail" onChange={(v) => setFill("retail", v)} title="Retail (internal products only)" />
                  <NumCell value={fill.athletePrice ?? null} placeholder="Bulk" onChange={(v) => setFill("athletePrice", v)} title="Bulk price" />
                  <NumCell prefix="%" value={fill.sharePercent ?? null} placeholder="Share" onChange={(v) => setFill("sharePercent", v)} title="Share override" />
                  <button type="button" className={btn} onClick={() => applyFill(g.key)} disabled={!Object.values(fill).some((v) => v !== undefined)}>
                    Apply to {rows.length}
                  </button>
                </div>
                <div className="ax-card overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead className="border-b border-[hsl(var(--ax-line))]">
                      <tr>
                        <Th>Product</Th>
                        <Th title="Blank cost — empty uses the blank's cost">Blank</Th>
                        <Th>Print</Th>
                        <Th title="Packaging, labels, labour">Other</Th>
                        <Th right>Cost</Th>
                        <Th title="What a fan pays">Retail</Th>
                        <Th right>Cost %</Th>
                        <Th title="Empty uses the client's share above">Share</Th>
                        <Th right title="Client's take per store sale">Client $</Th>
                        <Th right title="AX's take per store sale, after cost and the client's share">AX $</Th>
                        <Th right>AX %</Th>
                        <Th title="What the client pays per unit on a bulk order (before the volume discount). Empty uses the rule.">Bulk price</Th>
                        <Th right title="AX profit per bulk unit">Bulk $</Th>
                        <Th right>Bulk %</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[hsl(var(--ax-line))]">
                      {rows.map((p) => {
                        const d = draft(p);
                        const m = maths(p);
                        const err = rowError(p, d);
                        const dirty = !!drafts[p.id] && changedFields(p, drafts[p.id]).length > 0;
                        return (
                          <tr key={p.id} className={dirty ? "bg-[hsl(var(--ax-accent)/0.05)]" : undefined}>
                            <td className="max-w-[260px] px-2 py-1.5 text-[12px]">
                              <Link to={`/admin-v2/products/${p.id}`} className="block truncate font-medium hover:underline" title={p.title}>
                                {p.title}
                              </Link>
                              <span className="block truncate text-[10.5px] text-[hsl(var(--ax-faint))]">
                                {[p.blankName, p.onShopify ? "On Shopify" : "Internal", p.status === "archived" ? "Archived" : null].filter(Boolean).join(" · ")}
                                {err && <span className="ml-1 text-[hsl(var(--ax-red))]">· {err}</span>}
                              </span>
                            </td>
                            <td className="px-1 py-1.5"><NumCell value={d.blankCost} placeholder={p.blankDefaultCost != null ? String(p.blankDefaultCost) : "—"} onChange={(v) => setField(p, "blankCost", v)} /></td>
                            <td className="px-1 py-1.5"><NumCell value={d.printCost} placeholder="—" invalid={d.printCost == null} onChange={(v) => setField(p, "printCost", v)} /></td>
                            <td className="px-1 py-1.5"><NumCell value={d.otherCost} placeholder="0" onChange={(v) => setField(p, "otherCost", v)} /></td>
                            <Td right strong>{money(m.totalCost)}</Td>
                            <td className="px-1 py-1.5">
                              <NumCell value={d.retail} placeholder="—" disabled={p.onShopify} title={p.onShopify ? "Retail is set in Shopify for this product" : undefined} onChange={(v) => setField(p, "retail", v)} />
                            </td>
                            <Td right tone={m.costPercent != null && m.costPercent > 50 ? "bad" : undefined}>{pctText(m.costPercent)}</Td>
                            <td className="px-1 py-1.5"><NumCell prefix="%" value={d.sharePercent} placeholder={terms.revenueSharePercent != null ? String(terms.revenueSharePercent) : "—"} onChange={(v) => setField(p, "sharePercent", v)} /></td>
                            <Td right>{money(m.clientPerSale)}</Td>
                            <Td right strong tone={m.axPerSale != null && m.axPerSale < 0 ? "bad" : undefined}>{money(m.axPerSale)}</Td>
                            <Td right>{pctText(m.axMarginPercent)}</Td>
                            <td className="px-1 py-1.5"><NumCell value={d.athletePrice} placeholder={String(p.ruleAthletePrice)} onChange={(v) => setField(p, "athletePrice", v)} title="Empty = the rule price shown" /></td>
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
            Cost = blank + print + other. AX $ = retail − cost − the client's share. Bulk $ = bulk price − cost, before the
            volume discount (10% from 50 units). Costs are private to AX; the client only ever sees their bulk price and retail.
          </p>
        </>
      )}

      {dirtyCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-4 py-3">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
            <span className="text-[13px]">
              {dirtyCount} change{dirtyCount === 1 ? "" : "s"} not saved
              {errors.length > 0 && <span className="ml-2 text-[hsl(var(--ax-red))]">· fix {errors.length} row{errors.length === 1 ? "" : "s"} first</span>}
            </span>
            <span className="flex-1" />
            <button type="button" className={btn} onClick={() => { setDrafts({}); setTerms(savedTerms); }} disabled={saving}>
              <RotateCcw className="h-3.5 w-3.5" /> Discard
            </button>
            <button type="button" className={btnPrimary} onClick={() => void saveAll()} disabled={saving || errors.length > 0 || !!termsProblem}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
