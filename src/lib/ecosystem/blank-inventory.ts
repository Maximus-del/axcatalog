// What a blank's inventory actually says.
//
// Shopify owns the numbers. This module owns the READING of them: it turns a
// set of variants and their per-location levels into the three states the
// dashboard shows, and it never invents, adjusts or writes a quantity.
//
// The distinction the whole thing rests on:
//
//   AVAILABLE    managed, linked, offered, and something is in stock
//   SOLD OUT     managed, linked, offered, and nothing is in stock right now
//   HIDDEN       not offered, whatever the stock says
//   NOT LINKED   managed and offered, but no Shopify product to read from
//   NOT MANAGED  a reference blank whose stock we have never counted
//
// Each is a different sentence about a different thing, and every pair of them
// would be destructive to merge.
//
// "Hidden" is a decision a person made; "sold out" is a fact Shopify reported.
// Merging those loses whether we stopped selling something or sold through it.
// Hidden is therefore checked FIRST and wins outright — a hidden blank with 400
// units is still hidden.
//
// "Not linked" is an absence of information, and it is emphatically NOT sold
// out. Reading a missing quantity as zero would put "Sold Out" against garments
// sitting in the warehouse, and an operator acting on that would decline real
// orders. Absence of evidence gets its own name.
//
// "Not managed" is the boundary itself. Most blanks are reference garments we
// design against and have never counted. They are not out of stock — we simply
// have no claim about their stock at all, and they must be excluded from every
// inventory total rather than counted as zero. Saying "Sold Out" about a
// garment nobody ever inventoried is a statement we have no basis for.

export type AvailabilityStatus =
  | "available"
  | "sold_out"
  | "hidden"
  | "not_linked"
  | "not_managed";

/** Shopify's own product status, which is a different question entirely. */
export type ShopifyStatus = "active" | "draft" | "archived";

export interface InventoryLevel {
  shopify_location_id: string;
  location_name: string;
  /** Shopify's "available" figure. Committed and incoming are NOT this. */
  available_quantity: number;
}

export interface VariantLike {
  shopify_variant_id: string;
  color: string | null;
  size: string | null;
  sku: string | null;
  barcode: string | null;
  levels: InventoryLevel[];
}

/**
 * One variant's sellable count, summed across locations.
 *
 * Negative levels are real — Shopify reports them after an oversell — and they
 * are kept rather than clamped, because a location sitting at -3 is something
 * an operator needs to see. The clamp belongs at the point of display, not in
 * the arithmetic.
 */
export function variantAvailable(v: VariantLike): number {
  return v.levels.reduce((n, l) => n + (Number(l.available_quantity) || 0), 0);
}

/** Total sellable across every variant of a product. */
export function totalAvailable(variants: VariantLike[]): number {
  return variants.reduce((n, v) => n + variantAvailable(v), 0);
}

/**
 * The three-state rule, exactly as specified.
 *
 * Written as an early return on `hidden` rather than as a ternary chain so it
 * cannot be reordered by accident: no quantity is even consulted for a hidden
 * blank.
 */
export function availabilityStatusOf(input: {
  isHidden: boolean;
  /** Explicit approval. Absent or false means we make no inventory claim. */
  isInventoryManaged?: boolean;
  /** The Shopify product this blank maps to. Null means we cannot know a quantity. */
  shopifyProductId?: string | null;
  totalAvailable: number;
}): AvailabilityStatus {
  // Order matters and is load-bearing.
  //
  // Hidden first: a presentation decision overrides everything, so a hidden
  // blank never leaks its stock into a customer-facing surface.
  if (input.isHidden) return "hidden";

  // Managed second, BEFORE the link check. An unmanaged blank must never reach
  // "not_linked" either — that would put it in an inventory queue asking to be
  // linked, when the truth is we deliberately do not track it.
  if (!input.isInventoryManaged) return "not_managed";

  if (!input.shopifyProductId) return "not_linked";
  return input.totalAvailable > 0 ? "available" : "sold_out";
}

