// Cart checkout: how an owner pays for a portal order.
//
//   1. portal_submit_order_request places the order (server-priced).
//   2. portal_choose_payment — pay_now (5% off) or net_30 (approved clients).
//   3. Edge function portal-checkout makes the Shopify payment: an invoice
//      checkout for pay now, or an order with Net 30 terms.
// If step 3 can't run yet (store app not switched on for payments), the order
// still stands and AX sends the payment link — nothing is lost.
import { supabase } from "@/integrations/supabase/client";
import type { PortalScope } from "./contract";
import { toApiError } from "./money";
import type { ShipTo } from "../cart";

export type PaymentTerms = "pay_now" | "net_30";

export interface CheckoutOptions {
  /** Owners choose; Team logins send the order and AX invoices the owner. */
  canChoose: boolean;
  payNowPct: number;
  net30: boolean;
  shipTo: Partial<ShipTo> | null;
}

export interface PaymentChoice {
  terms: PaymentTerms;
  payNowDiscount: number;
  amountDue: number;
  dueDate: string | null;
}

export interface PaymentLink {
  ok: boolean;
  terms?: PaymentTerms;
  paymentUrl?: string | null;
  paymentStatus?: string | null;
  /** not_connected: online payment isn't switched on yet — AX sends the link. */
  code?: "not_connected" | "in_progress";
  error?: string;
}

type J = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

/** Pure; exported for tests. */
export function parseOptions(raw: unknown): CheckoutOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as J;
  const ship = r.shipTo && typeof r.shipTo === "object" ? (r.shipTo as Partial<ShipTo>) : null;
  return { canChoose: r.canChoose === true, payNowPct: num(r.payNowPct) || 5, net30: r.net30 === true, shipTo: ship };
}

export async function fetchCheckoutOptions(scope: PortalScope): Promise<CheckoutOptions> {
  const { data, error } = await supabase.rpc("portal_checkout_options" as never, { _athlete_id: scope.athleteId } as never);
  if (error) throw toApiError(error);
  return parseOptions(data);
}

export async function choosePayment(scope: PortalScope, orderId: string, terms: PaymentTerms, shipTo: Partial<ShipTo> | null): Promise<PaymentChoice> {
  const { data, error } = await supabase.rpc("portal_choose_payment" as never, {
    _athlete_id: scope.athleteId,
    _order_id: orderId,
    _terms: terms,
    _ship_to: shipTo,
  } as never);
  if (error) throw toApiError(error);
  const r = (data ?? {}) as J;
  return {
    terms: r.terms === "net_30" ? "net_30" : "pay_now",
    payNowDiscount: num(r.payNowDiscount),
    amountDue: num(r.amountDue),
    dueDate: typeof r.dueDate === "string" ? r.dueDate : null,
  };
}

/** Make (or fetch the existing) Shopify payment for an order. */
export async function startPayment(orderId: string, action: "start" | "refresh" = "start"): Promise<PaymentLink> {
  const { data, error } = await supabase.functions.invoke("portal-checkout", { body: { orderId, action } });
  if (error) {
    // Non-2xx: the function's JSON body carries the reason.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = (await ctx.json()) as PaymentLink;
        return { ok: false, code: body.code, error: body.error ?? "Couldn't set up payment." };
      } catch {
        /* fall through */
      }
    }
    return { ok: false, error: "Couldn't set up payment. Your order is saved — try Pay from Recent orders." };
  }
  return (data ?? { ok: false }) as PaymentLink;
}

/** Only ever send people to Shopify's own checkout / order pages. */
export function isSafePaymentUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (/(^|\.)myshopify\.com$/.test(u.hostname) || /(^|\.)shopify\.com$/.test(u.hostname) || u.hostname === "shop.athletexclusive.com");
  } catch {
    return false;
  }
}
