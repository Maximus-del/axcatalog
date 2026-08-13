// Commerce foundation for the Player Portal builders (Game Day, Camp,
// custom product). Athlete-agnostic. Reuses the existing bulk_order_requests
// pipeline so orders are real; real-money payment is handed off to the AX
// backend checkout (integration point marked below).
import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/* Turnaround (configurable — BACKEND: move to org settings later)     */
/* ------------------------------------------------------------------ */

export interface TurnaroundOption {
  key: string;
  label: string;
  window: string;
  /** Flat surcharge in USD applied to the order. */
  surcharge: number;
}

export const TURNAROUND_OPTIONS: TurnaroundOption[] = [
  { key: "standard", label: "Standard", window: "7–10 days", surcharge: 0 },
  { key: "rush", label: "Rush", window: "3–4 days", surcharge: 40 },
];

/* ------------------------------------------------------------------ */
/* Print placements (simplified vs. the org print_zones coordinates)   */
/* ------------------------------------------------------------------ */

export interface PrintPlacement {
  key: string;
  surface: "front" | "back";
  label: string;
}

export const PRINT_PLACEMENTS: PrintPlacement[] = [
  { key: "front_left_chest", surface: "front", label: "Left Chest" },
  { key: "front_center", surface: "front", label: "Center" },
  { key: "front_oversized", surface: "front", label: "Oversized" },
  { key: "back_standard", surface: "back", label: "Standard" },
  { key: "back_oversized", surface: "back", label: "Oversized" },
];

/* ------------------------------------------------------------------ */
/* Camp bulk tiers                                                     */
/* ------------------------------------------------------------------ */

export interface BulkTier {
  min: number;
  label: string;
  note: string;
}

export const CAMP_TIERS: BulkTier[] = [
  { min: 25, label: "25+", note: "Camp pricing" },
  { min: 50, label: "50+", note: "Athlete bulk pricing" },
  { min: 100, label: "100+", note: "Best bulk pricing" },
  { min: 250, label: "250+", note: "Event pricing + custom design" },
  { min: 500, label: "500+", note: "Program pricing + dedicated support" },
];

export function tierForQty(qty: number): BulkTier {
  let t = CAMP_TIERS[0];
  for (const tier of CAMP_TIERS) if (qty >= tier.min) t = tier;
  return t;
}

/* ------------------------------------------------------------------ */
/* Credit math                                                         */
/* ------------------------------------------------------------------ */

export interface CreditMath {
  subtotal: number;
  creditApplied: number;
  amountDue: number;
}

/** Apply up to the available credit against a subtotal. */
export function computeCredit(subtotal: number, creditAvailable: number, apply: boolean): CreditMath {
  const creditApplied = apply ? Math.max(0, Math.min(creditAvailable, subtotal)) : 0;
  return {
    subtotal: Math.round(subtotal * 100) / 100,
    creditApplied: Math.round(creditApplied * 100) / 100,
    amountDue: Math.round((subtotal - creditApplied) * 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/* Order submission                                                    */
/* ------------------------------------------------------------------ */

export interface PortalOrderItem {
  product_id: string;
  product_name: string;
  size: string;
  quantity: number;
  color?: string | null;
  unit_price?: number | null;
  notes?: string | null;
}

export interface SubmitPortalOrderInput {
  organizationId: string;
  athleteId: string;
  userId: string;
  /** Line items for existing products (may be empty for a custom request). */
  items: PortalOrderItem[];
  /** Config summary stored on the request (kind, personalization, placement…). */
  summary: string;
  /** Explicit unit count for requests with no priced line items. */
  totalUnitsOverride?: number;
  creditToApply: number;
  amountDue: number;
  customerName?: string | null;
}

export interface SubmitPortalOrderResult {
  ok: boolean;
  orderId?: string;
  orderNumber?: string;
  error?: string;
}

function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900 + 100);
  return `BR-${year}-${rand}`;
}

/**
 * Creates a real bulk_order_request (+ items), applies AX credit, and records
 * the amount still due. This is the athlete-facing "order" — fulfillment /
 * real payment happens on the AX side. See buildExternalCheckoutHandoff().
 */
export async function submitPortalOrder(input: SubmitPortalOrderInput): Promise<SubmitPortalOrderResult> {
  try {
    const orderNumber = generateOrderNumber();
    const insertRow = {
      organization_id: input.organizationId,
      athlete_id: input.athleteId,
      requested_by: input.userId,
      status: "submitted" as const,
      order_number: orderNumber,
      channel: "portal",
      notes: input.summary,
      ...(input.customerName ? { customer_name: input.customerName } : {}),
      ...(input.items.length === 0 && input.totalUnitsOverride != null
        ? { total_units: input.totalUnitsOverride }
        : {}),
    };

    const { data: orderRow, error: orderErr } = await supabase
      .from("bulk_order_requests")
      .insert(insertRow)
      .select("id, order_number")
      .single();
    if (orderErr || !orderRow) throw orderErr ?? new Error("Order insert failed");

    if (input.items.length) {
      const items = input.items.map((it) => ({
        order_request_id: orderRow.id,
        product_id: it.product_id,
        product_name_snapshot: it.product_name,
        size: it.size,
        quantity: it.quantity,
        color: it.color ?? null,
        notes: it.notes ?? null,
        unit_retail_price: it.unit_price ?? null,
      }));
      const { error: itemsErr } = await supabase.from("bulk_order_items").insert(items);
      if (itemsErr) throw itemsErr;
    }

    if (input.creditToApply > 0) {
      await supabase.rpc("apply_credit_to_order", {
        _order_id: orderRow.id,
        _amount: input.creditToApply,
      });
    }

    const paymentMethod =
      input.creditToApply <= 0 ? "invoice" : input.amountDue <= 0.01 ? "credit" : "split";
    await supabase
      .from("bulk_order_requests")
      .update({ payment_method: paymentMethod, amount_due: input.amountDue })
      .eq("id", orderRow.id);

    return { ok: true, orderId: orderRow.id, orderNumber: orderRow.order_number ?? orderNumber };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Order submit failed" };
  }
}

/* ------------------------------------------------------------------ */
/* External checkout handoff — INTEGRATION POINT                       */
/* ------------------------------------------------------------------ */

export interface CheckoutHandoff {
  orderId: string;
  orderNumber: string;
  amountDue: number;
  creditApplied: number;
}

/**
 * INTEGRATION POINT (Phase 2+): when the AX store/back-end exposes a checkout
 * endpoint that can accept a pre-built order + remaining balance, return the
 * URL here. The portal will redirect the athlete to it to pay `amountDue`
 * (AX credit already applied). Until then this returns null and the order
 * stands as a submitted request that AX invoices/fulfills.
 *
 * Example future shape:
 *   return `https://shop.athletexclusive.com/checkout` +
 *     `?order=${h.orderNumber}&due=${h.amountDue}`;
 */
export function buildExternalCheckoutHandoff(_h: CheckoutHandoff): string | null {
  return null;
}
