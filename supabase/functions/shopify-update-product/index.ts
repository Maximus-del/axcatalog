// Pushes title and/or status updates to Shopify for a single product.
// Mirrors the shopify-update-product-tags pattern but for product fields.
//
// POST { product_id: string, title?: string, status?: 'active'|'draft'|'archived' }
// Returns { ok: boolean, error?: string }
//
// Status mapping (Lovable -> Shopify):
//   published -> active, draft -> draft, archived -> archived

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Use the caller's JWT so RLS still applies. Only admins can read
    // organizations.shopify_access_token after the recent security fix.
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = (await req.json()) as Body;
    if (!body.product_id) {
      return new Response(JSON.stringify({ ok: false, error: "missing product_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (body.title == null && body.status == null) {
      return new Response(JSON.stringify({ ok: true, error: "nothing to update" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prod, error: prodErr } = await supabase
      .from("products")
      .select("id, shopify_product_id, organization_id")
      .eq("id", body.product_id)
      .maybeSingle();
    if (prodErr) throw prodErr;
    if (!prod) {
      return new Response(JSON.stringify({ ok: false, error: "product not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!prod.shopify_product_id) {
      return new Response(JSON.stringify({ ok: true, error: "skipped: not on shopify" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("shopify_shop_domain, shopify_access_token")
      .eq("id", prod.organization_id)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org?.shopify_shop_domain || !org.shopify_access_token) {
      return new Response(JSON.stringify({ ok: false, error: "missing shopify creds" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const productPayload: Record<string, unknown> = {
      id: Number(prod.shopify_product_id),
    };
    if (body.title != null) productPayload.title = body.title;
    if (body.status != null) {
      const map: Record<string, string> = {
        published: "active",
        active: "active",
        draft: "draft",
        archived: "archived",
      };
      productPayload.status = map[body.status] ?? body.status;
    }

    const url = `https://${org.shopify_shop_domain}/admin/api/2024-10/products/${prod.shopify_product_id}.json`;
    const putRes = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": org.shopify_access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ product: productPayload }),
    });

    if (!putRes.ok) {
      const txt = await putRes.text();
      return new Response(
        JSON.stringify({ ok: false, error: `PUT ${putRes.status}: ${txt.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
