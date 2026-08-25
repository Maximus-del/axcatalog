// Shopify webhook receiver.
//
// POST from Shopify with X-Shopify-Hmac-Sha256, X-Shopify-Topic,
// X-Shopify-Shop-Domain and X-Shopify-Webhook-Id.
//
// Everything here is defensive, because a webhook endpoint is a public URL that
// writes to inventory:
//
//   The signature is verified against the RAW body, before the JSON is parsed.
//   Parsing first and re-serialising changes key order and whitespace, so the
//   HMAC would never match — and the tempting fix for that is to stop checking,
//   which turns this into an unauthenticated write endpoint.
//
//   Comparison is constant-time. A byte-by-byte early return leaks the expected
//   signature to anyone willing to time the responses.
//
//   Deliveries are deduplicated by webhook id and ORDERED by event time.
//   Shopify guarantees neither exactly-once nor in-order, so an older event
//   arriving late must be dropped rather than replayed over a newer quantity.
//
//   Unknown topics return 200. A non-2xx makes Shopify retry forever and
//   eventually disable the subscription — for something we deliberately ignore.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
// Covered by src/lib/ecosystem/shopify-hmac.test.ts.
import { verifyShopifyWebhook } from "../_shared/shopify-hmac.ts";

function res(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return res({ error: "POST only" }, 405);

  // RAW body first, and only once — the signature is over these exact bytes.
  const raw = await req.text();

  const hmac = req.headers.get("X-Shopify-Hmac-Sha256") ?? "";
  const topic = req.headers.get("X-Shopify-Topic") ?? "";
  const shopDomain = req.headers.get("X-Shopify-Shop-Domain") ?? "";
  const webhookId = req.headers.get("X-Shopify-Webhook-Id") ?? null;
  const triggeredAt = req.headers.get("X-Shopify-Triggered-At") ?? null;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("id, shopify_webhook_secret")
      .eq("shopify_shop_domain", shopDomain)
      .maybeSingle();

    const secret = org?.shopify_webhook_secret
      ?? Deno.env.get("SHOPIFY_WEBHOOK_SECRET")
      ?? "";

    if (!secret) return res({ error: "No webhook secret configured for this shop" }, 401);
    if (!(await verifyShopifyWebhook(raw, hmac, secret))) {
      // Deliberately terse and 401: an attacker learns nothing about why.
      return res({ error: "Invalid signature" }, 401);
    }

    // Dedupe by delivery id. Unique index on shopify_webhook_id does the work,
    // so two concurrent deliveries cannot both win the check.
    if (webhookId) {
      const { data: seen } = await supabase
        .from("shopify_webhooks")
        .select("id")
        .eq("shopify_webhook_id", webhookId)
        .maybeSingle();
      if (seen) return res({ ok: true, deduplicated: true });
    }

    const payload = JSON.parse(raw);

    const { data: logged } = await supabase
      .from("shopify_webhooks")
      .insert({
        organization_id: org?.id ?? null,
        event: topic.replace("/", "_"),
        shopify_topic: topic,
        shopify_webhook_id: webhookId,
        status: "received",
        shopify_resource_id: String(payload.id ?? payload.inventory_item_id ?? ""),
        payload,
        received_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    const finish = async (status: string, error?: string) => {
      if (!logged?.id) return;
      await supabase.from("shopify_webhooks")
        .update({ status, processed_at: new Date().toISOString(), error_message: error ?? null })
        .eq("id", logged.id);
    };

    const eventAt = triggeredAt ?? payload.updated_at ?? null;

    switch (topic) {
      case "inventory_levels/update": {
        const itemId = String(payload.inventory_item_id ?? "");
        const locId = String(payload.location_id ?? "");
        if (!itemId || !locId) { await finish("ignored", "missing ids"); break; }

        const { data: variant } = await supabase
          .from("blank_variants")
          .select("id")
          .eq("shopify_inventory_item_id", itemId)
          .maybeSingle();

        // Not one of ours — an athlete product's inventory moved. Acknowledge
        // and do nothing; this endpoint only owns blanks.
        if (!variant) { await finish("ignored", "inventory item is not a mapped blank variant"); break; }

        const { data: existing } = await supabase
          .from("blank_inventory_levels")
          .select("id, last_shopify_sync_at")
          .eq("blank_variant_id", variant.id)
          .eq("shopify_location_id", locId)
          .maybeSingle();

        // Out-of-order guard: never let an older event overwrite a newer figure.
        if (existing?.last_shopify_sync_at && eventAt
            && new Date(eventAt) < new Date(existing.last_shopify_sync_at)) {
          await finish("ignored", "older than the stored quantity");
          break;
        }

        await supabase.from("blank_inventory_levels").upsert({
          blank_variant_id: variant.id,
          shopify_location_id: locId,
          available_quantity: payload.available ?? 0,
          last_shopify_sync_at: eventAt ?? new Date().toISOString(),
        }, { onConflict: "blank_variant_id,shopify_location_id" });

        await finish("processed");
        break;
      }

      case "products/update":
      case "products/create": {
        const productId = String(payload.id ?? "");
        const { data: blank } = await supabase
          .from("blanks").select("id").eq("shopify_product_id", productId).maybeSingle();
        if (!blank) { await finish("ignored", "product is not a linked blank"); break; }

        await supabase.from("blanks").update({
          shopify_status: (payload.status ?? "").toLowerCase() || null,
          last_shopify_sync_at: new Date().toISOString(),
        }).eq("id", blank.id);

        // Variant detail is left to reconciliation on purpose: a product
        // payload can arrive without its full variant list, and a partial
        // write here would delete variants that still exist.
        await finish("processed");
        break;
      }

      case "products/delete": {
        const productId = String(payload.id ?? "");
        const { data: blank } = await supabase
          .from("blanks").select("id").eq("shopify_product_id", productId).maybeSingle();
        if (!blank) { await finish("ignored", "not a linked blank"); break; }

        // The link is cleared; the blank is NOT deleted and its images,
        // pricing and assortments are untouched. It falls back to Not Linked,
        // which is exactly what it now is.
        await supabase.from("blanks").update({
          shopify_product_id: null,
          shopify_status: null,
          last_shopify_sync_at: new Date().toISOString(),
        }).eq("id", blank.id);

        await supabase.from("blank_inventory_audit").insert({
          blank_id: blank.id, kind: "mapping", source: "webhook:products/delete",
          before: { shopify_product_id: productId }, after: { shopify_product_id: null },
        });

        await finish("processed");
        break;
      }

      default:
        await finish("ignored", `unhandled topic ${topic}`);
    }

    return res({ ok: true });
  } catch (e) {
    // 200 with a logged failure: Shopify should not retry a payload that makes
    // our handler throw, and reconciliation is the safety net that repairs it.
    await supabase.from("shopify_webhooks").insert({
      event: topic.replace("/", "_"),
      shopify_topic: topic,
      shopify_webhook_id: webhookId,
      status: "failed",
      error_message: e instanceof Error ? e.message : String(e),
      received_at: new Date().toISOString(),
    }).then(() => {}, () => {});
    return res({ ok: false, logged: true });
  }
});
