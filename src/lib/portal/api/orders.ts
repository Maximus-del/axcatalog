// POST /order-requests, the quote before it, and GET /orders.
//
// The server decides the price (bulk-sheet rules, decided 2026-10-15), checks
// stock against the Shopify-synced variants, applies credit and records what is
// owed — in one transaction (portal_submit_order_request). The browser sends
// WHAT it wants, never what it costs.
//
// Idempotency: make ONE key when the person starts a checkout, and send that
// same key on every retry of that checkout. A double-click, a flaky network
// retry or a back-button resubmit then returns the original order instead of
// creating a second one and debiting credit twice. Make a new key only when the
// cart changes or after a successful submit.
//
// Price changed: pass the subtotal the person saw as `expectedSubtotal`. If
// the server's price differs the request is refused with 409 and the error's
// `quote` carries the new price to show them. Nothing is written.

import { supabase } from "@/integrations/supabase/client";
import type { Money, Order, Page, PortalScope } from "./contract";
import { PortalApiError } from "./contract";
import { isMissingFunction, money, toApiError } from "./money";

export type OrderPackage = "standard" | "game_day" | "camp" | "vip" | "custom";
export type Turnaround = "standard" | "rush";

export interface OrderLineInput {
  productId: string;
  color?: string | null;
  size?: string | null;
  quantity: number;
  /** Free-form personalisation (Game Day name/number etc.). Stored on the line. */
  customization?: Record<string, unknown> | null;
}

export interface QuoteLine {
  productId: string;
  title: string;
  color: string | null;
  size: string | null;
  quantity: number;
  unitPrice: Money | null;
  effectiveUnitPrice: Money | null;
  compareUnitPrice: Money | null;
  lineTotal: Money | null;
  shopifyVariantId: string | null;
}

export interface Quote {
  units: number;
  discountPct: number;
  surcharge: Money | null;
  subtotal: Money | null;
  compareTotal: Money | null;
  savings: Money | null;
  creditAvailable: Money | null;
  lines: QuoteLine[];
  /** Raw subtotal in dollars, to echo back as expectedSubtotal. */
  subtotalDollars: number;
}

export interface OrderRequestInput {
  idempotencyKey: string;
  items: OrderLineInput[];
  package?: OrderPackage;
  turnaround?: Turnaround;
  /** Dollars of credit the person chose to use. The server caps it at balance and order total. */
  useCredit?: number;
  notes?: string | null;
  /** The subtotal (dollars) the person was shown. Omit only for units-only requests. */
  expectedSubtotal?: number | null;
  /** Units for a request with no product lines (e.g. Camp). */
  unitsOverride?: number | null;
}

export interface OrderRequestResult {
  orderId: string;
  orderNumber: string;
  status: string;
  subtotal: Money | null;
  creditApplied: Money | null;
  amountDue: Money | null;
  /** True when this was a retry of a request already accepted. */
  replayed: boolean;
}

type Json = Record<string, unknown>;

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // RFC 4122 v4 from getRandomValues, for older browsers.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const toLines = (items: OrderLineInput[]) =>
  items.map((i) => ({
    productId: i.productId,
    color: i.color ?? null,
    size: i.size ?? null,
    quantity: i.quantity,
    ...(i.customization ? { customization: i.customization } : {}),
  }));

/** Pure: server quote JSON → typed. Exported for tests. */
export function parseQuote(raw: unknown): Quote {
  const q = (raw ?? {}) as Json;
  const cur = typeof q.currency === "string" ? q.currency : "USD";
  const m = (v: unknown) => money(v, cur);
  return {
    units: Number(q.units ?? 0),
    discountPct: Number(q.discountPct ?? 0),
    surcharge: m(q.surcharge),
    subtotal: m(q.subtotal),
    compareTotal: m(q.compareTotal),
    savings: m(q.savings),
    creditAvailable: m(q.creditAvailable),
    subtotalDollars: Number(q.subtotal ?? 0),
    lines: ((Array.isArray(q.lines) ? q.lines : []) as Json[]).map((l) => ({
      productId: String(l.productId),
      title: String(l.title ?? ""),
      color: (l.color as string | null) ?? null,
      size: (l.size as string | null) ?? null,
      quantity: Number(l.quantity ?? 0),
      unitPrice: m(l.unitPrice),
      effectiveUnitPrice: m(l.effectiveUnitPrice),
      compareUnitPrice: m(l.compareUnitPrice),
      lineTotal: m(l.lineTotal),
      shopifyVariantId: (l.shopifyVariantId as string | null) ?? null,
    })),
  };
}

