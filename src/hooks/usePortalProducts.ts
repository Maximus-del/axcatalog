import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PortalProduct {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "internal" | "published" | "archived" | "needs_review";
  product_type: string;
  shopify_handle: string | null;
  blank_id: string | null;
  primary_image_url: string | null;
  /** Available sizes from the linked blank, in sort_order. */
  sizes: string[];
  created_at: string;
}

interface State {
  products: PortalProduct[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Products linked to an athlete via product_athletes.
 * Filters to status in ('published','internal'). Includes primary image
 * (public URL) and the blank's available sizes for inline ordering.
 */
export function usePortalProducts(athleteId: string | null): State {
  const [products, setProducts] = useState<PortalProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!athleteId) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      // 1) Pull product_athletes joined to products (filter status)
      const { data, error: err } = await supabase
        .from("product_athletes")
        .select(
          `product:products!inner(
             id, title, slug, status, product_type, shopify_handle, blank_id, created_at,
             images:product_images(storage_bucket, storage_path, is_primary, sort_order)
           )`,
        )
        .eq("athlete_id", athleteId)
        .in("product.status", ["published", "internal"]);

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setProducts([]);
        setLoading(false);
        return;
      }

      const rawProducts = (data ?? [])
        .map((r) => (Array.isArray(r.product) ? r.product[0] : r.product))
        .filter(Boolean) as Array<{
        id: string;
        title: string;
        slug: string;
        status: PortalProduct["status"];
        product_type: string;
        shopify_handle: string | null;
        blank_id: string | null;
        created_at: string;
        images: Array<{
          storage_bucket: string;
          storage_path: string;
          is_primary: boolean;
          sort_order: number;
        }>;
      }>;

      // 2) Fetch sizes for all blanks involved
      const blankIds = Array.from(
        new Set(rawProducts.map((p) => p.blank_id).filter(Boolean) as string[]),
      );
      const sizesByBlank = new Map<string, string[]>();
      if (blankIds.length) {
        const { data: szData } = await supabase
          .from("blank_sizes")
          .select("blank_id, size, sort_order, available")
          .in("blank_id", blankIds)
          .eq("available", true)
          .order("sort_order", { ascending: true });
        (szData ?? []).forEach((s) => {
          const arr = sizesByBlank.get(s.blank_id) ?? [];
          arr.push(s.size);
          sizesByBlank.set(s.blank_id, arr);
        });
      }

      // 3) Resolve primary image URL (sort: is_primary desc, sort_order asc)
      const result: PortalProduct[] = rawProducts.map((p) => {
        const sortedImgs = [...(p.images ?? [])].sort(
          (a, b) =>
            Number(b.is_primary) - Number(a.is_primary) ||
            (a.sort_order ?? 0) - (b.sort_order ?? 0),
        );
        const top = sortedImgs[0];
        const url = top
          ? supabase.storage.from(top.storage_bucket).getPublicUrl(top.storage_path).data.publicUrl
          : null;
        return {
          id: p.id,
          title: p.title,
          slug: p.slug,
          status: p.status,
          product_type: p.product_type,
          shopify_handle: p.shopify_handle,
          blank_id: p.blank_id,
          primary_image_url: url,
          sizes: p.blank_id ? (sizesByBlank.get(p.blank_id) ?? []) : [],
          created_at: p.created_at,
        };
      });

      // Sort: created_at desc
      result.sort((a, b) => b.created_at.localeCompare(a.created_at));

      setProducts(result);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [athleteId, tick]);

  return { products, loading, error, refetch };
}