export function statusOfProduct(
  isHidden: boolean,
  variants: VariantLike[],
  shopifyProductId?: string | null,
  isInventoryManaged = true,
): AvailabilityStatus {
  return availabilityStatusOf({
    isHidden,
    isInventoryManaged,
    shopifyProductId,
    totalAvailable: totalAvailable(variants),
  });
}

/**
 * The states that represent a real inventory claim.
 *
 * Anything outside this set must be left out of unit totals, barcode health,
 * location coverage and sync health — not counted as zero. This is the single
 * predicate every summary should filter on.
 */
export function countsTowardInventory(status: AvailabilityStatus): boolean {
  return status === "available" || status === "sold_out";
}

export const STATUS_LABELS: Record<AvailabilityStatus, string> = {
  available: "Available",
  sold_out: "Sold Out",
  hidden: "Hidden",
  not_linked: "Not Linked",
  not_managed: "Not Managed",
};

// ---- Colour and size breakdown --------------------------------------------

export interface ColorAvailability {
  color: string;
  available: number;
  /** Sizes that have stock, in the order they were given. */
  sizesInStock: string[];
  /** Sizes that exist for this colour but are at zero. */
  sizesSoldOut: string[];
  soldOut: boolean;
}

/**
 * Availability per colour, and per size within it.
 *
 * A product is rarely uniformly in or out of stock: one colour sells through
 * while another sits, and within a colour the middle sizes go first. Reporting
 * only the product total hides both, so the operator sees "Available" and finds
 * out at order time that the only thing left is 3XL.
 */
export function byColor(variants: VariantLike[]): ColorAvailability[] {
  const groups = new Map<string, VariantLike[]>();
  for (const v of variants) {
    const key = v.color ?? "—";
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }

  return [...groups.entries()].map(([color, vs]) => {
    const sizesInStock: string[] = [];
    const sizesSoldOut: string[] = [];
    for (const v of vs) {
      const label = v.size ?? "—";
      (variantAvailable(v) > 0 ? sizesInStock : sizesSoldOut).push(label);
    }
    const available = totalAvailable(vs);
    return { color, available, sizesInStock, sizesSoldOut, soldOut: available <= 0 };
  });
}

// ---- Barcode integrity ----------------------------------------------------

export type BarcodeIssue = "missing" | "duplicate";

export interface BarcodeReport {
  /** Variants with no barcode at all. */
  missing: VariantLike[];
  /** Barcode → the variants sharing it, only where more than one does. */
  duplicates: { barcode: string; variants: VariantLike[] }[];
  /** Variants that are fine. */
  ok: VariantLike[];
  complete: boolean;
}

function cleanBarcode(v: VariantLike): string | null {
  const b = (v.barcode ?? "").trim();
  return b.length > 0 ? b : null;
}

/**
 * Which variants cannot be scanned, and which would scan to the wrong thing.
 *
 * Both are reported rather than repaired. A blank barcode is not an invitation
 * to generate one — a scanner in a warehouse has to agree with Shopify, and a
 * barcode this dashboard invented would agree with nothing. A duplicate is
 * worse: picking a "winner" would silently attach stock movements to whichever
 * variant sorted first.
 */
export function barcodeReport(variants: VariantLike[]): BarcodeReport {
  const missing: VariantLike[] = [];
  const byCode = new Map<string, VariantLike[]>();

  for (const v of variants) {
    const code = cleanBarcode(v);
    if (!code) { missing.push(v); continue; }
    byCode.set(code, [...(byCode.get(code) ?? []), v]);
  }

  const duplicates = [...byCode.entries()]
    .filter(([, vs]) => vs.length > 1)
    .map(([barcode, vs]) => ({ barcode, variants: vs }));

  const dupIds = new Set(duplicates.flatMap((d) => d.variants.map((v) => v.shopify_variant_id)));
  const ok = variants.filter(
    (v) => cleanBarcode(v) !== null && !dupIds.has(v.shopify_variant_id),
  );

  return {
    missing,
    duplicates,
    ok,
    complete: missing.length === 0 && duplicates.length === 0,
  };
}

