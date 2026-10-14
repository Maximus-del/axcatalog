// Creates a NEW product in Shopify from an approved AX product.
//
// Mirrors shopify-update-product: service-role client to read the org's
// credentials, but only after verifying the caller is an admin of that org.
//
// Deliberate safety properties:
//  - Refuses unless products.approval_state = 'approved'. The athlete approving
//    is the gate for their merch reaching a storefront.
//  - Refuses if the product already has a shopify_product_id, so a double-click
//    cannot create a duplicate listing.
//  - Creates as DRAFT by default. Going live stays a separate human action.
//  - AX remains the source of truth: we send data one way and store the returned
//    Shopify identifiers. Nothing about the AX product is overwritten by Shopify.
//
// POST { product_id: string, status?: 'DRAFT' | 'ACTIVE' }
// Returns { ok, shopify_product_id?, handle?, variant_count?, error? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_VERSION = "2024-10";

function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const PRODUCT_CREATE = `
  mutation productCreate($input: ProductInput!) {
    productCreate(input: $input) {
      product { id handle title status options { id name } variants(first: 1) { nodes { id } } }
      userErrors { field message }
    }
  }
`;

const VARIANTS_BULK_CREATE = `
  mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!, $strategy: ProductVariantsBulkCreateStrategy) {
    productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
      productVariants { id title }
      userErrors { field message }
    }
  }
`;

const CREATE_MEDIA = `
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media { alt status }
      mediaUserErrors { field message }
    }
  }
`;

