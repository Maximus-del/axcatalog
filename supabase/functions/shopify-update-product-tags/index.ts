// Pushes tag updates to Shopify for a list of products via GraphQL productUpdate.
// Uses the SERVICE ROLE client so it can read organizations.shopify_access_token
// (admin-only via RLS). Requires a valid user JWT for authentication.
//
// On Shopify failure we enqueue the change in shopify_sync_queue for retry.
//
// POST { product_ids: string[], add_tags?: string[], remove_tags?: string[] }
// Returns { results: [{ product_id, ok, error?, queued? }] }

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

function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Convert numeric or GID into Shopify GraphQL GID. */
function toGid(id: string): string {
  return id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
}

async function shopifyGraphQL(
  domain: string,
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://${domain}/admin/api/2024-10/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    const json = JSON.parse(text);
    if (json.errors?.length) {
      return { ok: false, error: json.errors.map((e: any) => e.message).join("; ") };
    }
    const userErrors = json.data?.productUpdate?.userErrors ?? [];
    if (userErrors.length) {
      return {
        ok: false,
        error: userErrors.map((e: any) => `${e.field?.join(".") ?? ""}: ${e.message}`).join("; "),
      };
    }
    return { ok: true, data: json.data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const PRODUCT_UPDATE_MUTATION = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id tags }
      userErrors { field message }
    }
  }
`;

const PRODUCT_QUERY = `
  query getProduct($id: ID!) {
    product(id: $id) { id tags }
  }
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // 1) Authenticate the caller via JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    // 2) Service-role client for reading shopify_access_token + queueing
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json()) as Body;
    const ids = Array.isArray(body.product_ids) ? body.product_ids : [];
    const add = (body.add_tags ?? []).map((t) => t.trim()).filter(Boolean);
    const removeLower = new Set(
      (body.remove_tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean),
    );
    if (ids.length === 0) return jsonRes({ results: [] });

    const { data: prods, error: prodErr } = await admin
      .from("products")
      .select("id, shopify_product_id, organization_id")
      .in("id", ids);
    if (prodErr) throw prodErr;

    // Verify caller belongs to each org of the requested products.
    const orgIds = Array.from(
      new Set((prods ?? []).map((p) => p.organization_id).filter(Boolean)),
    );
    const { data: profile } = await admin
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile || !orgIds.every((o) => o === profile.organization_id)) {
      return jsonRes({ error: "Forbidden" }, 403);
    }

    const { data: orgs, error: orgErr } = await admin
      .from("organizations")
      .select("id, shopify_shop_domain, shopify_access_token")
      .in("id", orgIds);
    if (orgErr) throw orgErr;
    const orgById = new Map((orgs ?? []).map((o) => [o.id, o] as const));

    const results: Array<{
      product_id: string;
      ok: boolean;
      error?: string;
      queued?: boolean;
    }> = [];

    for (const p of prods ?? []) {
      if (!p.shopify_product_id) {
        results.push({ product_id: p.id, ok: true, error: "skipped: not on shopify" });
        continue;
      }
      const org = orgById.get(p.organization_id);
      if (!org?.shopify_shop_domain || !org.shopify_access_token) {
        results.push({ product_id: p.id, ok: false, error: "missing shopify creds" });
        continue;
      }

      const gid = toGid(p.shopify_product_id);

      // Read current tags so we can merge add/remove without losing others.
      const getRes = await shopifyGraphQL(
        org.shopify_shop_domain,
        org.shopify_access_token,
        PRODUCT_QUERY,
        { id: gid },
      );
      if (!getRes.ok) {
        await enqueue(admin, p, { add_tags: add, remove_tags: [...removeLower] }, getRes.error);
        results.push({ product_id: p.id, ok: false, error: getRes.error, queued: true });
        continue;
      }
      const currentTags: string[] = getRes.data?.product?.tags ?? [];
      const merged = new Map<string, string>();
      for (const t of currentTags) merged.set(t.toLowerCase(), t);
      for (const t of add) merged.set(t.toLowerCase(), t);
      for (const k of removeLower) merged.delete(k);
      const nextTags = Array.from(merged.values());

      const upd = await shopifyGraphQL(
        org.shopify_shop_domain,
        org.shopify_access_token,
        PRODUCT_UPDATE_MUTATION,
        { input: { id: gid, tags: nextTags } },
      );
      if (!upd.ok) {
        await enqueue(admin, p, { add_tags: add, remove_tags: [...removeLower] }, upd.error);
        results.push({ product_id: p.id, ok: false, error: upd.error, queued: true });
        continue;
      }
      results.push({ product_id: p.id, ok: true });
    }

    return jsonRes({ results });
  } catch (e) {
    console.error("shopify-update-product-tags error:", e);
    return jsonRes(
      { error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }
});

async function enqueue(
  admin: ReturnType<typeof createClient>,
  product: { id: string; organization_id: string },
  changes: Record<string, unknown>,
  error: string,
) {
  try {
    await admin.from("shopify_sync_queue").insert({
      organization_id: product.organization_id,
      entity_type: "product",
      entity_id: product.id,
      changes,
      status: "failed",
      attempts: 1,
      last_attempt_at: new Date().toISOString(),
      last_error: error.slice(0, 500),
    });
  } catch (e) {
    console.error("enqueue failed:", e);
  }
}
