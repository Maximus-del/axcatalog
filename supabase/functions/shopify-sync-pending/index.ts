// Retries pending/failed entries in shopify_sync_queue. Can be called from the
// admin UI ("Retry now") or on a cron. Uses SERVICE ROLE client.
//
// POST { queue_ids?: string[], organization_id?: string, max?: number }
// - If queue_ids provided: retries only those.
// - Else retries up to `max` (default 25) pending/failed rows for the caller's org.
//
// Returns { processed: number, succeeded: number, failed: number,
//           results: [{ id, ok, error? }] }

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

function toGid(id: string): string {
  return id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
}

const PRODUCT_UPDATE_MUTATION = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

const PRODUCT_QUERY = `
  query getProduct($id: ID!) { product(id: $id) { id tags } }
`;

async function gql(domain: string, token: string, query: string, variables: unknown) {
  const res = await fetch(`https://${domain}/admin/api/2024-10/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  const json = JSON.parse(text);
  if (json.errors?.length) throw new Error(json.errors.map((e: any) => e.message).join("; "));
  const userErrors =
    json.data?.productUpdate?.userErrors ?? json.data?.userErrors ?? [];
  if (userErrors.length) {
    throw new Error(
      userErrors.map((e: any) => `${e.field?.join(".") ?? ""}: ${e.message}`).join("; "),
    );
  }
  return json.data;
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
    if (!profile || profile.role !== "admin") {
      return jsonRes({ error: "Forbidden — admin only" }, 403);
    }
    const orgId = profile.organization_id;

    const body = (await req.json().catch(() => ({}))) as {
      queue_ids?: string[];
      max?: number;
    };

    let q = admin
      .from("shopify_sync_queue")
      .select("id, entity_type, entity_id, changes, attempts")
      .eq("organization_id", orgId)
      .in("status", ["pending", "failed"]);
    if (body.queue_ids?.length) q = q.in("id", body.queue_ids);
    else q = q.order("created_at", { ascending: true }).limit(body.max ?? 25);
    const { data: items, error: qErr } = await q;
    if (qErr) throw qErr;

    const { data: org } = await admin
      .from("organizations")
      .select("shopify_shop_domain, shopify_access_token")
      .eq("id", orgId)
      .maybeSingle();
    if (!org?.shopify_shop_domain || !org.shopify_access_token) {
      return jsonRes({ error: "missing shopify creds" }, 400);
    }

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    let succeeded = 0, failed = 0;

    for (const it of items ?? []) {
      try {
        await admin
          .from("shopify_sync_queue")
          .update({ status: "processing", last_attempt_at: new Date().toISOString() })
          .eq("id", it.id);

        const { data: prod } = await admin
          .from("products")
          .select("shopify_product_id")
          .eq("id", it.entity_id)
          .maybeSingle();
        if (!prod?.shopify_product_id) throw new Error("product missing or not on shopify");

        const gid = toGid(prod.shopify_product_id);
        const changes = (it.changes ?? {}) as Record<string, any>;
        const input: Record<string, unknown> = { id: gid };

        if (changes.title != null) input.title = changes.title;
        if (changes.status != null) {
          const map: Record<string, string> = {
            published: "ACTIVE", active: "ACTIVE",
            draft: "DRAFT", archived: "ARCHIVED",
          };
          input.status = map[changes.status] ?? String(changes.status).toUpperCase();
        }

        // Tag adds/removes: re-fetch current tags and merge.
        if (changes.add_tags?.length || changes.remove_tags?.length) {
          const current = await gql(
            org.shopify_shop_domain,
            org.shopify_access_token,
            PRODUCT_QUERY,
            { id: gid },
          );
          const currentTags: string[] = current?.product?.tags ?? [];
          const merged = new Map<string, string>();
          for (const t of currentTags) merged.set(t.toLowerCase(), t);
          for (const t of (changes.add_tags ?? []) as string[]) merged.set(t.toLowerCase(), t);
          for (const k of (changes.remove_tags ?? []) as string[]) merged.delete(k.toLowerCase());
          input.tags = Array.from(merged.values());
        }

        await gql(
          org.shopify_shop_domain,
          org.shopify_access_token,
          PRODUCT_UPDATE_MUTATION,
          { input },
        );

        await admin
          .from("shopify_sync_queue")
          .update({ status: "succeeded", last_error: null })
          .eq("id", it.id);
        results.push({ id: it.id, ok: true });
        succeeded++;
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        await admin
          .from("shopify_sync_queue")
          .update({
            status: "failed",
            attempts: (it.attempts ?? 0) + 1,
            last_error: err.slice(0, 500),
          })
          .eq("id", it.id);
        results.push({ id: it.id, ok: false, error: err });
        failed++;
      }
    }

    return jsonRes({ processed: results.length, succeeded, failed, results });
  } catch (e) {
    console.error("shopify-sync-pending error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});