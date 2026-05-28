// Pushes title and/or status updates to Shopify via GraphQL productUpdate.
// Uses the SERVICE ROLE client so it can read organizations.shopify_access_token
// (admin-only via RLS). Requires a valid user JWT for authentication.
//
// POST { product_id: string, title?: string, status?: 'active'|'draft'|'archived'|'published' }
// Returns { ok: boolean, error?: string, queued?: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  product_id: string;
  title?: string;
  status?: "active" | "draft" | "archived" | "published";
}

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
      product { id title status }
      userErrors { field message }
    }
  }
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonRes({ ok: false, error: "Unauthorized" }, 401);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonRes({ ok: false, error: "Unauthorized" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = (await req.json()) as Body;
    if (!body.product_id) {
      return jsonRes({ ok: false, error: "missing product_id" }, 400);
    }
    if (body.title == null && body.status == null) {
      return jsonRes({ ok: true, error: "nothing to update" });
    }

    const { data: prod, error: prodErr } = await admin
      .from("products")
      .select("id, shopify_product_id, organization_id")
      .eq("id", body.product_id)
      .maybeSingle();
    if (prodErr) throw prodErr;
    if (!prod) return jsonRes({ ok: false, error: "product not found" }, 404);

    // Verify caller is an admin in the same org.
    const { data: profile } = await admin
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (
      !profile ||
      profile.organization_id !== prod.organization_id ||
      profile.role !== "admin"
    ) {
      return jsonRes({ ok: false, error: "Forbidden — admin only" }, 403);
    }

    if (!prod.shopify_product_id) {
      return jsonRes({ ok: true, error: "skipped: not on shopify" });
    }

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("shopify_shop_domain, shopify_access_token")
      .eq("id", prod.organization_id)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org?.shopify_shop_domain || !org.shopify_access_token) {
      return jsonRes({ ok: false, error: "missing shopify creds" }, 400);
    }

    const input: Record<string, unknown> = { id: toGid(prod.shopify_product_id) };
    if (body.title != null) input.title = body.title;
    if (body.status != null) {
      const map: Record<string, string> = {
        published: "ACTIVE",
        active: "ACTIVE",
        draft: "DRAFT",
        archived: "ARCHIVED",
      };
      input.status = map[body.status] ?? body.status.toUpperCase();
    }

    const changes: Record<string, unknown> = {};
    if (body.title != null) changes.title = body.title;
    if (body.status != null) changes.status = body.status;

    try {
      const res = await fetch(
        `https://${org.shopify_shop_domain}/admin/api/2024-10/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": org.shopify_access_token,
          },
          body: JSON.stringify({ query: PRODUCT_UPDATE_MUTATION, variables: { input } }),
        },
      );
      const text = await res.text();
      if (!res.ok) {
        const err = `HTTP ${res.status}: ${text.slice(0, 200)}`;
        await enqueue(admin, prod, changes, err);
        return jsonRes({ ok: false, error: err, queued: true }, 502);
      }
      const json = JSON.parse(text);
      if (json.errors?.length) {
        const err = json.errors.map((e: any) => e.message).join("; ");
        await enqueue(admin, prod, changes, err);
        return jsonRes({ ok: false, error: err, queued: true }, 502);
      }
      const userErrors = json.data?.productUpdate?.userErrors ?? [];
      if (userErrors.length) {
        const err = userErrors
          .map((e: any) => `${e.field?.join(".") ?? ""}: ${e.message}`)
          .join("; ");
        // userErrors are typically validation issues — don't queue, just report.
        return jsonRes({ ok: false, error: err }, 400);
      }
      return jsonRes({ ok: true });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await enqueue(admin, prod, changes, err);
      return jsonRes({ ok: false, error: err, queued: true }, 502);
    }
  } catch (e) {
    console.error("shopify-update-product error:", e);
    return jsonRes({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
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