/** The 409 for "price changed" carries the new quote in its details. */
export function quoteFromConflict(e: unknown): Quote | null {
  if (!(e instanceof PortalApiError) || e.status !== 409) return null;
  const details = (e as PortalApiError & { details?: string }).details;
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as Json;
    return parsed.quote ? parseQuote(parsed.quote) : null;
  } catch {
    return null;
  }
}

function withDetails(err: { code?: string; message?: string; details?: string | null }): PortalApiError {
  const e = toApiError(err) as PortalApiError & { details?: string };
  if (err.details) e.details = err.details;
  return e;
}

export async function quoteOrder(
  scope: PortalScope,
  items: OrderLineInput[],
  opts: { turnaround?: Turnaround; unitsOverride?: number | null } = {},
): Promise<Quote> {
  const { data, error } = await supabase.rpc("portal_quote_order" as never, {
    _athlete_id: scope.athleteId,
    _items: toLines(items),
    _turnaround: opts.turnaround ?? "standard",
    _units_override: opts.unitsOverride ?? null,
  } as never);
  if (error) throw withDetails(error);
  return parseQuote(data);
}

/** Thrown when the server functions are not deployed yet; callers may use the legacy path. */
export class OrderFunctionMissing extends Error {}

export async function submitOrderRequest(scope: PortalScope, input: OrderRequestInput): Promise<OrderRequestResult> {
  if (scope.viewingAs) {
    // The server refuses too; this just saves the round trip and says why.
    throw new PortalApiError(
      { code: "42501", message: "You're viewing as this client. Orders can't be placed from View as.", requestId: "local" },
      403,
    );
  }
  const { data, error } = await supabase.rpc("portal_submit_order_request" as never, {
    _athlete_id: scope.athleteId,
    _idempotency_key: input.idempotencyKey,
    _items: toLines(input.items),
    _credit: Math.max(0, Math.round((input.useCredit ?? 0) * 100) / 100),
    _package: input.package ?? "standard",
    _turnaround: input.turnaround ?? "standard",
    _notes: input.notes ?? null,
    _expected_subtotal: input.expectedSubtotal ?? null,
    _units_override: input.unitsOverride ?? null,
  } as never);
  if (error) {
    if (isMissingFunction(error)) throw new OrderFunctionMissing("portal_submit_order_request is not deployed");
    throw withDetails(error);
  }
  const r = (data ?? {}) as Json;
  const cur = typeof r.currency === "string" ? r.currency : "USD";
  return {
    orderId: String(r.orderId),
    orderNumber: String(r.orderNumber),
    status: String(r.status ?? "submitted"),
    subtotal: money(r.subtotal, cur),
    creditApplied: money(r.creditApplied, cur),
    amountDue: money(r.amountDue, cur),
    replayed: r.replayed === true,
  };
}

/** GET /orders — the athlete's order requests, newest first. Cursor = created_at of the last row. */
export async function fetchOrders(scope: PortalScope, cursor: string | null = null, limit = 24): Promise<Page<Order>> {
  const size = Math.min(Math.max(limit, 1), 100);
  let q = supabase
    .from("bulk_order_requests")
    .select("id, order_number, created_at, total_units, status, wholesale_subtotal, amount_due, payment_status, payment_terms, due_date, payment_url")
    .eq("athlete_id", scope.athleteId)
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(size + 1);
  if (cursor) q = q.lt("created_at", cursor);
  const { data, error } = await q;
  if (error) throw toApiError(error);
  const rows = (data ?? []) as unknown as Json[];
  const items = rows.slice(0, size).map((r) => ({
    id: String(r.id),
    number: String(r.order_number ?? ""),
    createdAt: String(r.created_at),
    units: Number(r.total_units ?? 0),
    status: String(r.status),
    total: money(r.wholesale_subtotal, "USD"),
    // Order requests are not tied to a collection today.
    destinationId: null,
    amountDue: money(r.amount_due, "USD"),
    paymentStatus: typeof r.payment_status === "string" ? r.payment_status : null,
    paymentTerms: typeof r.payment_terms === "string" ? r.payment_terms : null,
    dueDate: typeof r.due_date === "string" ? r.due_date : null,
    paymentUrl: typeof r.payment_url === "string" ? r.payment_url : null,
  }));
  return { items, nextCursor: rows.length > size ? String(rows[size - 1].created_at) : null };
}
