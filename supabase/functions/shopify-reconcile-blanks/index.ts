// Reconcile blank inventory against Shopify.
//
// POST { organization_id?: string, dry_run?: boolean }
//
// Reads Shopify and writes ONLY to blank_variants and blank_inventory_levels
// for blanks that carry a verified shopify_product_id. It creates nothing in
// Shopify, deletes nothing in Shopify, and modifies nothing in Shopify — it is
// a read of theirs and a write of ours.
//
// Three properties it has to have, and the reason each one matters:
//
//   Idempotent. Running it twice must leave the same state as running it once,
//   because it will be run on a schedule AND by hand AND after a failed
//   webhook. Every write is an upsert on a natural key.
//
//   Non-destructive on failure. A location that errors leaves its previous
//   quantities alone rather than zeroing them. A dashboard that shows a stale
//   number labelled stale is useful; one that shows a confident zero because a
//   fetch timed out will have someone decline a real order.
//
//   Blind to decorated merchandise. Only blanks with an explicit
//   shopify_product_id are touched, so nothing here can sweep an athlete's
//   "Jesus Bless Hoodie" into the blanks catalogue.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const API = "2024-10";

type Shop = { domain: string; token: string };

/** Follow Shopify's Link header until there are no more pages. */
async function* pages<T>(shop: Shop, path: string, key: string): AsyncGenerator<T[]> {
  let url = `https://${shop.domain}/admin/api/${API}/${path}`;
  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": shop.token, "Content-Type": "application/json" },
    });
    if (res.status === 429) {
      // Shopify's leaky bucket. Waiting is correct; giving up would leave a
      // partial reconciliation that looks complete.
      const retry = Number(res.headers.get("Retry-After") ?? "2");
      await new Promise((r) => setTimeout(r, retry * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Shopify ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);

    const body = await res.json();
    yield (body[key] ?? []) as T[];

    const link = res.headers.get("Link") ?? "";
    const next = /<([^>]+)>;\s*rel="next"/.exec(link);
    url = next ? next[1] : "";
  }
}

type SVariant = {
  id: number | string;
  title?: string | null;
  sku?: string | null;
  barcode?: string | null;
  inventory_item_id?: number | string | null;
  price?: string | number | null;
  option1?: string | null; option2?: string | null; option3?: string | null;
};
type SProduct = {
  id: number | string;
  title: string;
  status?: string;
  vendor?: string | null;
  options?: { name: string; position: number }[];
  variants?: SVariant[];
};
type SLocation = { id: number | string; name: string; active?: boolean };
type SLevel = { inventory_item_id: number | string; location_id: number | string; available: number | null };

/**
 * Which option is the colour and which is the size.
 *
 * Read from the product's own option NAMES rather than assuming option1 is
 * colour. Shopify lets a merchant order them however they like, and guessing
 * would silently transpose every colour and size on any product that differs.
 */
function optionMap(p: SProduct): { color: 1 | 2 | 3 | null; size: 1 | 2 | 3 | null } {
  let color: 1 | 2 | 3 | null = null;
  let size: 1 | 2 | 3 | null = null;
  for (const o of p.options ?? []) {
    const n = (o.name ?? "").trim().toLowerCase();
    const pos = o.position as 1 | 2 | 3;
    if (!color && (n === "color" || n === "colour")) color = pos;
    if (!size && (n === "size")) size = pos;
  }
  return { color, size };
}

const optAt = (v: SVariant, pos: 1 | 2 | 3 | null): string | null =>
  pos === 1 ? v.option1 ?? null : pos === 2 ? v.option2 ?? null : pos === 3 ? v.option3 ?? null : null;

