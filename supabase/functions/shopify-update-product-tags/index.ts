// Pushes tag updates to Shopify for a list of products. Called from the admin
// bulk-tag flow and the per-product tag popover. Replaces the full tag set on
// each Shopify product with the union of (existing Shopify tags from our cache)
// + (added) - (removed).
//
// POST { product_ids: string[], add_tags?: string[], remove_tags?: string[] }
// Returns { results: [{ product_id, ok, error? }] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  product_ids: string[];
  add_tags?: string[];
  remove_tags?: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Use the caller's JWT so RLS still applies (only their org's products visible).
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = (await req.json()) as Body;
    const ids = Array.isArray(body.product_ids) ? body.product_ids : [];
    const add = (body.add_tags ?? []).map((t) => t.trim()).filter(Boolean);
    const remove = new Set(
      (body.remove_tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    );
    if (ids.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch products and their org's Shopify credentials.
    const { data: prods, error: prodErr } = await supabase
      .from("products")
      .select("id, shopify_product_id, organization_id")
      .in("id", ids);
    if (prodErr) throw prodErr;

    const orgIds = Array.from(
      new Set((prods ?? []).map((p) => p.organization_id).filter(Boolean)),
    );
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id, shopify_shop_domain, shopify_access_token")
      .in("id", orgIds);
    if (orgErr) throw orgErr;

    const orgById = new Map(
      (orgs ?? []).map((o) => [o.id, o] as const),
    );

    const results: Array<{ product_id: string; ok: boolean; error?: string }> = [];

    for (const p of prods ?? []) {
      try {
        if (!p.shopify_product_id) {
          results.push({ product_id: p.id, ok: true, error: "skipped: not on shopify" });
          continue;
        }
        const org = orgById.get(p.organization_id);
        if (!org?.shopify_shop_domain || !org.shopify_access_token) {
          results.push({ product_id: p.id, ok: false, error: "missing shopify creds" });
          continue;
        }

        // GET current tags from Shopify so we don't blow them away.
        const baseUrl = `https://${org.shopify_shop_domain}/admin/api/2024-10/products/${p.shopify_product_id}.json`;
        const getRes = await fetch(baseUrl, {
          headers: { "X-Shopify-Access-Token": org.shopify_access_token },
        });
        if (!getRes.ok) {
          results.push({
            product_id: p.id,
            ok: false,
            error: `GET ${getRes.status}`,
          });
          continue;
        }
        const current = await getRes.json();
        const currentTags: string[] = (current?.product?.tags ?? "")
          .split(",")
          .map((t: string) => t.trim())
          .filter(Boolean);

        const merged = new Map<string, string>();
        for (const t of currentTags) merged.set(t.toLowerCase(), t);
        for (const t of add) merged.set(t.toLowerCase(), t);
        for (const k of remove) merged.delete(k);

        const tagsString = Array.from(merged.values()).join(", ");

        const putRes = await fetch(baseUrl, {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": org.shopify_access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product: { id: Number(p.shopify_product_id), tags: tagsString },
          }),
        });
        if (!putRes.ok) {
          const txt = await putRes.text();
          results.push({
            product_id: p.id,
            ok: false,
            error: `PUT ${putRes.status}: ${txt.slice(0, 120)}`,
          });
          continue;
        }
        results.push({ product_id: p.id, ok: true });
      } catch (e) {
        results.push({ product_id: p.id, ok: false, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
