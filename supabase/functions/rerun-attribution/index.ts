// Re-runs attribution on existing order_line_items where attributed_org_id IS NULL.
// Useful after creating new product_attribution_rules.
//
// POST { batch_id?: string }
// - If batch_id provided, only that batch's unattributed line items.
// - Else: all currently unattributed line items.
//
// Returns { scanned, updated, by_org: [{org_id, org_name, count}] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function lc(v: string | null | undefined) { return (v ?? "").toString().trim().toLowerCase(); }

const UPCHARGE_PATTERNS = [
  "square", "add-on", "add on", "upcharge",
  "embroidery upgrade", "expedited shipping",
];
function isUpchargeTitle(title: string): boolean {
  const t = lc(title);
  return UPCHARGE_PATTERNS.some((p) => t.includes(p));
}

interface Rule {
  id: string; organization_id: string; match_type: string;
  match_pattern: string; priority: number;
}

function matches(rule: Rule, title: string, sku: string, tags: string) {
  const p = lc(rule.match_pattern);
  if (!p) return false;
  const t = lc(title), s = lc(sku), tg = lc(tags);
  switch (rule.match_type) {
    case "starts_with": return t.startsWith(p);
    case "contains":    return t.includes(p);
    case "exact":       return t === p;
    case "sku_exact":   return s === p;
    case "sku_contains":return s.includes(p);
    case "tag_contains":return tg.includes(p);
    default: return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "POST only" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonRes({ error: "Missing auth" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return jsonRes({ error: "Invalid auth" }, 401);

  const db = createClient(url, service);
  const { data: profile } = await db.from("user_profiles")
    .select("role, is_platform_admin").eq("id", user.id).maybeSingle();
  if (!profile || (profile.role !== "admin" && !profile.is_platform_admin)) {
    return jsonRes({ error: "Admin only" }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const batch_id: string | undefined = body?.batch_id;

  const { data: rulesData } = await db.from("product_attribution_rules")
    .select("id, organization_id, match_type, match_pattern, priority")
    .eq("is_active", true).order("priority", { ascending: false });
  const rules: Rule[] = (rulesData ?? []) as Rule[];

  // Build product index for product_match fallback
  const { data: prods } = await db.from("products").select("id, organization_id, title, sku");
  const byTitle = new Map<string, { id: string; org: string }>();
  const bySku = new Map<string, { id: string; org: string }>();
  for (const p of prods ?? []) {
    if (p.title) byTitle.set(lc(p.title), { id: p.id, org: p.organization_id });
    if (p.sku) bySku.set(lc(p.sku), { id: p.id, org: p.organization_id });
  }

  // Page through unattributed line items
  const pageSize = 1000;
  let from = 0;
  let scanned = 0, updated = 0;
  const byOrg = new Map<string, number>();

  while (true) {
    let q = db.from("order_line_items")
      .select("id, order_id, product_id, product_title, sku, organization_id, is_upcharge")
      .is("attributed_org_id", null)
      .eq("is_upcharge", false)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (batch_id) {
      // join via orders
      const { data: orderIds } = await db.from("orders").select("id").eq("import_batch_id", batch_id);
      const ids = (orderIds ?? []).map((o) => o.id);
      if (!ids.length) break;
      q = q.in("order_id", ids);
    }
    const { data: page, error } = await q;
    if (error) return jsonRes({ error: error.message }, 500);
    if (!page || !page.length) break;

    // Need order tags for tag_contains rules
    const orderIds = [...new Set(page.map((p) => p.order_id))];
    const { data: orderRows } = await db.from("orders")
      .select("id, raw_csv_row").in("id", orderIds);
    const tagsByOrder = new Map<string, string>();
    for (const o of orderRows ?? []) {
      const tg = (o.raw_csv_row as any)?.Tags ?? "";
      tagsByOrder.set(o.id, tg);
    }

    for (const li of page) {
      scanned++;
      // Flag upcharge titles and skip attribution entirely.
      if (isUpchargeTitle(li.product_title)) {
        await db.from("order_line_items").update({
          is_upcharge: true,
          attributed_org_id: null,
          attribution_rule_id: null,
          attribution_confidence: "upcharge_skipped",
        }).eq("id", li.id);
        continue;
      }
      const tags = tagsByOrder.get(li.order_id) ?? "";
      let attributed: string | null = null;
      let ruleId: string | null = null;
      for (const r of rules) {
        if (matches(r, li.product_title, li.sku ?? "", tags)) {
          attributed = r.organization_id; ruleId = r.id; break;
        }
      }
      let productId = li.product_id;
      if (!attributed) {
        const prod = byTitle.get(lc(li.product_title)) ?? (li.sku ? bySku.get(lc(li.sku)) : undefined);
        if (prod) {
          attributed = prod.org;
          productId = prod.id;
        }
      }
      if (attributed) {
        await db.from("order_line_items").update({
          attributed_org_id: attributed,
          attribution_rule_id: ruleId,
          attribution_confidence: "matched",
          product_id: productId,
        }).eq("id", li.id);
        updated++;
        byOrg.set(attributed, (byOrg.get(attributed) ?? 0) + 1);
      }
    }

    if (page.length < pageSize) break;
    from += pageSize;
  }

  // Order-level rollup for affected orders
  // (Best-effort: recompute attributed_org_id for any order whose line items now all map to one org)
  // For simplicity, only touch orders we just updated.
  // (Skipped here — admin can re-run import or we add a follow-up SQL pass.)

  const orgNames = new Map<string, string>();
  if (byOrg.size) {
    const { data: orgs } = await db.from("organizations").select("id, name")
      .in("id", [...byOrg.keys()]);
    for (const o of orgs ?? []) orgNames.set(o.id, o.name);
  }
  return jsonRes({
    scanned, updated,
    by_org: [...byOrg.entries()].map(([org_id, count]) => ({
      org_id, org_name: orgNames.get(org_id) ?? org_id, count,
    })),
  });
});
