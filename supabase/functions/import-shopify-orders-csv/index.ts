// Parse a Shopify "Orders Export" CSV and ingest it into orders +
// order_line_items, running per-line-item attribution against
// product_attribution_rules (across ALL organizations, since the central
// admin operates a multi-tenant pool).
//
// POST { csv_text, file_name, organization_id, dry_run? }
//
// Returns:
// {
//   batch_id,
//   total_rows,
//   orders_imported,
//   orders_skipped,        // duplicate shopify_order_id
//   line_items_imported,
//   line_items_attributed,
//   line_items_unattributed,
//   attribution_by_org: [{ org_id, org_name, line_items, revenue }],
//   errors: [{ row, message }],
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import Papa from "npm:papaparse@5.4.1";

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

type Row = Record<string, string>;

interface Rule {
  id: string;
  organization_id: string;
  match_type: string;
  match_pattern: string;
  priority: number;
}

// Upcharge / add-on SKUs that should be excluded from revenue attribution.
// Matched case-insensitively against the line item title.
const UPCHARGE_PATTERNS = [
  "square",            // "1 Square", "3 Squares", "7 Squares"
  "add-on",
  "add on",
  "upcharge",
  "embroidery upgrade",
  "expedited shipping",
];
function isUpchargeTitle(title: string): boolean {
  const t = (title ?? "").toLowerCase();
  return UPCHARGE_PATTERNS.some((p) => t.includes(p));
}