interface Body {
  product_id: string;
  status?: "DRAFT" | "ACTIVE";
}

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
    if (userErr || !userData?.user) return jsonRes({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = (await req.json()) as Body;
    if (!body.product_id) return jsonRes({ ok: false, error: "missing product_id" }, 400);

    const { data: prod, error: prodErr } = await admin
      .from("products")
      .select("id, organization_id, title, description, price, compare_at_price, product_type, blank_id, approval_state, shopify_product_id, metadata")
      .eq("id", body.product_id)
      .maybeSingle();
    if (prodErr) throw prodErr;
    if (!prod) return jsonRes({ ok: false, error: "product not found" }, 404);

    const { data: profile } = await admin
      .from("user_profiles")
      .select("organization_id, role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile || profile.organization_id !== prod.organization_id || profile.role !== "admin") {
      return jsonRes({ ok: false, error: "Forbidden — admin only" }, 403);
    }

    // The athlete's approval is the gate. Not negotiable from the client.
    if (prod.approval_state !== "approved") {
      return jsonRes({ ok: false, error: "product is not approved by the athlete" }, 400);
    }
    if (prod.shopify_product_id) {
      return jsonRes({ ok: false, error: "already on shopify", shopify_product_id: prod.shopify_product_id }, 409);
    }
    if (!prod.title || !prod.price) {
      return jsonRes({ ok: false, error: "missing title or price" }, 400);
    }

    const { data: org } = await admin
      .from("organizations")
      .select("name, shopify_shop_domain, shopify_access_token")
      .eq("id", prod.organization_id)
      .maybeSingle();
    if (!org?.shopify_shop_domain || !org.shopify_access_token) {
      return jsonRes({ ok: false, error: "missing shopify creds" }, 400);
    }

    const gql = async (query: string, variables: Record<string, unknown>) => {
      const res = await fetch(`https://${org.shopify_shop_domain}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": org.shopify_access_token as string,
        },
        body: JSON.stringify({ query, variables }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      const json = JSON.parse(text);
      if (json.errors?.length) throw new Error(json.errors.map((e: { message: string }) => e.message).join("; "));
      return json.data;
    };

    // Options come from the blank — AX already knows the real colors and sizes.
    const [{ data: colors }, { data: sizes }, { data: images }, { data: athletes }, { data: cols }] = await Promise.all([
      admin.from("blank_colors").select("color_name, sort_order").eq("blank_id", prod.blank_id ?? "").eq("available", true).order("sort_order"),
      admin.from("blank_sizes").select("size, sort_order").eq("blank_id", prod.blank_id ?? "").eq("available", true).order("sort_order"),
      admin.from("product_images").select("storage_bucket, storage_path, sort_order").eq("product_id", prod.id).order("sort_order"),
      admin.from("product_athletes").select("athlete:athletes(full_name, first_name, last_name, league)").eq("product_id", prod.id),
      admin.from("collection_products").select("collection:collections(name)").eq("product_id", prod.id),
    ]);

    const meta = (prod.metadata ?? {}) as Record<string, unknown>;
    const chosenColors: string[] = Array.isArray(meta.colors) && meta.colors.length
      ? (meta.colors as string[])
      : (colors ?? []).map((c: { color_name: string }) => c.color_name);
    const chosenSizes: string[] = Array.isArray(meta.sizes) && meta.sizes.length
      ? (meta.sizes as string[])
      : (sizes ?? []).map((s: { size: string }) => s.size);

    const productOptions: { name: string; values: { name: string }[] }[] = [];
    if (chosenColors.length) productOptions.push({ name: "Color", values: chosenColors.map((v) => ({ name: v })) });
    if (chosenSizes.length) productOptions.push({ name: "Size", values: chosenSizes.map((v) => ({ name: v })) });

    const athleteNames = (athletes ?? [])
      .map((r: { athlete: { full_name?: string; first_name?: string; last_name?: string } | null }) => {
        const a = r.athlete;
        return a ? (a.full_name || `${a.first_name ?? ""} ${a.last_name ?? ""}`).trim() : "";
      })
      .filter(Boolean);
    const collectionNames = (cols ?? [])
      .map((r: { collection: { name?: string } | null }) => r.collection?.name ?? "")
      .filter(Boolean);

    const tags = Array.from(new Set([...athleteNames, ...collectionNames, "AthleteXclusive"]));

    const input: Record<string, unknown> = {
      title: prod.title,
      descriptionHtml: prod.description ?? "",
      vendor: (org.name as string) || "AthleteXclusive",
      productType: prod.product_type ?? "athlete_merch",
      status: body.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
      tags,
    };
    if (productOptions.length) input.productOptions = productOptions;

    const created = await gql(PRODUCT_CREATE, { input });
    const userErrors = created?.productCreate?.userErrors ?? [];
    if (userErrors.length) {
      return jsonRes({
        ok: false,
        error: userErrors.map((e: { field?: string[]; message: string }) => `${e.field?.join(".") ?? ""}: ${e.message}`).join("; "),
      }, 400);
    }
    const product = created.productCreate.product;
    const productGid: string = product.id;

    // Variants: every color x size combination at the AX price.
    let variantIds: string[] = [];
    if (productOptions.length) {
      const combos: { optionValues: { optionName: string; name: string }[] }[] = [];
      const colorList = chosenColors.length ? chosenColors : [null];
      const sizeList = chosenSizes.length ? chosenSizes : [null];
      for (const c of colorList) {
        for (const s of sizeList) {
          const optionValues: { optionName: string; name: string }[] = [];
          if (c) optionValues.push({ optionName: "Color", name: c });
          if (s) optionValues.push({ optionName: "Size", name: s });
          if (optionValues.length) combos.push({ optionValues });
        }
      }
      if (combos.length) {
        const variants = combos.map((c) => ({
          ...c,
          price: String(prod.price),
          ...(prod.compare_at_price ? { compareAtPrice: String(prod.compare_at_price) } : {}),
        }));
        const vres = await gql(VARIANTS_BULK_CREATE, {
          productId: productGid,
          variants,
          strategy: "REMOVE_STANDALONE_VARIANT",
        });
        const vErrors = vres?.productVariantsBulkCreate?.userErrors ?? [];
        if (vErrors.length) {
          // The product exists at this point — record it rather than orphaning it.
          await admin.from("products").update({
            shopify_product_id: productGid.split("/").pop(),
            shopify_handle: product.handle,
            shopify_sync_status: "error",
            shopify_last_synced_at: new Date().toISOString(),
          }).eq("id", prod.id);
          return jsonRes({
            ok: false,
            shopify_product_id: productGid,
            error: `product created but variants failed: ${vErrors.map((e: { message: string }) => e.message).join("; ")}`,
          }, 502);
        }
        variantIds = (vres.productVariantsBulkCreate.productVariants ?? []).map((v: { id: string }) => v.id);
      }
    }

    // Images, best effort — a listing without media is fixable, a failed push is worse.
    let mediaError: string | null = null;
    const mediaInputs = (images ?? [])
      .map((img: { storage_bucket: string | null; storage_path: string | null }) => {
        if (!img.storage_path) return null;
        if (img.storage_bucket === "external") return img.storage_path;
        const bucket = img.storage_bucket || "product-images";
        return `${supabaseUrl}/storage/v1/object/public/${bucket}/${img.storage_path}`;
      })
      .filter((u): u is string => !!u && /^https?:\/\//.test(u))
      .slice(0, 10)
      .map((src) => ({ originalSource: src, mediaContentType: "IMAGE", alt: prod.title }));

    if (mediaInputs.length) {
      try {
        const mres = await gql(CREATE_MEDIA, { productId: productGid, media: mediaInputs });
        const mErrors = mres?.productCreateMedia?.mediaUserErrors ?? [];
        if (mErrors.length) mediaError = mErrors.map((e: { message: string }) => e.message).join("; ");
      } catch (e) {
        mediaError = e instanceof Error ? e.message : String(e);
      }
    }

    const numericId = productGid.split("/").pop();
    await admin.from("products").update({
      shopify_product_id: numericId,
      shopify_handle: product.handle,
      shopify_variant_ids: variantIds,
      shopify_sync_status: mediaError ? "partial" : "synced",
      shopify_last_synced_at: new Date().toISOString(),
    }).eq("id", prod.id);

    return jsonRes({
      ok: true,
      shopify_product_id: numericId,
      handle: product.handle,
      status: product.status,
      variant_count: variantIds.length,
      media_error: mediaError,
    });
  } catch (e) {
    console.error("shopify-create-product error:", e);
    return jsonRes({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
