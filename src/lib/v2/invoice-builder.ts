// Invoice builder — put products on an invoice for a client and see both sides.
//
// The invoice itself carries only what the client pays: each product at their
// client price (from the pricing sheet), the volume discount, the total due.
// Alongside it AX sees its own side — true cost, revenue, profit, margin — and
// the client's side: what the order costs them, and, if they sell it rather
// than give it away, what they take in and keep.
//
// Creating the invoice writes a real order (bulk_order_requests, channel
// "internal") so it shows on the client's page with Email invoice / Mark paid
// and in their Brand HQ. AX's costs are never written to the order: clients can
// read their own order rows.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { t, type Row } from "./db";
import type { RowMaths, SheetProduct } from "./pricing-sheet";

export interface InvoiceLineDraft {
  productId: string;
  quantity: number;
  /** Override of the client price for this invoice only. */
  unitPrice: number | null;
  /** What the client would sell each piece for (defaults to retail). */
  resalePrice: number | null;
  /** Sizes / colours / anything production needs. */
  notes: string;
}

export interface LineFigures {
  line: InvoiceLineDraft;
  product: SheetProduct;
  unitPrice: number;
  /** After the volume discount. */
  effectiveUnit: number;
  lineTotal: number;
  /** AX's true cost for the line (null when the product has no cost yet). */
  trueCost: number | null;
  axProfit: number | null;
  resaleUnit: number | null;
  resaleRevenue: number | null;
}

export interface InvoiceFigures {
  lines: LineFigures[];
  units: number;
  discountPercent: number;
  subtotal: number;
  discount: number;
  total: number;
  ax: { revenue: number; trueCost: number | null; profit: number | null; marginPercent: number | null; missingCost: number };
  client: {
    mode: "giveaway" | "sell";
    cost: number;
    costPerPiece: number | null;
    revenue: number | null;
    profit: number | null;
    profitPerPiece: number | null;
  };
}

const c2 = (n: number) => Math.round(n * 100) / 100;

/** The ladder portal orders use: 50 → 10%, 100 → 15%, 250 → 20%, 500 → 25% unless the org has its own. */
export function ladderPercent(units: number, tiers: Array<{ min_qty: number; discount_pct: number }>): number {
  let pct = 0;
  for (const t of tiers) if (units >= t.min_qty && t.discount_pct > pct) pct = t.discount_pct;
  return pct;
}

/** Pure: every number on the invoice and on both sides of it. */
export function invoiceFigures(
  lines: InvoiceLineDraft[],
  products: Map<string, SheetProduct>,
  maths: Map<string, RowMaths>,
  opts: { discountPercent: number; mode: "giveaway" | "sell" },
): InvoiceFigures {
  const pct = Math.max(0, Math.min(100, opts.discountPercent));
  const figs: LineFigures[] = [];
  for (const line of lines) {
    const product = products.get(line.productId);
    const m = maths.get(line.productId);
    if (!product || !m || line.quantity <= 0) continue;
    const unitPrice = line.unitPrice ?? m.clientPrice;
    // Rounded per line, the way portal_quote_order rounds.
    const lineTotal = c2(unitPrice * line.quantity * (1 - pct / 100));
    const effectiveUnit = c2(lineTotal / line.quantity);
    const trueCost = m.trueCost == null ? null : c2(m.trueCost * line.quantity);
    const resaleUnit = line.resalePrice ?? product.retail;
    figs.push({
      line,
      product,
      unitPrice,
      effectiveUnit,
      lineTotal,
      trueCost,
      axProfit: trueCost == null ? null : c2(lineTotal - trueCost),
      resaleUnit,
      resaleRevenue: resaleUnit == null ? null : c2(resaleUnit * line.quantity),
    });
  }
  const units = figs.reduce((n, f) => n + f.line.quantity, 0);
  const subtotal = c2(figs.reduce((n, f) => n + f.unitPrice * f.line.quantity, 0));
  const total = c2(figs.reduce((n, f) => n + f.lineTotal, 0));
  const missingCost = figs.filter((f) => f.trueCost == null).length;
  const trueCost = figs.length && missingCost === 0 ? c2(figs.reduce((n, f) => n + (f.trueCost ?? 0), 0)) : null;
  const profit = trueCost == null ? null : c2(total - trueCost);
  const sellable = figs.every((f) => f.resaleRevenue != null);
  const revenue = opts.mode === "sell" && figs.length && sellable ? c2(figs.reduce((n, f) => n + (f.resaleRevenue ?? 0), 0)) : null;
  const clientProfit = revenue == null ? null : c2(revenue - total);
  return {
    lines: figs,
    units,
    discountPercent: pct,
    subtotal,
    discount: c2(subtotal - total),
    total,
    ax: {
      revenue: total,
      trueCost,
      profit,
      marginPercent: profit != null && total > 0 ? Math.round((profit / total) * 1000) / 10 : null,
      missingCost,
    },
    client: {
      mode: opts.mode,
      cost: total,
      costPerPiece: units ? c2(total / units) : null,
      revenue,
      profit: clientProfit,
      profitPerPiece: clientProfit != null && units ? c2(clientProfit / units) : null,
    },
  };
}

