// Build public URLs for stored assets and external storefront links.
import { supabase } from "@/integrations/supabase/client";

/** Public storage URL from a bucket + path pair (mirrors the portal convention). */
export function storageUrl(bucket: string | null | undefined, path: string | null | undefined): string | null {
  if (!bucket || !path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export function productImageUrl(p: { image_bucket: string | null; image_path: string | null }): string | null {
  return storageUrl(p.image_bucket, p.image_path);
}

// BACKEND: storefront base is currently the AX Shopify products path. When a
// per-org storefront domain exists, resolve it from the organization record.
const STORE_BASE = "https://athletexclusive.com/products/";

/** External shop link for a product handle, or null when not yet on the store. */
export function shopLink(handle: string | null | undefined): string | null {
  if (!handle) return null;
  return STORE_BASE + handle;
}

export function fmtPrice(value: number | null | undefined): string | null {
  if (value == null) return null;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
