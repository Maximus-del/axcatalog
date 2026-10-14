// Shopify webhook signature verification.
//
// Shared with the browser bundle only so it can be unit tested — nothing in the
// UI calls it. Web Crypto is available in Deno, Node 18+ and browsers alike, so
// one implementation covers the runtime that matters and the runtime that
// proves it works.

/**
 * Constant-time string comparison.
 *
 * A plain === returns as soon as it finds a differing byte, and the time that
 * takes is measurable over a network. An attacker can use it to discover the
 * expected signature one byte at a time, so every comparison here costs the
 * same regardless of where the difference is.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The base64 HMAC-SHA256 Shopify sends in X-Shopify-Hmac-Sha256.
 *
 * Takes the RAW body string. Parsing the JSON first and re-serialising it
 * changes key order and whitespace, and the digest would then never match —
 * at which point the tempting fix is to stop verifying, which turns a webhook
 * endpoint into an unauthenticated write to inventory.
 */
export async function shopifyHmac(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Whether a delivery is authentic. False for a missing or malformed header. */
export async function verifyShopifyWebhook(
  rawBody: string,
  headerHmac: string | null,
  secret: string,
): Promise<boolean> {
  if (!headerHmac || !secret) return false;
  return safeEqual(headerHmac, await shopifyHmac(rawBody, secret));
}
