// Sync product variants from Shopify into public.product_variants.
//
// POST { product_id?: string, organization_id?: string }
// - product_id: sync variants for that single product
// - else: sync variants for every Shopify-linked product in the caller's org
//
// Admin-only. Uses REST Admin API for the product payload (simpler variant shape).
// Writes use the service role. Missing variants are soft-marked via
// metadata.orphaned_at (never hard-deleted) so historical orders keep their refs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function idFromGid(gid: string): string {
  const m = /\/(\d+)$/.exec(gid);
  return m ? m[1] : gid;
}

type ShopifyOption = { name: string; position: number; values: string[] };
type ShopifyVariant = {
  id: number | string;
  product_id?: number | string;
  title?: string | null;
  sku?: string | null;
  position?: number | null;
  inventory_item_id?: number | string | null;
  inventory_quantity?: number | null;
  inventory_policy?: string | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  price?: string | number | null;
  compare_at_price?: string | number | null;
  grams?: number | null;
  barcode?: string | null;
  image_id?: number | string | null;
  requires_shipping?: boolean | null;
  taxable?: boolean | null;
};
type ShopifyProductPayload = {
  product: {
    id: number | string;
    options?: ShopifyOption[];
    variants?: ShopifyVariant[];
  };
};

async function fetchShopifyProduct(
  domain: string,
  token: string,
  shopifyProductId: string,
): Promise<ShopifyProductPayload> {
  const numericId = idFromGid(shopifyProductId);
  const res = await fetch(
    `https://${domain}/admin/api/2024-10/products/${numericId}.json`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as ShopifyProductPayload;
}

function toNumeric(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

type PerProductCounts = { inserted: number; updated: number; orphaned: number };

async function syncOne(
  admin: ReturnType<typeof createClient>,
  org: { shopify_shop_domain: string; shopify_access_token: string },
  product: { id: string; shopify_product_id: string },
): Promise<PerProductCounts> {
  const counts: PerProductCounts = { inserted: 0, updated: 0, orphaned: 0 };

  const payload = await fetchShopifyProduct(
    org.shopify_shop_domain,
    org.shopify_access_token,
    product.shopify_product_id,
  );
  const options = payload.product.options ?? [];
  const variants = payload.product.variants ?? [];

  // Map position -> option name (option1/2/3)
  const optionNameByPosition: Record<number, string | null> = {
    1: options.find((o) => o.position === 1)?.name ?? null,
    2: options.find((o) => o.position === 2)?.name ?? null,
    3: options.find((o) => o.position === 3)?.name ?? null,
  };

  // Load existing rows for this product (need ids + metadata + shopify_variant_id)
  const { data: existingData, error: exErr } = await admin
    .from("product_variants")
    .select("id, shopify_variant_id, metadata")
    .eq("product_id", product.id);
  if (exErr) throw exErr;
  const existing = (existingData ?? []) as Array<{
    id: string;
    shopify_variant_id: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  const existingByShopifyId = new Map<string, (typeof existing)[number]>();
  for (const r of existing) {
    if (r.shopify_variant_id) existingByShopifyId.set(String(r.shopify_variant_id), r);
  }

  const nowIso = new Date().toISOString();
  const seenShopifyIds = new Set<string>();

  for (const v of variants) {
    const sid = String(v.id);
    seenShopifyIds.add(sid);

    const row = {
      product_id: product.id,
      shopify_variant_id: sid,
      shopify_inventory_item_id:
        v.inventory_item_id != null ? String(v.inventory_item_id) : null,
      sku: v.sku ?? null,
      title: v.title ?? null,
      position: v.position ?? null,
      option1_name: optionNameByPosition[1],
      option1_value: v.option1 ?? null,
      option2_name: optionNameByPosition[2],
      option2_value: v.option2 ?? null,
      option3_name: optionNameByPosition[3],
      option3_value: v.option3 ?? null,
      price: toNumeric(v.price),
      compare_at_price: toNumeric(v.compare_at_price),
      currency: "USD",
      weight_grams: v.grams ?? null,
      barcode: v.barcode ?? null,
      shopify_image_id: v.image_id != null ? String(v.image_id) : null,
      inventory_quantity: v.inventory_quantity ?? null,
      inventory_policy: v.inventory_policy ?? null,
      requires_shipping: v.requires_shipping ?? true,
      taxable: v.taxable ?? true,
      synced_at: nowIso,
    };

    const prior = existingByShopifyId.get(sid);
    // Preserve & clear orphaned_at if the variant returned
    const priorMeta = (prior?.metadata ?? {}) as Record<string, unknown>;
    const { orphaned_at: _drop, ...keepMeta } = priorMeta;
    const metadata = { ...keepMeta, last_synced_at: nowIso };

    const { error: upErr } = await admin
      .from("product_variants")
      .upsert(
        { ...row, metadata },
        { onConflict: "product_id,shopify_variant_id" },
      );
    if (upErr) throw upErr;
    if (prior) counts.updated++;
    else counts.inserted++;
  }

  // Soft-mark variants that were not returned (orphaned). Don't re-mark.
  for (const r of existing) {
    if (!r.shopify_variant_id) continue;
    if (seenShopifyIds.has(String(r.shopify_variant_id))) continue;
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    if (meta.orphaned_at) continue;
    const { error: orErr } = await admin
      .from("product_variants")
      .update({ metadata: { ...meta, orphaned_at: nowIso } })
      .eq("id", r.id);
    if (orErr) throw orErr;
    counts.orphaned++;
  }

  return counts;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonRes({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await admin
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile || (profile as { role?: string }).role !== "admin") {
      return jsonRes({ error: "Forbidden — admin only" }, 403);
    }
    const orgId = (profile as { organization_id: string }).organization_id;

    const body = (await req.json().catch(() => ({}))) as {
      product_id?: string;
      organization_id?: string;
    };
    if (body.organization_id && body.organization_id !== orgId) {
      return jsonRes({ error: "organization_id mismatch" }, 403);
    }

    const { data: org } = await admin
      .from("organizations")
      .select("name, shopify_shop_domain, shopify_access_token")
      .eq("id", orgId)
      .maybeSingle();
    const orgRow = org as
      | { name: string; shopify_shop_domain: string | null; shopify_access_token: string | null }
      | null;
    if (!orgRow?.shopify_shop_domain || !orgRow?.shopify_access_token) {
      return jsonRes(
        { error: `Shopify credentials not configured for ${orgRow?.name ?? "organization"}` },
        400,
      );
    }

    let q = admin
      .from("products")
      .select("id, shopify_product_id")
      .eq("organization_id", orgId)
      .not("shopify_product_id", "is", null);
    if (body.product_id) q = q.eq("id", body.product_id);
    const { data: products, error: pErr } = await q;
    if (pErr) throw pErr;

    let products_processed = 0;
    let variants_inserted = 0;
    let variants_updated = 0;
    let variants_orphaned = 0;
    const errors: Array<{ product_id: string; message: string }> = [];

    for (const p of (products ?? []) as Array<{ id: string; shopify_product_id: string }>) {
      try {
        const counts = await syncOne(
          admin,
          { shopify_shop_domain: orgRow.shopify_shop_domain!, shopify_access_token: orgRow.shopify_access_token! },
          p,
        );
        products_processed++;
        variants_inserted += counts.inserted;
        variants_updated += counts.updated;
        variants_orphaned += counts.orphaned;
      } catch (e) {
        errors.push({
          product_id: p.id,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return jsonRes({
      products_processed,
      variants_inserted,
      variants_updated,
      variants_orphaned,
      errors,
    });
  } catch (e) {
    console.error("shopify-sync-product-variants error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});