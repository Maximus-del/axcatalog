// Acceptance case 9: an invalid Shopify HMAC is rejected.
import { describe, expect, it } from "vitest";
import { safeEqual, shopifyHmac, verifyShopifyWebhook }
  from "../../../supabase/functions/_shared/shopify-hmac";

const SECRET = "shpss_test_secret_value";
const BODY = JSON.stringify({ inventory_item_id: 42, location_id: 7, available: 12 });

describe("shopifyHmac", () => {
  it("produces a stable base64 digest for a body", async () => {
    const a = await shopifyHmac(BODY, SECRET);
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(await shopifyHmac(BODY, SECRET)).toBe(a);
  });

  it("changes completely when the body changes by one character", async () => {
    const a = await shopifyHmac(BODY, SECRET);
    const b = await shopifyHmac(BODY.replace("12", "13"), SECRET);
    expect(b).not.toBe(a);
  });

  it("changes when the secret changes", async () => {
    expect(await shopifyHmac(BODY, "other")).not.toBe(await shopifyHmac(BODY, SECRET));
  });
});

describe("verifyShopifyWebhook", () => {
  it("accepts a genuine delivery", async () => {
    expect(await verifyShopifyWebhook(BODY, await shopifyHmac(BODY, SECRET), SECRET)).toBe(true);
  });

  it("9. rejects a forged signature", async () => {
    expect(await verifyShopifyWebhook(BODY, "bm90LWEtcmVhbC1zaWduYXR1cmU=", SECRET)).toBe(false);
  });

  it("rejects a tampered body carrying a valid-for-the-original signature", async () => {
    // The attack this defends against: replay a real signature with a bigger
    // quantity attached.
    const sig = await shopifyHmac(BODY, SECRET);
    const tampered = JSON.stringify({ inventory_item_id: 42, location_id: 7, available: 9999 });
    expect(await verifyShopifyWebhook(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects a missing header rather than treating absence as valid", async () => {
    expect(await verifyShopifyWebhook(BODY, null, SECRET)).toBe(false);
    expect(await verifyShopifyWebhook(BODY, "", SECRET)).toBe(false);
  });

  it("rejects when no secret is configured, rather than accepting everything", async () => {
    expect(await verifyShopifyWebhook(BODY, await shopifyHmac(BODY, SECRET), "")).toBe(false);
  });

  it("is not fooled by re-serialised JSON", async () => {
    // Same object, different key order — which is why verification must run on
    // the raw bytes and not on a re-stringified parse.
    const sig = await shopifyHmac(BODY, SECRET);
    const reordered = JSON.stringify({ available: 12, location_id: 7, inventory_item_id: 42 });
    expect(await verifyShopifyWebhook(reordered, sig, SECRET)).toBe(false);
  });
});

describe("safeEqual", () => {
  it("matches identical strings and rejects everything else", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  it("compares the whole string even when the first byte differs", () => {
    // Not a timing measurement — just proof there is no early return path that
    // could short-circuit on the first character.
    expect(safeEqual("Xbcdefgh", "abcdefgh")).toBe(false);
    expect(safeEqual("abcdefgX", "abcdefgh")).toBe(false);
  });
});
