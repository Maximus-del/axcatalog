// Thin client wrapper around the `shopify-sync-product-variants` edge function.
// Used by the per-product and org-wide "Refresh Variants" admin buttons.
import { supabase } from "@/integrations/supabase/client";

export interface VariantRefreshResult {
  products_processed: number;
  variants_inserted: number;
  variants_updated: number;
  variants_orphaned: number;
  errors: Array<{ product_id: string; message: string }>;
}

export async function refreshShopifyVariants(opts: {
  product_id?: string;
} = {}): Promise<VariantRefreshResult> {
  const { data, error } = await supabase.functions.invoke(
    "shopify-sync-product-variants",
    { body: opts },
  );
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(String(data.error));
  return data as VariantRefreshResult;
}

export function summarizeVariantRefresh(r: VariantRefreshResult): string {
  const parts = [
    `${r.products_processed} product${r.products_processed === 1 ? "" : "s"}`,
    `${r.variants_inserted} new`,
    `${r.variants_updated} updated`,
    r.variants_orphaned ? `${r.variants_orphaned} orphaned` : null,
    r.errors.length ? `${r.errors.length} failed` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}