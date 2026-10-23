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
import { previewOf } from "./pricing-sheet";

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

/**
 * Where an invoice goes: the client's own login. The person who placed the
 * order counts only if they ARE the client — an invoice AX built is
 * "requested" by AX, and must not be emailed back to AX.
 */
async function clientEmailFor(athleteId: string, requestedBy: string | null): Promise<string | null> {
  const links = await t("user_athlete_links").select("user_id").eq("athlete_id", athleteId);
  const ids = ((links.data ?? []) as Row[]).map((l) => String(l.user_id));
  if (!ids.length) return null;
  const profs = ((await t("user_profiles").select("id, email, role, is_platform_admin").in("id", ids)).data ?? []) as Row[];
  const isClient = (p: Row) => !p.is_platform_admin && !["admin", "owner", "executive"].includes(String(p.role ?? "")) && !!p.email;
  const placedBy = profs.find((p) => String(p.id) === requestedBy && isClient(p));
  const client = placedBy ?? profs.find(isClient);
  return (client?.email as string | undefined) ?? null;
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

  const to =
    typeof o.customer_email === "string" && o.customer_email ? o.customer_email : await clientEmailFor(entityId, (o.requested_by as string | null) ?? null);
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

// ----------------------------------------------------------- the document

export interface InvoiceDocument extends InvoiceInput {
  id: string;
  athleteId: string;
  clientEmail: string | null;
  status: string;
  paymentStatus: PaymentStatus;
  invoicedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  units: number;
  lines: Array<InvoiceLine & { productId: string | null; notes: string | null; imageUrl: string | null }>;
}

/** Everything the printable invoice shows, read fresh for one order. */
export async function fetchInvoiceDocument(orderId: string): Promise<InvoiceDocument> {
  const orderRes = await t("bulk_order_requests")
    .select("id, athlete_id, order_number, created_at, status, notes, wholesale_subtotal, credit_applied, amount_due, total_units, requested_by, customer_email, payment_status, invoiced_at, paid_at")
    .eq("id", orderId)
    .maybeSingle();
  if (orderRes.error) throw new Error(orderRes.error.message);
  const o = orderRes.data as Row | null;
  if (!o) throw new Error("That order does not exist, or you do not have access to it.");
  const athleteId = String(o.athlete_id ?? "");
  const [itemsRes, athleteRes] = await Promise.all([
    t("bulk_order_items")
      .select("product_id, product_name_snapshot, color, size, quantity, unit_wholesale_price, line_subtotal, notes, created_at")
      .eq("order_request_id", orderId)
      .order("created_at"),
    t("athletes").select("display_name, first_name, last_name, metadata").eq("id", athleteId).maybeSingle(),
  ]);
  if (itemsRes.error) throw new Error(itemsRes.error.message);
  const items = (itemsRes.data ?? []) as Row[];
  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean) as string[])];
  const imgs = productIds.length
    ? ((await t("product_images").select("product_id, file_name, metadata, storage_bucket, storage_path, is_primary, sort_order").in("product_id", productIds)).data ?? []) as Row[]
    : [];
  const imageBy = new Map(productIds.map((id) => [id, previewOf(imgs.filter((i) => i.product_id === id))]));

  const email =
    typeof o.customer_email === "string" && o.customer_email ? o.customer_email : await clientEmailFor(athleteId, (o.requested_by as string | null) ?? null);
  const a = athleteRes.data as Row | null;
  const name = String(a?.display_name || [a?.first_name, a?.last_name].filter(Boolean).join(" ") || "Client");
  const terms = parseBrandTerms((a?.metadata as Record<string, unknown> | undefined)?.brand_terms);
  const n = (v: unknown) => (v == null ? null : Number(v));
  const ps = String(o.payment_status ?? "unpaid");
  return {
    id: String(o.id),
    athleteId,
    orderNumber: String(o.order_number ?? String(o.id).slice(0, 8)),
    clientName: name,
    clientEmail: email,
    createdAt: String(o.created_at),
    status: String(o.status ?? ""),
    paymentStatus: (ps in PAYMENT_LABEL ? ps : "unpaid") as PaymentStatus,
    invoicedAt: (o.invoiced_at as string | null) ?? null,
    paidAt: (o.paid_at as string | null) ?? null,
    notes: typeof o.notes === "string" ? o.notes.split("\n").filter((l) => !l.startsWith("Invoice builder ·")).join("\n").trim() || null : null,
    units: Number(o.total_units ?? items.reduce((s, i) => s + Number(i.quantity ?? 0), 0)),
    lines: items.map((r) => ({
      productId: (r.product_id as string | null) ?? null,
      title: String(r.product_name_snapshot ?? "Item"),
      color: (r.color as string | null) || null,
      size: (r.size as string | null) || null,
      quantity: Number(r.quantity ?? 0),
      unitPrice: n(r.unit_wholesale_price),
      lineTotal: n(r.line_subtotal),
      notes: (r.notes as string | null) || null,
      imageUrl: r.product_id ? (imageBy.get(String(r.product_id)) ?? null) : null,
    })),
    subtotal: n(o.wholesale_subtotal),
    creditApplied: Number(o.credit_applied ?? 0),
    amountDue: n(o.amount_due),
    paymentInstructions: terms.paymentInstructions.trim() || null,
  };
}

/**
 * Pure: a brief to paste into Claude Design (or any designer) that carries every
 * fact the invoice needs, so a designed version can never disagree with the order.
 */
export function claudeDesignBrief(d: InvoiceDocument, opts: { from: string; dueLabel: string }): string {
  const lines = d.lines.map((l) => ({
    product: l.title,
    details: [l.color, l.size, l.notes].filter(Boolean).join(" · ") || undefined,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    amount: l.lineTotal,
    image: l.imageUrl ?? undefined,
  }));
  const data = {
    invoice_number: d.orderNumber,
    issue_date: new Date(d.createdAt).toISOString().slice(0, 10),
    due: opts.dueLabel,
    status: PAYMENT_LABEL[d.paymentStatus],
    from: opts.from,
    bill_to: { name: d.clientName, email: d.clientEmail ?? undefined },
    lines,
    subtotal: d.subtotal,
    ax_credit_applied: d.creditApplied || undefined,
    amount_due: d.amountDue,
    payment_instructions: d.paymentInstructions ?? "Zelle, or pay through the emailed invoice. Put the invoice number in the payment note.",
    notes: d.notes ?? undefined,
  };
  return [
    "Design a one-page, print-ready invoice (US Letter, portrait) for Athlete Xclusive (AX), a premium athlete merchandise company.",
    "Brand: wordmark ATHLETE XCLUSIVE with only the X in AX green (#03AC13); black ink on white; clean, modern, generous whitespace; tabular numbers right-aligned.",
    "Layout: wordmark top-left, INVOICE + number + dates + status top-right; From and Bill to blocks; a line-item table with a small product image, product, details, qty, unit price, amount; totals block right-aligned with Amount due emphasised; a How to pay box; a short thank-you footer.",
    "Use exactly these figures — do not round, recalculate or invent anything:",
    "",
    JSON.stringify(data, null, 2),
  ].join("\n");
}
