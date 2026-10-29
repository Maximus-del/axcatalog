// Mockup review -> Shopify. Pushes ONE design's decisions to its Shopify product.
//
// POST { design_code, product_type?, price?, sku_prefix? }
//   The optional fields come from Placement Studio (the blank's garment type,
//   the price typed there, AX + style number). Without them: Tee / $45 / AX7010.
//   approved  -> colour is on the product (variants S..3XL created if missing,
//                front/back photos attached, each new variant shows its front)
//   archived / needs_fix -> colour's variants removed from the product
//   pending   -> untouched
// No product yet (shopify_product_gid null) -> creates a DRAFT with the
// approved colours. Never changes status, title, price of existing variants or
// any other product. Refuses to remove every colour (Shopify needs one variant).
//
// Who may run it: an AX operator (their session).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (p: unknown, s = 200) => new Response(JSON.stringify(p), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const API = "2024-10";
const DEFAULT_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"];
const DEFAULT_PRICE = "45.00"; // AXISM 7010 house price unless Chase says otherwise

type Row = {
  id: string; design_code: string; design_name: string; product_title: string | null; garment: string; blank_style: string | null;
  color: string; front_drive_id: string | null; back_drive_id: string | null; front_url: string | null; back_url: string | null;
  review_state: string; shopify_product_gid: string | null; shopify_state: string | null; organization_id: string; athlete_id: string | null;
};

