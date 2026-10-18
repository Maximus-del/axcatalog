// GET /products (?collection=, hidden) — the My Gear grid, in the contract's shape.
//
// Built on the products the portal shell already loads (usePortalProducts:
// RLS-scoped to the athlete's own products, status published|internal), plus
// which collection each product sits in (collection_products — the table the
// app writes) and the athlete's hidden list. No new product query.
//
// unitPrice is the BULK SHEET price (decided 2026-10-15), the same rule the
// server charges by (portal_sheet_unit_price). It is shown for display; the
// order is re-priced on the server, and a difference is reported, not charged.

import { supabase } from "@/integrations/supabase/client";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import type { Destination, Money, PortalScope, Product } from "./contract";
import { money } from "./money";

/**
 * The bulk sheet's per-product price. MUST match portal_sheet_unit_price() in
 * supabase/migrations/20261015150000_portal_stage2_orders.sql — a test pins
 * the two to the same cases.
 */
export function sheetUnitPrice(
  p: Pick<PortalProduct, "product_type" | "title" | "athlete_unit_price" | "wholesale_price" | "price"> & { athlete_price?: number | null },
): {
  athleteUnit: number;
  compareUnit: number;
} {
  const hay = `${p.product_type || ""} ${p.title || ""}`.toLowerCase();
  const rule = hay.includes("hood")
    ? { athleteUnit: 35, compareUnit: 48 }
    : hay.includes("tee") || hay.includes("tshirt") || hay.includes("t-shirt") || hay.includes("shirt")
      ? { athleteUnit: 18, compareUnit: 25 }
      : { athleteUnit: p.athlete_unit_price ?? 18, compareUnit: p.wholesale_price ?? p.price ?? 25 };
  // The price AX set in the V2 pricing sheet wins (products.athlete_price).
  if (p.athlete_price != null) {
    return { athleteUnit: p.athlete_price, compareUnit: Math.max(rule.compareUnit, p.athlete_price) };
  }
  return rule;
}

type Img = PortalProduct["images"][number] & { metadata?: Record<string, unknown> | null };

function viewOf(img: Img): string | null {
  // AX's choice for the portal (V2 → Portal lineup) beats any older tag.
  const chosen = (img as { portalView?: string | null }).portalView;
  if (chosen) return chosen;
  const v = img.metadata?.view ?? img.metadata?.side ?? img.metadata?.placement;
  return typeof v === "string" ? v.toLowerCase() : null;
}

/**
 * Front and back. The image AX picked for each side wins (portalView, from
 * metadata.portal_view); then an older metadata.view tag; otherwise front is
 * the primary image and back is the next one.
 */
export function frontBack(p: Pick<PortalProduct, "images" | "primary_image_url">): { front: string | null; back: string | null } {
  const imgs = (p.images ?? []) as Img[];
  const tagged = (side: string) => imgs.find((i) => viewOf(i) === side)?.url ?? null;
  const front = tagged("front") ?? imgs[0]?.url ?? p.primary_image_url ?? null;
  const back = tagged("back") ?? imgs.find((i) => i.url && i.url !== front)?.url ?? null;
  return { front, back };
}

export function isOrderable(p: Pick<PortalProduct, "status" | "variants">): boolean {
  // Archived: off the website, so Shopify stock no longer applies — AX reprints
  // it from the design file (portal_quote_order treats it the same way).
  if (p.status === "archived") return true;
  if (p.status !== "published" && p.status !== "internal") return false;
  const real = (p.variants ?? []).filter((v) => (v.color ?? "") !== "" || (v.size ?? "") !== "");
  // No real variants → made to order, as the bulk sheet treats it.
  return real.length === 0 || real.some((v) => v.available === true);
}

/** Only a real Shopify handle makes a public link; a guessed slug URL may not exist. */
export function publicUrlOf(p: Pick<PortalProduct, "shopify_handle">): string | null {
  return p.shopify_handle ? `https://www.athletexclusive.com/products/${p.shopify_handle}` : null;
}

export function toContractProduct(
  p: PortalProduct,
  destinationIds: string[],
  hidden: boolean,
): Product {
  const { athleteUnit } = sheetUnitPrice(p);
  const { front, back } = frontBack(p);
  return {
    id: p.id,
    destinationIds,
    title: p.title,
    unitPrice: money(athleteUnit, "USD") as Money,
    frontImage: front,
    backImage: back,
    publicUrl: publicUrlOf(p),
    hidden,
    lifecycle: p.status === "archived" ? "archive" : "live",
    orderable: isOrderable(p),
  };
}

/** product id → destination ids, from collection_products (RLS: own products only). */
export async function fetchProductDestinations(
  scope: PortalScope,
  destinations: Destination[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (destinations.length === 0) return out;
  const byCollection = new Map(destinations.map((d) => [d.collectionId, d.id]));
  const { data, error } = await supabase
    .from("collection_products")
    .select("collection_id, product_id")
    .in("collection_id", [...byCollection.keys()]);
  if (error) return out;
  for (const row of (data ?? []) as { collection_id: string; product_id: string }[]) {
    const dest = byCollection.get(row.collection_id);
    if (!dest) continue;
    const list = out.get(row.product_id) ?? [];
    if (!list.includes(dest)) list.push(dest);
    out.set(row.product_id, list);
  }
  void scope; // scope is enforced by RLS on collection_products; kept for symmetry with other adapter calls
  return out;
}

/** Filter for /portal/gear?collection=…&hidden=… */
export function filterProducts(
  products: Product[],
  opts: { collection?: string | null; hidden?: "exclude" | "only" | "include"; lifecycle?: "live" | "archive" | "all" } = {},
): Product[] {
  const hidden = opts.hidden ?? "exclude";
  const lifecycle = opts.lifecycle ?? "live";
  return products.filter((p) => {
    if (lifecycle !== "all" && p.lifecycle !== lifecycle) return false;
    if (opts.collection && opts.collection !== "all" && !p.destinationIds.includes(opts.collection)) return false;
    if (hidden === "exclude" && p.hidden) return false;
    if (hidden === "only" && !p.hidden) return false;
    return true;
  });
}
