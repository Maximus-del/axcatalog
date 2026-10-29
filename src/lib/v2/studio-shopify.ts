// Placement Studio -> Shopify: what the "Add to Shopify" step needs to know.
//
//   Existing product — the client's products already in the dashboard
//                      (products linked to them that have a Shopify id).
//   Collections      — the store's Shopify collections (looked up through the
//                      mockup-review-sync function, which holds the token).
//   Linking          — a NEW Shopify product also gets a dashboard product row
//                      linked to the client, so it shows in their locker/dashboard.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slug";
import { must, t, type Row } from "./db";

/** The org every AX-run product row lives in (same as the Proactive / Mooney products). */
export const AX_ORG_ID = "2d6f377e-4fe8-448b-84b3-42aed237f3da";

export interface ClientProduct {
  id: string;
  title: string;
  shopifyGid: string;
  status: string;
}

export interface ShopifyCollection {
  id: string;
  title: string;
  count: number;
}

export function useClientProducts(clientId: string | null) {
  return useQuery({
    queryKey: ["v2", "studio", "client-products", clientId],
    enabled: !!clientId,
    staleTime: 60_000,
    queryFn: async (): Promise<ClientProduct[]> => {
      const links = await t("product_athletes").select("product_id").eq("athlete_id", clientId!);
      const ids = ((links.data ?? []) as Row[]).map((r) => String(r.product_id));
      if (!ids.length) return [];
      const res = await t("products").select("id, title, shopify_product_id, status").in("id", ids);
      if (res.error) throw new Error(res.error.message);
      return ((res.data ?? []) as Row[])
        .filter((p) => typeof p.shopify_product_id === "string" && String(p.shopify_product_id).length > 0)
        .map((p) => ({
          id: String(p.id),
          title: String(p.title ?? "Untitled"),
          shopifyGid: toProductGid(String(p.shopify_product_id)),
          status: String(p.status ?? ""),
        }))
        .sort((a, b) => a.title.localeCompare(b.title));
    },
  });
}

/** Accepts "gid://shopify/Product/123" or a bare "123". */
export function toProductGid(v: string): string {
  return v.startsWith("gid://") ? v : `gid://shopify/Product/${v.replace(/\D/g, "")}`;
}

export function useShopifyCollections(enabled: boolean) {
  return useQuery({
    queryKey: ["v2", "studio", "shopify-collections"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ShopifyCollection[]> => {
      const { data, error } = await supabase.functions.invoke("mockup-review-sync", { body: { lookup: "collections" } });
      if (error) throw new Error(error.message);
      const d = data as { collections?: ShopifyCollection[]; error?: string };
      if (d.error) throw new Error(d.error);
      return d.collections ?? [];
    },
  });
}

/** Tags a product gets on Shopify: the client's name (how storefront filters find it) + anything typed. */
export function defaultTags(clientName: string | null | undefined): string[] {
  return clientName ? [clientName] : [];
}

export function parseTags(raw: string): string[] {
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 20);
}

/**
 * After Shopify made a NEW product: make sure the dashboard has it, linked to
 * the client. Idempotent — an existing row with that Shopify id is reused.
 */
export async function linkProductToClient(args: { shopifyGid: string; title: string; clientId: string; price: number | null; colors: string[] }) {
  const found = await t("products").select("id").eq("shopify_product_id", args.shopifyGid).limit(1);
  let productId = ((found.data ?? []) as Row[])[0]?.id as string | undefined;
  if (!productId) {
    const res = await must(
      t("products")
        .insert({
          organization_id: AX_ORG_ID,
          title: args.title,
          slug: `${slugify(args.title)}-${Math.random().toString(36).slice(2, 7)}`,
          price: args.price,
          product_type: "athlete_merch",
          status: "draft",
          shopify_product_id: args.shopifyGid,
          metadata: { colors: args.colors, created_from: { source: "placement-studio" } },
        } as never)
        .select("id")
        .single(),
    );
    productId = String((res.data as Row).id);
  }
  const link = await t("product_athletes").select("product_id").eq("product_id", productId).eq("athlete_id", args.clientId).limit(1);
  if (!((link.data ?? []) as Row[]).length) await must(t("product_athletes").insert({ product_id: productId, athlete_id: args.clientId } as never));
  return productId;
}
