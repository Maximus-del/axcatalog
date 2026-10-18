// Phase 2 payments: off-platform. A client places an order in their portal, AX
// emails an invoice, the client pays by Zelle or the invoice, AX marks it paid.
//
// No payment processor. The invoice is drafted in AX's own mail app (mailto:)
// from the order's real lines and totals, and bulk_order_requests.payment_status
// (unpaid → invoiced → paid, or waived) records where it stands — the client
// sees the same status under Recent orders in Brand HQ.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { must, t, type Row } from "./db";
import { parseBrandTerms } from "./brand-terms";

export type PaymentStatus = "unpaid" | "invoiced" | "paid" | "waived";

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Not invoiced",
  invoiced: "Invoice sent",
  paid: "Paid",
  waived: "Waived",
};

export interface InvoiceLine {
  title: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface InvoiceInput {
  orderNumber: string;
  clientName: string;
  createdAt: string;
  lines: InvoiceLine[];
  subtotal: number | null;
  creditApplied: number;
  amountDue: number | null;
  paymentInstructions: string | null;
}

const usd = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));

/** Pure: the invoice email's subject and plain-text body. */
export function invoiceEmail(i: InvoiceInput): { subject: string; body: string } {
  const lines = i.lines.map((l) => {
    const variant = [l.color, l.size].filter(Boolean).join(" / ");
    return `• ${l.quantity} × ${l.title}${variant ? ` (${variant})` : ""} @ ${usd(l.unitPrice)} = ${usd(l.lineTotal)}`;
  });
  const first = i.clientName.split(" ")[0] || i.clientName;
  const body = [
    `Hi ${first},`,
    "",
    `Here's the invoice for order ${i.orderNumber} (${new Date(i.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}).`,
    "",
    ...lines,
    "",
    `Order total: ${usd(i.subtotal)}`,
    ...(i.creditApplied > 0 ? [`AX credit applied: −${usd(i.creditApplied)}`] : []),
    `Amount due: ${usd(i.amountDue)}`,
    "",
    i.paymentInstructions ? `How to pay: ${i.paymentInstructions}` : "How to pay: Zelle, or reply and we'll send a payment link.",
    "Please put the order number in the payment note.",
    "",
    "Production starts as soon as it's paid. Thanks!",
    "— Team AX",
  ].join("\n");
  return { subject: `AX invoice · Order ${i.orderNumber} · ${usd(i.amountDue)} due`, body };
}

export function mailtoHref(to: string | null, email: { subject: string; body: string }): string {
  const q = `subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
  return `mailto:${to ?? ""}?${q}`;
}

/** Everything an invoice needs, read fresh for one order. */
export async function fetchInvoice(orderId: string, entityId: string, clientName: string): Promise<{ to: string | null; input: InvoiceInput }> {
  const [orderRes, itemsRes, athleteRes] = await Promise.all([
    t("bulk_order_requests")
      .select("id, order_number, created_at, wholesale_subtotal, credit_applied, amount_due, requested_by, customer_email")
      .eq("id", orderId)
      .maybeSingle(),
    t("bulk_order_items")
      .select("product_name_snapshot, color, size, quantity, unit_wholesale_price, line_subtotal")
      .eq("order_request_id", orderId),
    t("athletes").select("metadata").eq("id", entityId).maybeSingle(),
  ]);
  if (orderRes.error) throw new Error(orderRes.error.message);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  const o = orderRes.data as Row | null;
  if (!o) throw new Error("Order not found.");

  let to = typeof o.customer_email === "string" && o.customer_email ? o.customer_email : null;
  if (!to && o.requested_by) {
    const prof = await t("user_profiles").select("email").eq("id", String(o.requested_by)).maybeSingle();
    to = ((prof.data as Row | null)?.email as string | undefined) ?? null;
  }
  const n = (v: unknown) => (v == null ? null : Number(v));
  const terms = parseBrandTerms(((athleteRes.data as Row | null)?.metadata as Record<string, unknown> | undefined)?.brand_terms);
  return {
    to,
    input: {
      orderNumber: String(o.order_number ?? String(o.id).slice(0, 8)),
      clientName,
      createdAt: String(o.created_at),
      lines: ((itemsRes.data ?? []) as Row[]).map((r) => ({
        title: String(r.product_name_snapshot ?? "Item"),
        color: (r.color as string | null) || null,
        size: (r.size as string | null) || null,
        quantity: Number(r.quantity ?? 0),
        unitPrice: n(r.unit_wholesale_price),
        lineTotal: n(r.line_subtotal),
      })),
      subtotal: n(o.wholesale_subtotal),
      creditApplied: Number(o.credit_applied ?? 0),
      amountDue: n(o.amount_due),
      paymentInstructions: terms.paymentInstructions.trim() || null,
    },
  };
}

export function useSetPaymentStatus(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: PaymentStatus }) => {
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { payment_status: status };
      if (status === "invoiced") patch.invoiced_at = now;
      if (status === "paid") patch.paid_at = now;
      if (status === "unpaid") Object.assign(patch, { invoiced_at: null, paid_at: null });
      const res = (await must(t("bulk_order_requests").update(patch as never).eq("id", orderId).select("id"))) as { data: Row[] | null };
      if (!res.data?.length) throw new Error("The order was not updated — you may not have access to it.");
      return status;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["v2", "entity-orders", entityId] }),
  });
}