function clean(v: string | undefined | null): string {
  return (v ?? "").toString().trim();
}
function num(v: string | undefined | null): number | null {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function parseDate(v: string | undefined | null): string | null {
  const s = clean(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function lc(v: string | undefined | null): string {
  return clean(v).toLowerCase();
}

function matchesRule(rule: Rule, title: string, sku: string, tags: string): boolean {
  const pat = clean(rule.match_pattern);
  if (!pat) return false;
  const t = lc(title);
  const s = lc(sku);
  const tg = lc(tags);
  const p = pat.toLowerCase();
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

  let body: any;
  try { body = await req.json(); } catch { return jsonRes({ error: "Invalid JSON" }, 400); }

  const csv_text: string = body?.csv_text ?? "";
  const file_name: string = body?.file_name ?? "upload.csv";
  const organization_id: string = body?.organization_id ?? "";
  const dry_run: boolean = !!body?.dry_run;
  if (!csv_text || !organization_id) {
    return jsonRes({ error: "csv_text and organization_id are required" }, 400);
  }

  // Authenticate caller (must be admin or platform admin).
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonRes({ error: "Missing auth" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await authClient.auth.getUser();
  if (userErr || !user) return jsonRes({ error: "Invalid auth" }, 401);

  const db = createClient(supabaseUrl, serviceKey);

  const { data: profile } = await db
    .from("user_profiles")
    .select("id, role, organization_id, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return jsonRes({ error: "Profile not found" }, 403);
  const isAdmin = profile.role === "admin" || profile.is_platform_admin;
  if (!isAdmin) return jsonRes({ error: "Admin only" }, 403);
  if (!profile.is_platform_admin && profile.organization_id !== organization_id) {
    return jsonRes({ error: "Cannot import for another org" }, 403);
  }

  // --- Parse CSV ---
  const parsed = Papa.parse<Row>(csv_text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });
  const rows = (parsed.data ?? []).filter((r) => r && Object.keys(r).length > 0);
  const parseErrors = (parsed.errors ?? []).slice(0, 20).map((e) => ({ row: e.row, message: e.message }));

  // --- Create batch ---
  const { data: batch, error: batchErr } = await db
    .from("import_batches")
    .insert({
      organization_id,
      uploaded_by: user.id,
      file_name,
      total_rows: rows.length,
      status: "processing",
      error_log: parseErrors,
    })
    .select("id")
    .single();
  if (batchErr || !batch) return jsonRes({ error: batchErr?.message ?? "batch insert failed" }, 500);
  const batch_id = batch.id as string;

  // --- Load all active attribution rules across all orgs ---
  const { data: rulesData } = await db
    .from("product_attribution_rules")
    .select("id, organization_id, match_type, match_pattern, priority")
    .eq("is_active", true)
    .order("priority", { ascending: false });
  const rules: Rule[] = (rulesData ?? []) as Rule[];

  // --- Load product index for title/SKU mapping (across all orgs) ---
  const { data: productsData } = await db
    .from("products")
    .select("id, organization_id, title, sku, shopify_handle, shopify_product_id");
  const byTitle = new Map<string, { id: string; org: string }>();
  const bySku = new Map<string, { id: string; org: string }>();
  for (const p of productsData ?? []) {
    if (p.title) byTitle.set(lc(p.title), { id: p.id, org: p.organization_id });
    if (p.sku) bySku.set(lc(p.sku), { id: p.id, org: p.organization_id });
  }

  // --- Group rows by order Name ---
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const name = clean(r["Name"]);
    if (!name) continue;
    const arr = groups.get(name) ?? [];
    arr.push(r);
    groups.set(name, arr);
  }

  // --- Pre-check existing orders for idempotency ---
  const incomingIds: string[] = [];
  for (const grp of groups.values()) {
    for (const r of grp) {
      const id = clean(r["Id"]);
      if (id) { incomingIds.push(id); break; }
    }
  }
  const existingSet = new Set<string>();
  if (incomingIds.length) {
    for (let i = 0; i < incomingIds.length; i += 500) {
      const slice = incomingIds.slice(i, i + 500);
      const { data: existing } = await db
        .from("orders")
        .select("shopify_order_id")
        .in("shopify_order_id", slice);
      for (const e of existing ?? []) {
        if (e.shopify_order_id) existingSet.add(e.shopify_order_id);
      }
    }
  }

  let orders_imported = 0;
  let orders_skipped = 0;
  let line_items_imported = 0;
  let line_items_attributed = 0;
  let line_items_unattributed = 0;
  const errors: { row: string; message: string }[] = parseErrors.map((e) => ({
    row: String(e.row),
    message: e.message,
  }));
  const attrCounts = new Map<string, { line_items: number; revenue: number }>();

  for (const [name, grp] of groups.entries()) {
    try {
      // Pick a "header" row for order-level fields (first non-empty per column).
      const pick = (key: string): string => {
        for (const r of grp) {
          const v = clean(r[key]);
          if (v) return v;
        }
        return "";
      };
      const shopify_order_id = pick("Id");
      const shopify_order_name = name;
      const customer_email = pick("Email");
      const customer_name = pick("Billing Name") || pick("Shipping Name");
      const financial_status = pick("Financial Status");
      const fulfillment_status = pick("Fulfillment Status");
      const currency = pick("Currency") || "USD";
      const total = num(pick("Total"));
      const subtotal = num(pick("Subtotal"));
      const tax = num(pick("Taxes"));
      const shipping = num(pick("Shipping"));
      const discount = num(pick("Discount Amount"));
      const created_at_csv = parseDate(pick("Created at") || pick("Paid at"));
      const order_date = created_at_csv;
      const tags = pick("Tags");
      const cancelledAt = pick("Cancelled at");
      const refundedAmount = num(pick("Refunded Amount"));
      const is_test =
        /\btest\b/i.test(tags) || /\btest\b/i.test(name) || /test/i.test(financial_status);
      const is_refund = !!cancelledAt || (refundedAmount ?? 0) > 0 || /refund/i.test(financial_status);

      if (shopify_order_id && existingSet.has(shopify_order_id)) {
        orders_skipped++;
        continue;
      }
      if (!created_at_csv) {
        errors.push({ row: name, message: "Missing Created at — imported with NULL order_date" });
      }

      // Insert the order
      const orderInsert: any = {
        organization_id,
        import_batch_id: batch_id,
        shopify_order_id: shopify_order_id || null,
        shopify_order_name,
        customer_email: customer_email || null,
        customer_name: customer_name || null,
        financial_status: financial_status || null,
        fulfillment_status: fulfillment_status || null,
        currency,
        total, subtotal, tax, shipping, discount,
        order_date,
        is_test, is_refund,
        raw_csv_row: grp[0],
      };
      const { data: order, error: orderErr } = await db
        .from("orders").insert(orderInsert).select("id").single();
      if (orderErr || !order) {
        errors.push({ row: name, message: `Order insert failed: ${orderErr?.message ?? "unknown"}` });
        continue;
      }
      orders_imported++;

      // Build line items
      const lineItems: any[] = [];
      const orgsHit = new Set<string>();
      for (const r of grp) {
        const lineName = clean(r["Lineitem name"]);
        if (!lineName) continue;
        const qty = parseInt(clean(r["Lineitem quantity"]) || "0", 10) || 0;
        const price = num(r["Lineitem price"]);
        const sku = clean(r["Lineitem sku"]);
        const lineDiscount = num(r["Lineitem discount"]) ?? 0;
        const lineTotal = price != null ? round2(price * qty - (lineDiscount ?? 0)) : null;

        // Refund preservation: if refund row has negative qty/total, keep as-is.
        // Match product
        let prod = byTitle.get(lc(lineName)) ?? (sku ? bySku.get(lc(sku)) : undefined);

        // Run attribution rules (highest priority first; first match wins)
        let attributedOrg: string | null = null;
        let rule_id: string | null = null;
        for (const rule of rules) {
          if (matchesRule(rule, lineName, sku, tags)) {
            attributedOrg = rule.organization_id;
            rule_id = rule.id;
            break;
          }
        }
        // Fallback: if matched product carries a clear org, use product's org.
        if (!attributedOrg && prod?.org) attributedOrg = prod.org;

        const li = {
          organization_id,
          order_id: order.id,
          shopify_line_item_id: null,
          product_id: prod?.id ?? null,
          product_title: lineName,
          variant_title: null,
          sku: sku || null,
          quantity: qty,
          unit_price: price,
          line_total: lineTotal,
          attributed_org_id: attributedOrg,
          attribution_rule_id: rule_id,
          attribution_confidence: attributedOrg ? "matched" : "unattributed",
          raw_csv_row: r,
        };
        lineItems.push(li);
        if (attributedOrg) {
          orgsHit.add(attributedOrg);
          line_items_attributed++;
          const cur = attrCounts.get(attributedOrg) ?? { line_items: 0, revenue: 0 };
          cur.line_items++;
          cur.revenue += lineTotal ?? 0;
          attrCounts.set(attributedOrg, cur);
        } else {
          line_items_unattributed++;
          const key = "__unattributed__";
          const cur = attrCounts.get(key) ?? { line_items: 0, revenue: 0 };
          cur.line_items++;
          cur.revenue += lineTotal ?? 0;
          attrCounts.set(key, cur);
        }
      }

      if (lineItems.length) {
        // Batch insert in chunks of 500
        for (let i = 0; i < lineItems.length; i += 500) {
          const slice = lineItems.slice(i, i + 500);
          const { error: liErr } = await db.from("order_line_items").insert(slice);
          if (liErr) {
            errors.push({ row: name, message: `Line items insert failed: ${liErr.message}` });
          } else {
            line_items_imported += slice.length;
          }
        }
        // Roll up order-level attribution when all line items map to the same org
        if (orgsHit.size === 1) {
          const [onlyOrg] = [...orgsHit];
          await db.from("orders").update({ attributed_org_id: onlyOrg }).eq("id", order.id);
        }
      }
    } catch (e) {
      errors.push({ row: name, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // Resolve org names for the response
  const orgIds = [...attrCounts.keys()].filter((k) => k !== "__unattributed__");
  const orgNames = new Map<string, string>();
  if (orgIds.length) {
    const { data: orgs } = await db.from("organizations").select("id, name").in("id", orgIds);
    for (const o of orgs ?? []) orgNames.set(o.id, o.name);
  }
  const attribution_by_org = [...attrCounts.entries()].map(([org_id, v]) => ({
    org_id: org_id === "__unattributed__" ? null : org_id,
    org_name: org_id === "__unattributed__" ? "Unattributed" : (orgNames.get(org_id) ?? org_id),
    line_items: v.line_items,
    revenue: round2(v.revenue),
  })).sort((a, b) => b.revenue - a.revenue);

  // Finalize batch
  await db.from("import_batches").update({
    status: errors.length ? "completed_with_errors" : "completed",
    completed_at: new Date().toISOString(),
    orders_imported,
    orders_skipped,
    line_items_imported,
    line_items_attributed,
    line_items_unattributed,
    error_log: errors.slice(0, 200),
  }).eq("id", batch_id);

  return jsonRes({
    batch_id,
    total_rows: rows.length,
    orders_imported,
    orders_skipped,
    line_items_imported,
    line_items_attributed,
    line_items_unattributed,
    attribution_by_org,
    errors: errors.slice(0, 50),
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