/** Pure: an order number in the house format, BR-YYYY-NNNNN. */
export const orderNumber = (now = new Date(), rand = Math.random) =>
  `BR-${now.getFullYear()}-${String(Math.floor(rand() * 100000)).padStart(5, "0")}`;

/**
 * Write the invoice as an order: one bulk_order_requests row (submitted,
 * channel "internal", unpaid) and its items at the invoiced prices. If the
 * items fail, the request is removed again so a half order never lingers.
 */
export function useCreateInvoice(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { organizationId: string; figures: InvoiceFigures; notes: string; key: string }) => {
      const { figures, organizationId } = input;
      if (!figures.lines.length) throw new Error("Add at least one product.");
      const { data: auth } = await supabase.auth.getUser();
      let request: Row | null = null;
      for (let attempt = 0; attempt < 5 && !request; attempt++) {
        const res = (await t("bulk_order_requests")
          .insert({
            organization_id: organizationId,
            athlete_id: entityId,
            requested_by: auth.user?.id ?? null,
            status: "submitted",
            channel: "internal",
            order_number: orderNumber(),
            notes: [input.notes.trim() || null, `Invoice builder · ${input.key}`].filter(Boolean).join("\n"),
            wholesale_subtotal: figures.total,
            retail_equivalent: figures.lines.every((l) => l.resaleRevenue != null)
              ? Math.round(figures.lines.reduce((n, l) => n + (l.resaleRevenue ?? 0), 0) * 100) / 100
              : null,
            total_savings: figures.discount,
            total_units: 0,
            amount_due: figures.total,
            payment_method: "invoice",
            payment_status: "unpaid",
          } as never)
          .select("id, order_number")
          .single()) as { data: Row | null; error: { code?: string; message: string } | null };
        if (res.error && res.error.code !== "23505") throw new Error(res.error.message);
        request = res.data;
      }
      if (!request) throw new Error("Couldn't allocate an order number — try again.");

      const items = figures.lines.map((l) => ({
        order_request_id: request!.id,
        product_id: l.product.id,
        product_name_snapshot: l.product.title,
        size: "",
        color: null,
        quantity: l.line.quantity,
        unit_wholesale_price: l.effectiveUnit,
        unit_retail_price: l.product.retail,
        line_subtotal: l.lineTotal,
        v2_blank_id: l.product.blankId,
        notes: l.line.notes.trim() || null,
      }));
      const ins = (await t("bulk_order_items").insert(items as never).select("id")) as { data: Row[] | null; error: { message: string } | null };
      if (ins.error || (ins.data ?? []).length !== items.length) {
        await t("bulk_order_requests").delete().eq("id", String(request.id));
        throw new Error(ins.error?.message ?? "The invoice lines were not saved.");
      }
      return { id: String(request.id), orderNumber: String(request.order_number) };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "entity-orders", entityId] });
    },
  });
}
