// Read-only Shopify discovery for onboarding ONE blank.
//
// POST { query: string, style_number?: string, vendor?: string, blank_id?: string }
//
// This is deliberately a separate function from shopify-reconcile-blanks, and
// the separation is the point. Reconciliation is allowlist-only and must never
// enumerate the catalogue — that is what keeps decorated merchandise out.
// Discovery DOES search, because finding a product you have not yet approved is
// the one job that cannot be done from an allowlist.
//
// It is therefore built to be harmless:
//
//   It writes NOTHING. No flags, no mappings, no variants, no levels. Every
//   database call it makes is a SELECT. There is no code path to a write.
//
//   It proposes, it does not decide. The result is evidence for a person, with
//   the confidence and the reasoning attached, and activation happens later
//   through a different, explicitly approved call.
//
//   It never touches Shopify state. Read-only endpoints only; it cannot change
//   a title, a status, a quantity or a barcode.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (p: unknown, s = 200) =>
  new Response(JSON.stringify(p), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const API = "2024-10";
const norm = (v: string) =>
  v.replace(/[‐-―]/g, " ").replace(/[_\-.,/\\]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();

type SVariant = {
  id: number | string; title?: string; sku?: string | null; barcode?: string | null;
  inventory_item_id?: number | string | null; price?: string | null;
  option1?: string | null; option2?: string | null; option3?: string | null;
};
type SProduct = {
  id: number | string; title: string; handle?: string; vendor?: string | null;
  status?: string; product_type?: string | null;
  options?: { name: string; position: number; values: string[] }[];
  variants?: SVariant[];
};

async function shopifyGet(shop: { domain: string; token: string }, path: string) {
  const res = await fetch(`https://${shop.domain}/admin/api/${API}/${path}`, {
    headers: { "X-Shopify-Access-Token": shop.token, "Content-Type": "application/json" },
  });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, Number(res.headers.get("Retry-After") ?? "2") * 1000));
    return shopifyGet(shop, path);
  }
  if (!res.ok) throw new Error(`Shopify ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { body: await res.json(), link: res.headers.get("Link") ?? "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const query = String(body.query ?? "").trim();
    if (!query) return json({ error: "query is required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: org } = await supabase
      .from("organizations")
      .select("id, shopify_shop_domain, shopify_access_token")
      .eq("shopify_connected", true)
      .not("shopify_access_token", "is", null)
      .maybeSingle();
    if (!org?.shopify_shop_domain) return json({ error: "No connected Shopify store" }, 400);
    const shop = { domain: org.shopify_shop_domain, token: org.shopify_access_token };

    // ---- Locations (read-only) -----------------------------------------
    const locRes = await shopifyGet(shop, "locations.json");
    const locations = (locRes.body.locations ?? []).filter((l: { active?: boolean }) => l.active !== false);
    const locName = new Map<string, string>(
      locations.map((l: { id: number; name: string }) => [String(l.id), l.name]),
    );

    // ---- Search: paginate titles, score, keep the best few ---------------
    const wanted = norm(query);
    const style = body.style_number ? norm(String(body.style_number)) : null;
    const vendorWant = body.vendor ? norm(String(body.vendor)) : null;

    const scored: { p: SProduct; score: number; why: string[] }[] = [];
    let path = "products.json?limit=250";
    let examined = 0;

    while (path) {
      const { body: pb, link } = await shopifyGet(shop, path);
      for (const p of (pb.products ?? []) as SProduct[]) {
        examined += 1;
        const t = norm(p.title);
        const why: string[] = [];
        let score = 0;

        if (t === wanted) { score += 100; why.push("exact title match"); }
        else if (t.includes(wanted) || wanted.includes(t)) { score += 40; why.push("title containment"); }

        if (style && t.includes(style)) { score += 50; why.push(`style number ${style} in title`); }
        if (style && (p.variants ?? []).some((v) => norm(v.sku ?? "").includes(style))) {
          score += 25; why.push(`style number in variant SKUs`);
        }
        if (vendorWant && norm(p.vendor ?? "") === vendorWant) { score += 20; why.push("vendor match"); }

        if (score > 0) scored.push({ p, score, why });
      }
      const next = /<([^>]+)>;\s*rel="next"/.exec(link);
      path = next ? next[1].split(`/${API}/`)[1] : "";
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 5);
    if (top.length === 0) {
      return json({ query, shopify_products_examined: examined, candidates: [], locations: locations.length });
    }

    // ---- Full detail for the best candidate, including live levels -------
    const best = top[0];
    const itemIds = (best.p.variants ?? [])
      .map((v) => v.inventory_item_id).filter(Boolean).map(String);

    const levels: { inventory_item_id: string; location_id: string; available: number | null }[] = [];
    for (let i = 0; i < itemIds.length; i += 50) {
      const chunk = itemIds.slice(i, i + 50);
      let lp = `inventory_levels.json?inventory_item_ids=${chunk.join(",")}&limit=250`;
      while (lp) {
        const { body: lb, link } = await shopifyGet(shop, lp);
        for (const l of lb.inventory_levels ?? []) {
          levels.push({
            inventory_item_id: String(l.inventory_item_id),
            location_id: String(l.location_id),
            available: l.available,
          });
        }
        const nx = /<([^>]+)>;\s*rel="next"/.exec(link);
        lp = nx ? nx[1].split(`/${API}/`)[1] : "";
      }
    }

    const byLocation: Record<string, number> = {};
    let totalAvailable = 0;
    for (const l of levels) {
      if (!locName.has(l.location_id)) continue;
      const q = l.available ?? 0;
      byLocation[locName.get(l.location_id)!] = (byLocation[locName.get(l.location_id)!] ?? 0) + q;
      totalAvailable += q;
    }

    const variants = best.p.variants ?? [];
    const barcodes = variants.map((v) => (v.barcode ?? "").trim()).filter(Boolean);
    const dupWithin = [...new Set(barcodes.filter((b, i) => barcodes.indexOf(b) !== i))];

    // Collisions against blanks we already manage, and against the decorated
    // catalogue. Reported, never resolved.
    const { data: managedHits } = barcodes.length
      ? await supabase.from("blank_variants").select("barcode, blank_id").in("barcode", barcodes)
      : { data: [] };
    const { data: externalHits } = barcodes.length
      ? await supabase.from("product_variants").select("barcode, product_id").in("barcode", barcodes)
      : { data: [] };

    // Proposed mapping — a suggestion with evidence, not a decision.
    const { data: blank } = body.blank_id
      ? await supabase.from("blanks").select("id, sku, name, style_number, is_inventory_managed, shopify_product_id").eq("id", body.blank_id).maybeSingle()
      : await supabase.from("blanks").select("id, sku, name, style_number, is_inventory_managed, shopify_product_id")
          .eq("style_number", String(body.style_number ?? "")).maybeSingle();

    return json({
      query,
      shopify_products_examined: examined,
      locations: locations.map((l: { id: number; name: string }) => ({ id: String(l.id), name: l.name })),
      candidate: {
        shopify_product_id: `gid://shopify/Product/${best.p.id}`,
        numeric_id: String(best.p.id),
        title: best.p.title,
        handle: best.p.handle ?? null,
        vendor: best.p.vendor ?? null,
        status: best.p.status ?? null,
        product_type: best.p.product_type ?? null,
        options: (best.p.options ?? []).map((o) => ({ name: o.name, position: o.position, values: o.values.length })),
        variant_count: variants.length,
        total_available: totalAvailable,
        by_location: byLocation,
        barcodes_present: barcodes.length,
        barcodes_missing: variants.length - barcodes.length,
        duplicate_barcodes_within_product: dupWithin,
        collides_with_managed_blanks: (managedHits ?? []).length,
        collides_with_other_shopify_products: (externalHits ?? []).length,
        score: best.score,
        evidence: best.why,
      },
      other_candidates: top.slice(1).map((c) => ({
        shopify_product_id: `gid://shopify/Product/${c.p.id}`,
        title: c.p.title, score: c.score, evidence: c.why,
      })),
      proposed_blank: blank ?? null,
      wrote_anything: false,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e), wrote_anything: false }, 500);
  }
});
