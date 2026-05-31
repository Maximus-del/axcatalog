// Refreshes product_images rows from Shopify with surgical, ID-keyed updates.
//
// POST { product_id?: string, organization_id?: string }
// - If product_id given: refreshes that single product.
// - Else: refreshes every product in the caller's org that has a shopify_product_id.
//
// Match strategy per product:
//   1) match existing product_images rows by metadata.shopify_image_id
//   2) backfill: if a row lacks shopify_image_id, try matching by storage_path
//      (URL) then by sort_order (position) and write the Shopify id into metadata
//   3) unmatched Shopify images -> insert new row (storage_bucket='external')
//   4) DB rows whose shopify_image_id is no longer in Shopify ->
//      metadata.shopify_orphaned = true (kept, not deleted)
//
// TODO(followup-migration): promote metadata.shopify_image_id and
// metadata.shopify_updated_at to real columns on product_images once stable.

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

function idFromGid(gid: string): string {
  const m = /\/(\d+)$/.exec(gid);
  return m ? m[1] : gid;
}

const PRODUCT_IMAGES_QUERY = `
  query getProductImages($id: ID!) {
    product(id: $id) {
      id
      images(first: 50) {
        edges {
          node { id url altText width height }
        }
      }
    }
  }
`;

// Lightweight query for the "Fetch image" action — only the primary
// (first / featuredImage) image and its id/url.
const PRODUCT_PRIMARY_IMAGE_QUERY = `
  query getPrimaryImage($id: ID!) {
    product(id: $id) {
      id
      handle
      featuredImage { id url altText }
    }
  }
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
  return json.data;
}

type ProductResult = {
  product_id: string;
  shopify_product_id: string;
  matched_by_id: number;
  matched_by_url: number;
  matched_by_position: number;
  inserted: number;
  orphaned: number;
  unchanged: number;
  error?: string;
};

async function refreshOne(
  admin: ReturnType<typeof createClient>,
  org: { shopify_shop_domain: string; shopify_access_token: string },
  product: { id: string; shopify_product_id: string },
): Promise<ProductResult> {
  const result: ProductResult = {
    product_id: product.id,
    shopify_product_id: product.shopify_product_id,
    matched_by_id: 0,
    matched_by_url: 0,
    matched_by_position: 0,
    inserted: 0,
    orphaned: 0,
    unchanged: 0,
  };

  const data = await gql(
    org.shopify_shop_domain,
    org.shopify_access_token,
    PRODUCT_IMAGES_QUERY,
    { id: toGid(product.shopify_product_id) },
  );
  const edges = data?.product?.images?.edges ?? [];
  const shopifyImages = edges.map((e: any, i: number) => ({
    id: idFromGid(e.node.id as string),
    url: e.node.url as string,
    alt: (e.node.altText as string | null) ?? null,
    position: i + 1,
  }));

  const { data: rowsData, error: rowsErr } = await admin
    .from("product_images")
    .select("id, storage_path, storage_bucket, sort_order, alt_text, metadata")
    .eq("product_id", product.id);
  if (rowsErr) throw rowsErr;
  const rows = (rowsData ?? []) as Array<{
    id: string;
    storage_path: string;
    storage_bucket: string;
    sort_order: number;
    alt_text: string | null;
    metadata: Record<string, any> | null;
  }>;

  const usedRowIds = new Set<string>();
  const nowIso = new Date().toISOString();

  for (const img of shopifyImages) {
    // 1) match by shopify_image_id in metadata
    let row = rows.find(
      (r) => !usedRowIds.has(r.id) && r.metadata?.shopify_image_id === img.id,
    );
    let matchedBy: "id" | "url" | "position" | null = row ? "id" : null;

    // 2a) backfill: match by storage_path (URL)
    if (!row) {
      row = rows.find(
        (r) =>
          !usedRowIds.has(r.id) &&
          r.storage_bucket === "external" &&
          !r.metadata?.shopify_image_id &&
          r.storage_path === img.url,
      );
      if (row) matchedBy = "url";
    }
    // 2b) backfill: match by position (sort_order)
    if (!row) {
      row = rows.find(
        (r) =>
          !usedRowIds.has(r.id) &&
          r.storage_bucket === "external" &&
          !r.metadata?.shopify_image_id &&
          r.sort_order === img.position - 1,
      );
      if (row) matchedBy = "position";
    }

    if (row) {
      usedRowIds.add(row.id);
      const newMeta = {
        ...(row.metadata ?? {}),
        shopify_image_id: img.id,
        shopify_updated_at: nowIso,
        shopify_position: img.position,
        shopify_orphaned: false,
      };
      const urlChanged = row.storage_path !== img.url;
      const { error: upErr } = await admin
        .from("product_images")
        .update({
          storage_path: img.url,
          storage_bucket: "external",
          metadata: newMeta,
        })
        .eq("id", row.id);
      if (upErr) throw upErr;
      if (matchedBy === "id") {
        if (urlChanged) result.matched_by_id++;
        else result.unchanged++;
      } else if (matchedBy === "url") result.matched_by_url++;
      else if (matchedBy === "position") result.matched_by_position++;
    } else {
      // 3) insert new row
      const { error: insErr } = await admin.from("product_images").insert({
        product_id: product.id,
        storage_bucket: "external",
        storage_path: img.url,
        file_name: img.url.split("/").pop()?.split("?")[0] ?? null,
        alt_text: img.alt,
        sort_order: img.position - 1,
        is_primary: img.position === 1,
        metadata: {
          shopify_image_id: img.id,
          shopify_updated_at: nowIso,
          shopify_position: img.position,
          shopify_orphaned: false,
        },
      });
      if (insErr) throw insErr;
      result.inserted++;
    }
  }

  // 4) orphan any rows that had a shopify_image_id no longer present
  const shopifyIdSet = new Set(shopifyImages.map((i) => i.id));
  for (const r of rows) {
    const sid = r.metadata?.shopify_image_id as string | undefined;
    if (sid && !shopifyIdSet.has(sid) && !r.metadata?.shopify_orphaned) {
      await admin
        .from("product_images")
        .update({
          metadata: { ...(r.metadata ?? {}), shopify_orphaned: true, shopify_orphaned_at: nowIso },
        })
        .eq("id", r.id);
      result.orphaned++;
    }
  }

  return result;
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
    const orgId = (profile as any).organization_id as string;

    const body = (await req.json().catch(() => ({}))) as {
      product_id?: string;
      organization_id?: string;
      mode?: "fetch_primary_only";
    };
    // organization_id from body is informational; we always scope to the caller's org.
    if (body.organization_id && body.organization_id !== orgId) {
      return jsonRes({ error: "organization_id mismatch" }, 403);
    }

    const { data: org } = await admin
      .from("organizations")
      .select("name, shopify_shop_domain, shopify_access_token")
      .eq("id", orgId)
      .maybeSingle();
    if (!org?.shopify_shop_domain || !org?.shopify_access_token) {
      return jsonRes(
        { error: `Shopify credentials not configured for ${org?.name ?? "organization"}` },
        400,
      );
    }

    // ---- fetch_primary_only: surgical "grab the current primary image now" ----
    if (body.mode === "fetch_primary_only") {
      if (!body.product_id) {
        return jsonRes({ error: "product_id is required for fetch_primary_only" }, 400);
      }
      const { data: prod } = await admin
        .from("products")
        .select("id, shopify_product_id, organization_id")
        .eq("id", body.product_id)
        .maybeSingle();
      if (!prod || (prod as any).organization_id !== orgId) {
        return jsonRes({ error: "Product not found" }, 404);
      }
      const shopifyId = (prod as any).shopify_product_id as string | null;
      if (!shopifyId) {
        return jsonRes({ error: "Product is not linked to Shopify" }, 400);
      }
      const shopifyAdminUrl = `https://${org.shopify_shop_domain}/admin/products/${idFromGid(shopifyId)}`;

      let data;
      try {
        data = await gql(
          org.shopify_shop_domain,
          org.shopify_access_token,
          PRODUCT_PRIMARY_IMAGE_QUERY,
          { id: toGid(shopifyId) },
        );
      } catch (e) {
        return jsonRes(
          { error: e instanceof Error ? e.message : String(e), shopify_admin_url: shopifyAdminUrl },
          502,
        );
      }
      const featured = data?.product?.featuredImage;
      if (!featured?.url) {
        return jsonRes(
          {
            ok: false,
            no_image: true,
            shopify_admin_url: shopifyAdminUrl,
            message: "No image found in Shopify for this product",
          },
          200,
        );
      }
      const imgId = idFromGid(featured.id as string);
      const nowIso = new Date().toISOString();

      // Find existing row by shopify_image_id, else by current primary, else create.
      const { data: imgs } = await admin
        .from("product_images")
        .select("id, metadata, is_primary, storage_path, sort_order")
        .eq("product_id", (prod as any).id);
      let row = (imgs ?? []).find(
        (r: any) => r.metadata?.shopify_image_id === imgId,
      ) as any;
      if (!row) row = (imgs ?? []).find((r: any) => r.is_primary) as any;

      if (row) {
        const newMeta = {
          ...(row.metadata ?? {}),
          shopify_image_id: imgId,
          shopify_updated_at: nowIso,
          shopify_position: 1,
          shopify_orphaned: false,
          last_refresh_failed: false,
        };
        delete (newMeta as any).last_refresh_error;
        const { error: upErr } = await admin
          .from("product_images")
          .update({
            storage_path: featured.url,
            storage_bucket: "external",
            is_primary: true,
            alt_text: featured.altText ?? null,
            metadata: newMeta,
          })
          .eq("id", row.id);
        if (upErr) {
          return jsonRes({ error: upErr.message, shopify_admin_url: shopifyAdminUrl }, 500);
        }
      } else {
        const { error: insErr } = await admin.from("product_images").insert({
          product_id: (prod as any).id,
          storage_bucket: "external",
          storage_path: featured.url,
          file_name: (featured.url as string).split("/").pop()?.split("?")[0] ?? null,
          alt_text: featured.altText ?? null,
          sort_order: 0,
          is_primary: true,
          metadata: {
            shopify_image_id: imgId,
            shopify_updated_at: nowIso,
            shopify_position: 1,
            shopify_orphaned: false,
          },
        });
        if (insErr) {
          return jsonRes({ error: insErr.message, shopify_admin_url: shopifyAdminUrl }, 500);
        }
      }

      return jsonRes({
        ok: true,
        url: featured.url,
        shopify_image_id: imgId,
        shopify_admin_url: shopifyAdminUrl,
      });
    }

    let q = admin
      .from("products")
      .select("id, shopify_product_id")
      .eq("organization_id", orgId)
      .not("shopify_product_id", "is", null);
    if (body.product_id) q = q.eq("id", body.product_id);
    const { data: products, error: pErr } = await q;
    if (pErr) throw pErr;

    const results: ProductResult[] = [];
    const errors: Array<{ product_id: string; error: string }> = [];
    for (const p of products ?? []) {
      try {
        const r = await refreshOne(admin, org as any, p as any);
        results.push(r);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        errors.push({ product_id: (p as any).id, error: err });
        // Mark last_refresh_failed on every image row for this product
        const { data: imgs } = await admin
          .from("product_images")
          .select("id, metadata")
          .eq("product_id", (p as any).id);
        for (const r of imgs ?? []) {
          await admin
            .from("product_images")
            .update({
              metadata: {
                ...((r as any).metadata ?? {}),
                last_refresh_failed: true,
                last_refresh_error: err.slice(0, 300),
                last_refresh_at: new Date().toISOString(),
              },
            })
            .eq("id", (r as any).id);
        }
      }
    }

    const totals = results.reduce(
      (acc, r) => {
        acc.matched_by_id += r.matched_by_id;
        acc.matched_by_url += r.matched_by_url;
        acc.matched_by_position += r.matched_by_position;
        acc.inserted += r.inserted;
        acc.orphaned += r.orphaned;
        acc.unchanged += r.unchanged;
        return acc;
      },
      { matched_by_id: 0, matched_by_url: 0, matched_by_position: 0, inserted: 0, orphaned: 0, unchanged: 0 },
    );

    return jsonRes({
      ok: true,
      products_processed: results.length,
      products_failed: errors.length,
      totals,
      results,
      errors,
    });
  } catch (e) {
    console.error("shopify-sync-product-images error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});