const normColor = (s: string | null) =>
  (s ?? "").replace(/[‐-―]/g, " ").replace(/[_\-.,/\\]+/g, " ")
    .replace(/\s+/g, " ").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const stats = {
    started_at: startedAt,
    finished_at: null as string | null,
    shopify_products_examined: 0,
    shopify_active: 0, shopify_draft: 0, shopify_archived: 0,
    shopify_variants_seen: 0,
    locations: 0,
    linked_blanks_updated: 0,
    variants_updated: 0,
    inventory_levels_updated: 0,
    missing_barcodes: 0,
    duplicate_barcodes: 0,
    errors,
  };

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const dryRun = body.dry_run === true;

    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, shopify_shop_domain, shopify_access_token")
      .eq("shopify_connected", true)
      .not("shopify_access_token", "is", null);
    if (orgErr) throw orgErr;

    const org = (orgs ?? []).find((o) =>
      !body.organization_id || o.id === body.organization_id);
    if (!org?.shopify_shop_domain || !org?.shopify_access_token) {
      return jsonRes({ ...stats, error: "No connected Shopify store for this organization" }, 400);
    }
    const shop: Shop = { domain: org.shopify_shop_domain, token: org.shopify_access_token };

    // Only verified mappings. This is the guard that keeps decorated merch out.
    const { data: blanks, error: blankErr } = await supabase
      .from("blanks")
      .select("id, sku, shopify_product_id")
      .eq("organization_id", org.id)
      .not("shopify_product_id", "is", null);
    if (blankErr) throw blankErr;

    const blankByShopifyId = new Map<string, { id: string; sku: string | null }>();
    for (const b of blanks ?? []) {
      blankByShopifyId.set(String(b.shopify_product_id), { id: b.id as string, sku: b.sku as string | null });
    }

    // ---- Locations --------------------------------------------------------
    const locations: SLocation[] = [];
    for await (const page of pages<SLocation>(shop, "locations.json", "locations")) {
      locations.push(...page);
    }
    const activeLocations = locations.filter((l) => l.active !== false);
    const locationName = new Map(activeLocations.map((l) => [String(l.id), l.name]));
    stats.locations = activeLocations.length;

    // ---- Products, paginated in full --------------------------------------
    // Every product is COUNTED so the totals are true for the whole store, but
    // only mapped ones are WRITTEN.
    const inventoryItemToVariant = new Map<string, string>();  // inventory_item_id -> blank_variant row id
    const allBarcodes = new Map<string, number>();
    const matchedProducts: { blankId: string; product: SProduct }[] = [];

    for await (const page of pages<SProduct>(shop, "products.json?limit=250", "products")) {
      for (const p of page) {
        stats.shopify_products_examined += 1;
        const status = (p.status ?? "").toLowerCase();
        if (status === "active") stats.shopify_active += 1;
        else if (status === "draft") stats.shopify_draft += 1;
        else if (status === "archived") stats.shopify_archived += 1;
        stats.shopify_variants_seen += (p.variants ?? []).length;

        for (const v of p.variants ?? []) {
          const bc = (v.barcode ?? "").trim();
          if (bc) allBarcodes.set(bc, (allBarcodes.get(bc) ?? 0) + 1);
        }

        const blank = blankByShopifyId.get(String(p.id));
        if (blank) matchedProducts.push({ blankId: blank.id, product: p });
      }
    }

    stats.duplicate_barcodes = [...allBarcodes.values()].filter((n) => n > 1).length;

    if (dryRun) {
      stats.finished_at = new Date().toISOString();
      return jsonRes({ ...stats, dry_run: true, matched_products: matchedProducts.length });
    }

    // ---- Write variants for mapped blanks only ----------------------------
    const now = new Date().toISOString();
    for (const { blankId, product } of matchedProducts) {
      try {
        const map = optionMap(product);
        const rows = (product.variants ?? []).map((v) => {
          const color = optAt(v, map.color);
          const barcode = (v.barcode ?? "").trim() || null;
          if (!barcode) stats.missing_barcodes += 1;
          return {
            blank_id: blankId,
            shopify_variant_id: String(v.id),
            shopify_inventory_item_id: v.inventory_item_id ? String(v.inventory_item_id) : null,
            color,
            normalized_color: normColor(color),
            size: optAt(v, map.size),
            sku: v.sku ?? null,
            barcode,
            retail_price: v.price != null ? Number(v.price) : null,
            last_shopify_sync_at: now,
            updated_at: now,
          };
        });

        if (rows.length > 0) {
          const { data: saved, error } = await supabase
            .from("blank_variants")
            .upsert(rows, { onConflict: "blank_id,shopify_variant_id" })
            .select("id, shopify_inventory_item_id");
          if (error) throw error;
          stats.variants_updated += rows.length;
          for (const s of saved ?? []) {
            if (s.shopify_inventory_item_id) {
              inventoryItemToVariant.set(String(s.shopify_inventory_item_id), s.id as string);
            }
          }
        }

        await supabase.from("blanks")
          .update({
            shopify_status: (product.status ?? "").toLowerCase() || null,
            last_shopify_sync_at: now,
          })
          .eq("id", blankId);
        stats.linked_blanks_updated += 1;
      } catch (e) {
        // One product failing must not abandon the rest, and must not blank
        // out what we already knew about it.
        errors.push(`product ${product.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // ---- Per-location levels, only for the inventory items we mapped -------
    const itemIds = [...inventoryItemToVariant.keys()];
    for (let i = 0; i < itemIds.length; i += 50) {
      const chunk = itemIds.slice(i, i + 50);
      try {
        const levels: SLevel[] = [];
        const q = `inventory_levels.json?inventory_item_ids=${chunk.join(",")}&limit=250`;
        for await (const page of pages<SLevel>(shop, q, "inventory_levels")) levels.push(...page);

        const rows = levels
          .filter((l) => locationName.has(String(l.location_id)))
          .map((l) => ({
            blank_variant_id: inventoryItemToVariant.get(String(l.inventory_item_id))!,
            shopify_location_id: String(l.location_id),
            location_name: locationName.get(String(l.location_id)) ?? null,
            // Verbatim, negatives included. `?? 0` covers an untracked item,
            // which Shopify reports as null rather than as a number.
            available_quantity: l.available ?? 0,
            last_shopify_sync_at: now,
          }))
          .filter((r) => r.blank_variant_id);

        if (rows.length > 0) {
          const { error } = await supabase
            .from("blank_inventory_levels")
            .upsert(rows, { onConflict: "blank_variant_id,shopify_location_id" });
          if (error) throw error;
          stats.inventory_levels_updated += rows.length;
        }
      } catch (e) {
        errors.push(`levels batch ${i / 50}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    stats.finished_at = new Date().toISOString();

    await supabase.from("shopify_sync_logs").insert({
      organization_id: org.id,
      sync_type: "blank_inventory_reconcile",
      status: errors.length > 0 ? "partial" : "success",
      trigger_source: "manual",
      records_examined: stats.shopify_products_examined,
      records_updated: stats.variants_updated,
      records_failed: errors.length,
      started_at: startedAt,
      completed_at: stats.finished_at,
      error_message: errors[0] ?? null,
      metadata: stats,
    });

    return jsonRes(stats);
  } catch (e) {
    stats.finished_at = new Date().toISOString();
    errors.push(e instanceof Error ? e.message : String(e));
    // Log the failure; write no quantities. The last good data survives.
    await supabase.from("shopify_sync_logs").insert({
      sync_type: "blank_inventory_reconcile",
      status: "failed",
      trigger_source: "manual",
      started_at: startedAt,
      completed_at: stats.finished_at,
      error_message: errors[errors.length - 1],
      metadata: stats,
    }).then(() => {}, () => {});
    return jsonRes(stats, 500);
  }
});