const shopifyImage = (driveId: string | null, url: string | null) =>
  driveId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}` : url;
const skuPart = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first" }, 401);
  const asUser = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: isOp, error: opErr } = await asUser.rpc("current_user_is_operator");
  if (opErr || isOp !== true) return json({ error: "AX team only" }, 403);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const designCode = String(body.design_code ?? "").trim();
  if (!designCode) return json({ error: "design_code required" }, 400);
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[^\w .&'-]/g, "").trim().slice(0, max) : "");
  const productType = clean(body.product_type, 40) || "Tee";
  const priceIn = Number(body.price);
  const newPrice = Number.isFinite(priceIn) && priceIn > 0 && priceIn < 10000 ? priceIn.toFixed(2) : DEFAULT_PRICE;
  const skuPrefix = clean(body.sku_prefix, 16).replace(/[^A-Za-z0-9]/g, "") || "AX7010";

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rowsData, error: rErr } = await admin.from("mockup_reviews").select("*").eq("design_code", designCode);
  if (rErr) return json({ error: rErr.message }, 500);
  const rows = (rowsData ?? []) as Row[];
  if (!rows.length) return json({ error: "No mockups for that design" }, 404);

  const { data: org } = await admin.from("organizations").select("shopify_shop_domain, shopify_access_token").eq("id", rows[0].organization_id).maybeSingle();
  if (!org?.shopify_shop_domain || !org.shopify_access_token) return json({ error: "Shopify is not connected for this organisation" }, 400);

  const gql = async (query: string, variables: Record<string, unknown>) => {
    const res = await fetch(`https://${org.shopify_shop_domain}/admin/api/${API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": org.shopify_access_token },
      body: JSON.stringify({ query, variables }),
    });
    const out = await res.json();
    if (!res.ok || out.errors) throw new Error(`Shopify: ${JSON.stringify(out.errors ?? out).slice(0, 300)}`);
    return out.data;
  };
  const userErrors = (o: { userErrors?: Array<{ message: string }> } | null | undefined) => {
    const e = o?.userErrors ?? [];
    if (e.length) throw new Error(e.map((x) => x.message).join("; "));
  };

  const approved = rows.filter((r) => r.review_state === "approved");
  const offStates = new Set(["archived", "needs_fix"]);
  let productGid = rows.find((r) => r.shopify_product_gid)?.shopify_product_gid ?? null;
  const added: string[] = [];
  const removed: string[] = [];

  const mark = async (colors: string[], state: "on" | "off") => {
    if (!colors.length) return;
    await admin.from("mockup_reviews").update({ shopify_state: state, shopify_product_gid: productGid, synced_at: new Date().toISOString(), sync_error: null, updated_at: new Date().toISOString() })
      .eq("design_code", designCode).in("color", colors);
  };

  // Attach front/back photos for these colours, then point each colour's variants at its front.
  const attachPhotos = async (title: string, colors: string[]) => {
    const media: Array<{ originalSource: string; mediaContentType: string; alt: string }> = [];
    for (const c of colors) {
      const r = rows.find((x) => x.color === c);
      if (!r) continue;
      const f = shopifyImage(r.front_drive_id, r.front_url);
      const b = shopifyImage(r.back_drive_id, r.back_url);
      if (f) media.push({ originalSource: f, mediaContentType: "IMAGE", alt: `${title} in ${c} — Front view` });
      if (b) media.push({ originalSource: b, mediaContentType: "IMAGE", alt: `${title} in ${c} — Back view` });
    }
    for (let i = 0; i < media.length; i += 20) {
      const d = await gql(`mutation m($productId: ID!, $media: [CreateMediaInput!]!) { productCreateMedia(productId: $productId, media: $media) { media { id } mediaUserErrors { message } } }`,
        { productId: productGid, media: media.slice(i, i + 20) });
      const errs = d.productCreateMedia?.mediaUserErrors ?? [];
      if (errs.length) throw new Error(errs.map((x: { message: string }) => x.message).join("; "));
    }
    // Wait (briefly) for Shopify to process, then link variant -> front image.
    let tries = 0;
    while (tries++ < 10) {
      await new Promise((r) => setTimeout(r, 2500));
      const d = await gql(`query q($id: ID!) { product(id: $id) { media(first: 250) { nodes { id alt status } } variants(first: 250) { nodes { id selectedOptions { name value } media(first: 1) { nodes { id } } } } } }`, { id: productGid });
      const nodes = d.product.media.nodes as Array<{ id: string; alt: string; status: string }>;
      const wanted = colors.map((c) => nodes.find((n) => n.alt === `${title} in ${c} — Front view`));
      if (wanted.some((n) => !n || n.status === "PROCESSING" || n.status === "UPLOADED")) continue;
      const updates: Array<{ id: string; mediaId: string }> = [];
      for (const v of d.product.variants.nodes as Array<{ id: string; selectedOptions: Array<{ name: string; value: string }>; media: { nodes: Array<{ id: string }> } }>) {
        const color = v.selectedOptions.find((o) => o.name.toLowerCase() === "color")?.value;
        const idx = color ? colors.indexOf(color) : -1;
        const m = idx >= 0 ? wanted[idx] : undefined;
        if (m && m.status === "READY") updates.push({ id: v.id, mediaId: m.id });
      }
      if (updates.length) {
        const u = await gql(`mutation u($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { message } } }`, { productId: productGid, variants: updates });
        userErrors(u.productVariantsBulkUpdate);
      }
      return;
    }
  };

  try {
    // ---------------------------------------------------------------- create
    if (!productGid) {
      if (!approved.length) return json({ design_code: designCode, added, removed, note: "Nothing approved yet" });
      const title = rows[0].product_title ?? `${rows[0].design_name} Tee`;
      const colors = approved.map((r) => r.color);
      const d = await gql(`mutation s($input: ProductSetInput!) { productSet(input: $input, synchronous: true) { product { id } userErrors { message } } }`, {
        input: {
          title, status: "DRAFT", vendor: "Athlete Xclusive", productType,
          tags: ["Athlete Xclusive", "Streetwear", productType, rows[0].design_name],
          productOptions: [{ name: "Color", values: colors.map((name) => ({ name })) }, { name: "Size", values: DEFAULT_SIZES.map((name) => ({ name })) }],
          variants: colors.flatMap((c) => DEFAULT_SIZES.map((sz) => ({
            optionValues: [{ optionName: "Color", name: c }, { optionName: "Size", name: sz }],
            price: newPrice, inventoryPolicy: "CONTINUE", sku: `${designCode}_V1_${skuPrefix}_${skuPart(c)}_${sz}`,
          }))),
        },
      });
      userErrors(d.productSet);
      productGid = d.productSet.product.id as string;
      await admin.from("mockup_reviews").update({ shopify_product_gid: productGid, product_title: title }).eq("design_code", designCode);
      await attachPhotos(title, colors);
      added.push(...colors);
      await mark(colors, "on");
      return json({ design_code: designCode, product_gid: productGid, added, removed });
    }

    // -------------------------------------------------------------- existing
    const p = await gql(`query q($id: ID!) { product(id: $id) { title options { id name optionValues { id name hasVariants } } variants(first: 250) { nodes { price selectedOptions { name value } } } } }`, { id: productGid });
    if (!p.product) throw new Error("The Shopify product no longer exists");
    const title = p.product.title as string;
    const colorOpt = (p.product.options as Array<{ id: string; name: string; optionValues: Array<{ id: string; name: string; hasVariants: boolean }> }>).find((o) => o.name.toLowerCase() === "color");
    const sizeOpt = (p.product.options as Array<{ name: string; optionValues: Array<{ name: string }> }>).find((o) => o.name.toLowerCase() === "size");
    if (!colorOpt) throw new Error("This product has no Color option");
    const onShop = new Set(colorOpt.optionValues.filter((v) => v.hasVariants).map((v) => v.name.toLowerCase()));
    const sizes = sizeOpt?.optionValues.map((v) => v.name) ?? DEFAULT_SIZES;
    const price = (p.product.variants.nodes[0]?.price as string | undefined) ?? DEFAULT_PRICE;

    const toRemove = rows.filter((r) => offStates.has(r.review_state) && onShop.has(r.color.toLowerCase())).map((r) => r.color);
    const toAdd = approved.filter((r) => !onShop.has(r.color.toLowerCase())).map((r) => r.color);
    const alreadyOn = approved.filter((r) => onShop.has(r.color.toLowerCase())).map((r) => r.color);
    const alreadyOff = rows.filter((r) => offStates.has(r.review_state) && !onShop.has(r.color.toLowerCase())).map((r) => r.color);

    const remaining = onShop.size - toRemove.length + toAdd.length;
    if (remaining <= 0) throw new Error("That would remove every colour — approve at least one first");

    // Add before removing so the product never drops to zero variants.
    if (toAdd.length) {
      const variants = toAdd.flatMap((c) => sizes.map((sz) => ({
        optionValues: [{ optionName: colorOpt.name, name: c }, { optionName: sizeOpt?.name ?? "Size", name: sz }],
        price, inventoryPolicy: "CONTINUE", sku: `${designCode}_V1_${skuPrefix}_${skuPart(c)}_${sz}`,
      })));
      const d = await gql(`mutation c($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkCreate(productId: $productId, variants: $variants) { userErrors { message } } }`, { productId: productGid, variants });
      userErrors(d.productVariantsBulkCreate);
      await attachPhotos(title, toAdd);
      added.push(...toAdd);
    }

    if (toRemove.length) {
      const ids = colorOpt.optionValues.filter((v) => toRemove.some((c) => c.toLowerCase() === v.name.toLowerCase())).map((v) => v.id);
      const d = await gql(`mutation o($productId: ID!, $option: OptionUpdateInput!, $del: [ID!]) { productOptionUpdate(productId: $productId, option: $option, optionValuesToDelete: $del, variantStrategy: MANAGE) { userErrors { message } } }`,
        { productId: productGid, option: { id: colorOpt.id }, del: ids });
      userErrors(d.productOptionUpdate);
      removed.push(...toRemove);
    }

    await mark([...added, ...alreadyOn], "on");
    await mark([...removed, ...alreadyOff], "off");
    return json({ design_code: designCode, product_gid: productGid, added, removed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("mockup_reviews").update({ sync_error: msg.slice(0, 500), updated_at: new Date().toISOString() }).eq("design_code", designCode);
    return json({ design_code: designCode, error: msg, added, removed }, 502);
  }
});
