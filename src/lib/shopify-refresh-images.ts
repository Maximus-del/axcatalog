// Thin client wrapper around the `shopify-sync-product-images` edge function.
// Used by the per-product and org-wide "Refresh Images" buttons.
import { supabase } from "@/integrations/supabase/client";

export interface ImageRefreshResult {
  ok: boolean;
  products_processed: number;
  products_failed: number;
  totals: {
    matched_by_id: number;
    matched_by_url: number;
    matched_by_position: number;
    inserted: number;
    orphaned: number;
    unchanged: number;
  };
  results: Array<{
    product_id: string;
    shopify_product_id: string;
    matched_by_id: number;
    matched_by_url: number;
    matched_by_position: number;
    inserted: number;
    orphaned: number;
    unchanged: number;
  }>;
  errors: Array<{ product_id: string; error: string }>;
}

export async function refreshShopifyImages(opts: {
  product_id?: string;
} = {}): Promise<ImageRefreshResult> {
  const { data, error } = await supabase.functions.invoke(
    "shopify-sync-product-images",
    { body: opts },
  );
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as ImageRefreshResult;
}

export function summarizeRefresh(r: ImageRefreshResult): string {
  const t = r.totals;
  const parts = [
    `${r.products_processed} product${r.products_processed === 1 ? "" : "s"}`,
    `${t.matched_by_id + t.matched_by_url + t.matched_by_position} refreshed`,
    t.inserted ? `${t.inserted} new` : null,
    t.orphaned ? `${t.orphaned} orphaned` : null,
    r.products_failed ? `${r.products_failed} failed` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}