/** Barcodes colliding across the WHOLE catalogue, not just within one product. */
export function crossProductDuplicates(
  products: { id: string; variants: VariantLike[] }[],
): { barcode: string; hits: { productId: string; variant: VariantLike }[] }[] {
  const byCode = new Map<string, { productId: string; variant: VariantLike }[]>();
  for (const p of products) {
    for (const v of p.variants) {
      const code = cleanBarcode(v);
      if (!code) continue;
      byCode.set(code, [...(byCode.get(code) ?? []), { productId: p.id, variant: v }]);
    }
  }
  return [...byCode.entries()]
    .filter(([, hits]) => hits.length > 1)
    .map(([barcode, hits]) => ({ barcode, hits }));
}

// ---- Locations ------------------------------------------------------------

export interface LocationTotal {
  shopify_location_id: string;
  location_name: string;
  available: number;
}

/** Stock per Shopify location across a product's variants. */
export function byLocation(variants: VariantLike[]): LocationTotal[] {
  const totals = new Map<string, LocationTotal>();
  for (const v of variants) {
    for (const l of v.levels) {
      const cur = totals.get(l.shopify_location_id);
      totals.set(l.shopify_location_id, {
        shopify_location_id: l.shopify_location_id,
        location_name: l.location_name,
        available: (cur?.available ?? 0) + (Number(l.available_quantity) || 0),
      });
    }
  }
  return [...totals.values()].sort((a, b) => b.available - a.available);
}

// ---- Sync freshness -------------------------------------------------------

/**
 * Whether a cached quantity is still worth showing.
 *
 * The rule from the spec is that a failed sync must never overwrite the last
 * known good data — so the cache is kept and LABELLED rather than blanked. An
 * operator can act on "12 units, as of six hours ago"; they cannot act on a
 * dash, and they would be actively misled by a confident "12" that is a week
 * stale.
 */
export function syncAge(lastSyncAt: string | null, now: number): {
  minutes: number | null;
  stale: boolean;
  label: string;
} {
  if (!lastSyncAt) return { minutes: null, stale: true, label: "never synced" };
  const ms = now - new Date(lastSyncAt).getTime();
  if (!Number.isFinite(ms)) return { minutes: null, stale: true, label: "never synced" };

  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const stale = minutes > 60;
  if (minutes < 1) return { minutes, stale, label: "just now" };
  if (minutes < 60) return { minutes, stale, label: `${minutes}m ago` };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { minutes, stale, label: `${hours}h ago` };
  return { minutes, stale, label: `${Math.floor(hours / 24)}d ago` };
}

// ---- Webhook idempotency --------------------------------------------------

/**
 * Should this webhook delivery be acted on?
 *
 * Shopify retries, and a duplicate delivery of the same inventory event must
 * not double-apply. Shopify also does not guarantee ORDER, so an older event
 * arriving after a newer one has to be dropped rather than replayed — otherwise
 * a stale quantity overwrites a fresh one and the dashboard silently regresses.
 */
export function shouldApplyWebhook(input: {
  webhookId: string | null;
  seenWebhookIds: Set<string>;
  eventAt: string | null;
  lastAppliedAt: string | null;
}): { apply: boolean; reason: "ok" | "duplicate" | "out_of_order" | "unidentified" } {
  if (input.webhookId && input.seenWebhookIds.has(input.webhookId)) {
    return { apply: false, reason: "duplicate" };
  }
  if (!input.eventAt) {
    // No timestamp to order by. Applying is the safer failure: a reconciliation
    // pass will correct it, whereas dropping loses the update entirely.
    return { apply: true, reason: input.webhookId ? "ok" : "unidentified" };
  }
  if (input.lastAppliedAt && new Date(input.eventAt) < new Date(input.lastAppliedAt)) {
    return { apply: false, reason: "out_of_order" };
  }
  return { apply: true, reason: "ok" };
}
