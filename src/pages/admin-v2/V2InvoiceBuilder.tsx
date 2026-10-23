// Invoice builder — pick a client's products, set quantities, and see the
// invoice (what they pay) beside AX's side (what we make) and the client's side
// (what it costs them, or what they make if they sell it).
//
// Prices come from the pricing sheet: each product at its client price, the
// volume discount from the same ladder portal orders use. "Create invoice"
// writes a real order so it appears on the client page with Email invoice and
// Mark paid. The draft is kept in this browser until it is created.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpRight, CheckCircle2, FileText, Loader2, Mail, Plus, Search, X } from "lucide-react";
import { Card, Chip, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";
import { useEntityWorkspace } from "@/lib/v2/data";
import { fmtMoney } from "@/lib/v2/pricing";
import { draftOf, printLines, rowMaths, SIDES_LABEL, usePricingSheet, type SheetProduct } from "@/lib/v2/pricing-sheet";
import { invoiceFigures, ladderPercent, useCreateInvoice, type InvoiceLineDraft } from "@/lib/v2/invoice-builder";
import { fetchInvoice, invoiceEmail, mailtoHref, useSetPaymentStatus } from "@/lib/v2/invoices";
import { effectiveTiers, usePortalPricing } from "@/hooks/usePortalPricing";
import { PreviewPlus } from "@/components/admin-v2/ProductPreview";

const btn =
  "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50";
const inputCls =
  "rounded-md border border-[hsl(var(--ax-border))] bg-transparent px-1.5 py-1 text-[12px] tabular-nums outline-none focus:border-[hsl(var(--ax-accent))]";

const money = (n: number | null | undefined) => (n == null ? "—" : fmtMoney(n));
const num = (v: string): number | null => {
  const s = v.replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

interface Draft {
  lines: InvoiceLineDraft[];
  mode: "giveaway" | "sell";
  /** null = the ladder decides. */
  discountOverride: number | null;
  notes: string;
  key: string;
}
const newDraft = (): Draft => ({ lines: [], mode: "giveaway", discountOverride: null, notes: "", key: crypto.randomUUID() });
const storeKey = (id: string) => `ax.v2.invoice.${id}`;

function loadDraft(id: string): Draft {
  try {
    const raw = localStorage.getItem(storeKey(id));
    if (raw) return { ...newDraft(), ...(JSON.parse(raw) as Draft) };
  } catch {
    /* private mode / bad JSON: start fresh */
  }
  return newDraft();
}

function Thumb({ url, alt, size = "h-10 w-10" }: { url?: string | null; alt: string; size?: string }) {
  return (
    <span className={`${size} flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-[hsl(var(--ax-ink)/0.05)]`}>
      {url ? <img src={url} alt={alt} loading="lazy" className="h-full w-full object-contain" /> : <span className="text-[9px] text-[hsl(var(--ax-faint))]">—</span>}
    </span>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className={`flex justify-between gap-3 text-[12.5px] tabular-nums ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-[hsl(var(--ax-secondary))]"}>{label}</span>
      <span className={tone === "good" ? "text-[hsl(var(--ax-accent))]" : tone === "bad" ? "text-[hsl(var(--ax-red))]" : ""}>{value}</span>
    </div>
  );
}

export default function V2InvoiceBuilder() {
  const { id } = useParams();
  const entityId = id ?? "";
  const ws = useEntityWorkspace(id);
  const sheet = usePricingSheet(entityId);
  const entity = ws.data?.entity;
  const first = (entity?.name ?? "Client").split(" ")[0];
  const pricing = usePortalPricing(entity?.organizationId ?? null);
  const create = useCreateInvoice(entityId);
  const setPayment = useSetPaymentStatus(entityId);
  const [draft, setDraft] = useState<Draft>(() => loadDraft(entityId));
  const [query, setQuery] = useState("");
  const [created, setCreated] = useState<{ id: string; orderNumber: string } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storeKey(entityId), JSON.stringify(draft));
    } catch {
      /* not persisted in private mode */
    }
  }, [draft, entityId]);

  const products = useMemo(() => (sheet.data?.products ?? []).filter((p) => p.blankId || !p.onShopify), [sheet.data]);
  const terms = sheet.data?.terms;
  const presets = useMemo(() => sheet.data?.presets ?? {}, [sheet.data]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const maths = useMemo(
    () => new Map(products.map((p) => [p.id, rowMaths(p, draftOf(p), terms ?? { revenueSharePercent: null, splitBasis: "profit" }, presets)])),
    [products, terms, presets],
  );

  const units = draft.lines.reduce((n, l) => n + (l.quantity > 0 ? l.quantity : 0), 0);
  const ladder = ladderPercent(units, effectiveTiers(pricing.config.tiers));
  const discountPercent = draft.discountOverride ?? ladder;
  const figures = useMemo(
    () => invoiceFigures(draft.lines, byId, maths, { discountPercent, mode: draft.mode }),
    [draft.lines, byId, maths, discountPercent, draft.mode],
  );

  // The picker: this client's products, by blank and print, filtered by the search.
  const picker = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = products.filter((p) => !q || `${p.title} ${p.blankName ?? ""}`.toLowerCase().includes(q));
    const byBlank = new Map<string, SheetProduct[]>();
    for (const p of rows) byBlank.set(p.blankId ?? "none", [...(byBlank.get(p.blankId ?? "none") ?? []), p]);
    return [...byBlank.entries()].flatMap(([, rs]) =>
      printLines(rs, {}, terms ?? { revenueSharePercent: null, splitBasis: "profit" }, presets).map((l) => ({
        key: l.key,
        label: `${rs[0].blankName ?? "No blank"} · ${l.sides ? SIDES_LABEL[l.sides] : "Print not set"}`,
        price: l.shared.clientPrice,
        rows: [...l.rows].sort((a, b) => a.title.localeCompare(b.title)),
      })),
    );
  }, [products, query, terms, presets]);

  const onInvoice = new Set(draft.lines.map((l) => l.productId));
  const add = (ids: string[]) =>
    setDraft((d) => ({
      ...d,
      lines: [...d.lines, ...ids.filter((x) => !d.lines.some((l) => l.productId === x)).map((productId) => ({ productId, quantity: 12, unitPrice: null, resalePrice: null, notes: "" }))],
    }));
  const patchLine = (productId: string, patch: Partial<InvoiceLineDraft>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)) }));
  const remove = (productId: string) => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.productId !== productId) }));

  async function createInvoice() {
    if (!entity) return;
    try {
      const res = await create.mutateAsync({ organizationId: entity.organizationId, figures, notes: draft.notes, key: draft.key });
      setCreated(res);
      setDraft(newDraft());
      toast.success(`Invoice ${res.orderNumber} created — it's on ${first}'s orders now.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the invoice.");
    }
  }

  async function emailCreated() {
    if (!created || !entity) return;
    try {
      const { to, input } = await fetchInvoice(created.id, entityId, entity.name);
      window.location.href = mailtoHref(to, invoiceEmail(input));
      setPayment.mutate({ orderId: created.id, status: "invoiced" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the email.");
    }
  }

  if (sheet.isError) return <ErrorState error={sheet.error} what="this client's products" onRetry={() => void sheet.refetch()} />;
  const loading = sheet.isLoading || ws.isLoading;

  return (
    <div className="pb-16">
      <div>
        <Link to={`/admin-v2/people/${entityId}`} className="mb-3 inline-block text-[11px] text-[hsl(var(--ax-faint))]">
          ← {entity?.name ?? "Client"}
        </Link>
        <PageHeader
          title="Invoice builder"
          subtitle={`Add ${first}'s products and quantities. The invoice shows only what ${first} pays; our side and theirs are worked out beside it.`}
          actions={
            <>
              <Link className={btn} to={`/admin-v2/people/${entityId}/pricing`}>
                Pricing sheet <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </>
          }
        />

        {created && (
          <Card className="mb-4 flex flex-wrap items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-[hsl(var(--ax-accent))]" />
            <div className="min-w-0 flex-1 text-[13px]">
              <b>Invoice {created.orderNumber}</b> is on {first}'s orders, unpaid.
            </div>
            <a className={btnPrimary} href={`/admin-v2/invoice/${created.id}`} target="_blank" rel="noreferrer">
              <FileText className="h-3.5 w-3.5" /> Open invoice
            </a>
            <button type="button" className={btn} onClick={() => void emailCreated()}>
              <Mail className="h-3.5 w-3.5" /> Email invoice
            </button>
            <Link className={btn} to={`/admin-v2/people/${entityId}`}>
              See orders
            </Link>
            <button type="button" className={btn} onClick={() => setCreated(null)} aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </Card>
        )}

        {loading ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-4">
              {/* Lines */}
              <Card>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-[14px] font-semibold">On the invoice</h2>
                  <span className="text-[11px] text-[hsl(var(--ax-faint))]">{figures.units} pieces</span>
                  <span className="flex-1" />
                  {draft.lines.length > 0 && (
                    <button type="button" className={btn} onClick={() => setDraft(newDraft())}>
                      Clear
                    </button>
                  )}
                </div>
                {draft.lines.length === 0 ? (
                  <EmptyState>Click products below to add them.</EmptyState>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[12px]">
                      <thead className="border-b border-[hsl(var(--ax-line))] text-[10.5px] uppercase tracking-[0.1em] text-[hsl(var(--ax-faint))]">
                        <tr>
                          <th className="px-1 py-2 text-left font-medium">Product</th>
                          <th className="px-1 py-2 text-left font-medium">Qty</th>
                          <th className="px-1 py-2 text-left font-medium" title="Client price — change it for this invoice only">Unit</th>
                          <th className="px-1 py-2 text-right font-medium">Line</th>
                          <th className="px-1 py-2 text-right font-medium" title="Our true cost for the line">Our cost</th>
                          <th className="px-1 py-2 text-right font-medium">AX makes</th>
                          {draft.mode === "sell" && <th className="px-1 py-2 text-left font-medium" title={`What ${first} sells each for`}>Sells at</th>}
                          <th />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[hsl(var(--ax-line))]">
                        {draft.lines.map((l) => {
                          const p = byId.get(l.productId);
                          if (!p) return null;
                          const f = figures.lines.find((x) => x.line.productId === l.productId);
                          const m = maths.get(p.id)!;
                          return (
                            <tr key={l.productId}>
                              <td className="px-1 py-1.5">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="relative shrink-0">
                                    <Thumb url={p.imageUrl} alt={p.title} size="h-12 w-12" />
                                    <PreviewPlus
                                      className="!-right-2 !-top-2 !h-5 !w-5"
                                      product={{ title: p.title, imageUrl: p.imageUrl, backImageUrl: p.backImageUrl, sides: m.sides, subtitle: p.blankName }}
                                    />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block max-w-[220px] truncate font-medium">{p.title}</span>
                                    <span className="block text-[10.5px] text-[hsl(var(--ax-faint))]">
                                      {p.blankName ?? "No blank"} · {m.sides ? SIDES_LABEL[m.sides] : "Print not set"}
                                    </span>
                                    <input
                                      aria-label={`Notes for ${p.title}`}
                                      value={l.notes}
                                      onChange={(e) => patchLine(p.id, { notes: e.target.value })}
                                      placeholder="Sizes / colors, e.g. 4 M · 6 L · 2 XL"
                                      className={`${inputCls} mt-1 w-full max-w-[220px] text-[11px]`}
                                    />
                                  </span>
                                </span>
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  inputMode="numeric"
                                  aria-label={`Quantity of ${p.title}`}
                                  value={l.quantity || ""}
                                  onChange={(e) => patchLine(p.id, { quantity: Math.max(0, Math.floor(Number(e.target.value.replace(/\D/g, "")) || 0)) })}
                                  className={`${inputCls} w-14`}
                                />
                              </td>
                              <td className="px-1 py-1.5">
                                <input
                                  inputMode="decimal"
                                  aria-label={`Unit price of ${p.title}`}
                                  defaultValue={l.unitPrice ?? ""}
                                  placeholder={String(m.clientPrice)}
                                  onChange={(e) => patchLine(p.id, { unitPrice: num(e.target.value) })}
                                  className={`${inputCls} w-16`}
                                />
                              </td>
                              <td className="px-1 py-1.5 text-right font-semibold tabular-nums">{money(f?.lineTotal)}</td>
                              <td className="px-1 py-1.5 text-right tabular-nums text-[hsl(var(--ax-secondary))]">{money(f?.trueCost)}</td>
                              <td className={`px-1 py-1.5 text-right tabular-nums ${f?.axProfit != null && f.axProfit < 0 ? "text-[hsl(var(--ax-red))]" : "text-[hsl(var(--ax-accent))]"}`}>
                                {money(f?.axProfit)}
                              </td>
                              {draft.mode === "sell" && (
                                <td className="px-1 py-1.5">
                                  <input
                                    inputMode="decimal"
                                    aria-label={`Resale price of ${p.title}`}
                                    defaultValue={l.resalePrice ?? ""}
                                    placeholder={p.retail != null ? String(p.retail) : "—"}
                                    onChange={(e) => patchLine(p.id, { resalePrice: num(e.target.value) })}
                                    className={`${inputCls} w-16`}
                                  />
                                </td>
                              )}
                              <td className="px-1 py-1.5 text-right">
                                <button type="button" onClick={() => remove(p.id)} aria-label={`Remove ${p.title}`} className="text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-red))]">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <label className="mt-3 grid gap-1 text-[11px] text-[hsl(var(--ax-faint))]">
                  Note on the order (optional)
                  <input
                    value={draft.notes}
                    onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                    placeholder="e.g. Camp giveaway, needed by Nov 8"
                    className="rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2.5 py-1.5 text-[12px] text-[hsl(var(--ax-ink))] outline-none focus:border-[hsl(var(--ax-accent))]"
                  />
                </label>
              </Card>
              {/* Picker */}
              <Card>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-[14px] font-semibold">Add products</h2>
                  <span className="flex-1" />
                  <label className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search products"
                      className="w-56 rounded-full border border-[hsl(var(--ax-border))] bg-transparent py-1.5 pl-8 pr-3 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
                    />
                  </label>
                </div>
                {picker.length === 0 ? (
                  <EmptyState>No products match.</EmptyState>
                ) : (
                  <div className="space-y-3">
                    {picker.map((g) => {
                      const remaining = g.rows.filter((r) => !onInvoice.has(r.id));
                      return (
                        <div key={g.key}>
                          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                            <b>{g.label}</b>
                            <span className="text-[hsl(var(--ax-faint))]">{money(g.price)} each</span>
                            <span className="flex-1" />
                            {remaining.length > 0 && (
                              <button type="button" className={btn} onClick={() => add(remaining.map((r) => r.id))}>
                                <Plus className="h-3 w-3" /> Add all {remaining.length}
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-7">
                            {g.rows.map((p) => {
                              const on = onInvoice.has(p.id);
                              return (
                                <div key={p.id} className="relative">
                                <PreviewPlus product={{ title: p.title, imageUrl: p.imageUrl, backImageUrl: p.backImageUrl, sides: maths.get(p.id)?.sides, subtitle: g.label }} />
                                <button
                                  type="button"
                                  onClick={() => (on ? remove(p.id) : add([p.id]))}
                                  aria-pressed={on}
                                  title={on ? "On the invoice — click to remove" : "Add to the invoice"}
                                  className={`overflow-hidden rounded-lg border text-left transition-colors ${
                                    on ? "border-[hsl(var(--ax-accent))] ring-2 ring-[hsl(var(--ax-accent)/0.3)]" : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.6)]"
                                  }`}
                                >
                                  <span className="block aspect-square bg-[hsl(var(--ax-ink)/0.04)]">
                                    {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain" /> : null}
                                  </span>
                                  <span className="block truncate px-1.5 py-1 text-[10.5px]">{p.title.replace(/^Mooney World /, "")}</span>
                                </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

            </div>

            {/* The three sides — stay in view while products are added. */}
            <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <Card>
                <h2 className="mb-2 text-[14px] font-semibold">Invoice · what {first} pays</h2>
                <div className="space-y-1">
                  <Line label={`${figures.units} pieces`} value={money(figures.subtotal)} />
                  <div className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-[hsl(var(--ax-secondary))]">Volume discount</span>
                    <span className="flex items-center gap-1">
                      <input
                        inputMode="decimal"
                        aria-label="Discount percent"
                        value={draft.discountOverride ?? ""}
                        placeholder={String(ladder)}
                        onChange={(e) => setDraft((d) => ({ ...d, discountOverride: num(e.target.value) }))}
                        className={`${inputCls} w-12`}
                      />
                      %
                    </span>
                  </div>
                  {figures.discount > 0 && <Line label="Discount" value={`−${money(figures.discount)}`} />}
                  <div className="my-1 border-t border-[hsl(var(--ax-line))]" />
                  <Line label="Total due" value={money(figures.total)} strong tone="good" />
                </div>
                <p className="mt-2 text-[11px] text-[hsl(var(--ax-faint))]">
                  {draft.discountOverride == null ? `Discount follows the portal ladder (${ladder}% at ${figures.units} pieces).` : "Discount set by hand for this invoice."}{" "}
                  {terms?.paymentInstructions ? `Pay: ${terms.paymentInstructions}` : "Paid by Zelle or invoice."}
                </p>
                <button
                  type="button"
                  className={`${btnPrimary} mt-3 w-full justify-center`}
                  onClick={() => void createInvoice()}
                  disabled={!figures.lines.length || create.isPending || !entity}
                >
                  {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create invoice · {money(figures.total)}
                </button>
              </Card>

              <Card>
                <h2 className="mb-2 text-[14px] font-semibold">Our side · AX</h2>
                <div className="space-y-1">
                  <Line label="Revenue (what they pay)" value={money(figures.ax.revenue)} />
                  <Line label="Our true cost" value={figures.ax.trueCost == null ? "—" : `−${money(figures.ax.trueCost)}`} />
                  <div className="my-1 border-t border-[hsl(var(--ax-line))]" />
                  <Line label="AX makes" value={money(figures.ax.profit)} strong tone={figures.ax.profit != null && figures.ax.profit < 0 ? "bad" : "good"} />
                  <Line label="Margin" value={figures.ax.marginPercent == null ? "—" : `${figures.ax.marginPercent}%`} />
                  <Line label="Per piece" value={figures.ax.profit != null && figures.units ? money(figures.ax.profit / figures.units) : "—"} />
                </div>
                {figures.ax.missingCost > 0 && (
                  <p className="mt-2 text-[11px] text-[hsl(var(--ax-amber))]">
                    {figures.ax.missingCost} product{figures.ax.missingCost === 1 ? " has" : "s have"} no cost yet. Set it on the pricing sheet.
                  </p>
                )}
                <p className="mt-2 text-[11px] text-[hsl(var(--ax-faint))]">Only you see this. It is not written to the order.</p>
              </Card>

              <Card>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-[14px] font-semibold">{first}'s side</h2>
                  <span className="flex-1" />
                  <Chip active={draft.mode === "giveaway"} onClick={() => setDraft((d) => ({ ...d, mode: "giveaway" }))}>
                    Giving away
                  </Chip>
                  <Chip active={draft.mode === "sell"} onClick={() => setDraft((d) => ({ ...d, mode: "sell" }))}>
                    Selling
                  </Chip>
                </div>
                <div className="space-y-1">
                  <Line label="Order costs them" value={money(figures.client.cost)} strong />
                  <Line label="Per piece" value={money(figures.client.costPerPiece)} />
                  {draft.mode === "sell" && (
                    <>
                      <div className="my-1 border-t border-[hsl(var(--ax-line))]" />
                      <Line label="They take in" value={money(figures.client.revenue)} />
                      <Line label="They keep" value={money(figures.client.profit)} strong tone={figures.client.profit != null && figures.client.profit < 0 ? "bad" : "good"} />
                      <Line label="Per piece" value={money(figures.client.profitPerPiece)} />
                    </>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-[hsl(var(--ax-faint))]">
                  {draft.mode === "sell"
                    ? "Sold at each product's retail unless you set a price in Sells at."
                    : `Gear for camps, events or gifts: the cost is the whole story.`}
                </p>
              </Card>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
