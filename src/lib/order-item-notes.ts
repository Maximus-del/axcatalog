/**
 * Bulk order line items store Shopify variant selection inside the free-form
 * `notes` column as a JSON blob, e.g.
 *   { "shopify_variant_id": "gid://shopify/ProductVariant/123", "sku": "ABC-M", "note": "rush" }
 *
 * Older / manual orders just have a plain string (or null). Any downstream code
 * that needs the Shopify variant ID or wants to display human-friendly notes
 * should go through `parseOrderItemNotes` so malformed JSON never crashes.
 */

export interface ParsedOrderItemNotes {
  /** Shopify variant GID or numeric id, if present. */
  shopifyVariantId: string | null;
  /** Variant SKU snapshot, if present. */
  sku: string | null;
  /** Free-form user note (legacy string notes land here verbatim). */
  text: string | null;
  /** True when the notes column was valid JSON with our shape. */
  isStructured: boolean;
  /** Original raw value, for debugging. */
  raw: string | null;
}

const EMPTY: ParsedOrderItemNotes = {
  shopifyVariantId: null,
  sku: null,
  text: null,
  isStructured: false,
  raw: null,
};

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}

export function parseOrderItemNotes(
  notes: string | null | undefined,
): ParsedOrderItemNotes {
  if (!notes) return EMPTY;
  const raw = notes;
  const trimmed = notes.trim();
  if (!trimmed) return { ...EMPTY, raw };

  // Only attempt JSON parsing if it looks like an object — otherwise treat as
  // legacy plain-text note.
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") {
        const shopifyVariantId =
          asString(parsed.shopify_variant_id) ??
          asString((parsed as Record<string, unknown>).shopifyVariantId);
        const sku = asString(parsed.sku);
        const text =
          asString(parsed.note) ??
          asString((parsed as Record<string, unknown>).notes) ??
          asString((parsed as Record<string, unknown>).text);
        if (shopifyVariantId || sku || text) {
          return {
            shopifyVariantId,
            sku,
            text,
            isStructured: true,
            raw,
          };
        }
      }
    } catch {
      // fall through to plain-text handling
    }
  }

  return { ...EMPTY, text: trimmed, raw };
}

/**
 * Convenience: returns the Shopify variant GID/id from a notes value, or null.
 * Use this wherever Shopify line-item payloads are being assembled.
 */
export function getShopifyVariantIdFromNotes(
  notes: string | null | undefined,
): string | null {
  return parseOrderItemNotes(notes).shopifyVariantId;
}
