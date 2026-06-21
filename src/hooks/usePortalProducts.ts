import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PortalImage {
  id: string;
  url: string;
  is_primary: boolean;
  sort_order: number;
}

export interface PortalVariant {
  id: string;
  productId: string;
  shopifyVariantId: string;
  sku: string | null;
  title: string | null;
  color: string | null;
  size: string | null;
  price: number | null;
  compareAtPrice: number | null;
  available: boolean;
  inventoryQuantity: number | null;
  inventoryPolicy: string | null;
  position: number | null;
  shopifyImageId: string | null;
  metadata: Record<string, any>;
  syncedAt: string | null;
}

export interface PortalProduct {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "internal" | "published" | "archived" | "needs_review";
  product_type: string;
  shopify_handle: string | null;
  blank_id: string | null;
  primary_image_url: string | null;
  /** Full ordered image list, primary first. Used for fallback chain + gallery. */
  images: PortalImage[];
  price: number | null;
  wholesale_price: number | null;
  /**
   * Athlete-tier MOQ unit price from compute_wholesale_price(_, _, 10).
   * null when the linked blank has no tier price set yet.
   */
  athlete_unit_price: number | null;
  /** Real Shopify variants when available (non-orphaned). Empty array for manual/non-Shopify products. */
  variants: PortalVariant[];
  /** Available sizes: derived from variants when present, else from linked blank. */
  sizes: string[];
  /** Available colors: derived from variants when present, else from linked blank/metadata. */
  colors: Array<{ name: string; hex: string | null }>;
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
      // Need the athlete's organization to price at their tier.
      const { data: athleteRow } = await supabase
        .from("athletes")
        .select("organization_id")
        .eq("id", athleteId)
        .maybeSingle();
      const organizationId = athleteRow?.organization_id ?? null;

      // 1) Pull product_athletes joined to products (filter status)
      const { data, error: err } = await supabase
        .from("product_athletes")
        .select(
          `product:products!inner(
             id, title, slug, status, product_type, shopify_handle, blank_id, price, wholesale_price, metadata, created_at,
             images:product_images(id, storage_bucket, storage_path, is_primary, sort_order)
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
        price: number | null;
        wholesale_price: number | null;
        metadata: Record<string, any> | null;
        created_at: string;
        images: Array<{
          id: string;
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

      const colorsByBlank = new Map<string, Array<{ name: string; hex: string | null }>>();
      if (blankIds.length) {
        const { data: cData } = await supabase
          .from("blank_colors")
          .select("blank_id, color_name, hex_code, sort_order, available")
          .in("blank_id", blankIds)
          .eq("available", true)
          .order("sort_order", { ascending: true });
        (cData ?? []).forEach((c) => {
          const arr = colorsByBlank.get(c.blank_id) ?? [];
          arr.push({ name: c.color_name, hex: c.hex_code });
          colorsByBlank.set(c.blank_id, arr);
        });
      }

      const resolveUrl = (img: {
        storage_bucket: string;
        storage_path: string;
      }): string | null => {
        if (!img?.storage_path) return null;
        if (img.storage_bucket === "external" || /^https?:\/\//i.test(img.storage_path)) {
          return img.storage_path;
        }
        return supabase.storage.from(img.storage_bucket).getPublicUrl(img.storage_path).data
          .publicUrl;
      };

      // 2.5) Batch-fetch real Shopify variants for all loaded products.
      // Excludes soft-deleted (orphaned) variants via metadata.orphaned_at.
      const productIds = rawProducts.map((p) => p.id);
      const variantsByProduct = new Map<string, PortalVariant[]>();
      if (productIds.length) {
        const { data: vData, error: vErr } = await supabase
          .from("product_variants")
          .select(
            "id, product_id, shopify_variant_id, sku, title, color, size, price, compare_at_price, available, inventory_quantity, inventory_policy, position, shopify_image_id, metadata, synced_at",
          )
          .in("product_id", productIds)
          .order("product_id", { ascending: true })
          .order("position", { ascending: true, nullsFirst: false })
          .order("color", { ascending: true, nullsFirst: false })
          .order("size", { ascending: true, nullsFirst: false });
        if (vErr && import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[usePortalProducts] variant fetch failed:", vErr.message);
        }
        (vData ?? []).forEach((v: any) => {
          const meta = (v.metadata ?? {}) as Record<string, any>;
          // Skip soft-deleted (orphaned) variants.
          if (meta.orphaned_at) return;
          // Treat inventory_policy='continue' as available even when qty=0.
          const policyContinues = v.inventory_policy === "continue";
          const available =
            v.available === true ||
            policyContinues ||
            (typeof v.inventory_quantity === "number" && v.inventory_quantity > 0);
          const variant: PortalVariant = {
            id: v.id,
            productId: v.product_id,
            shopifyVariantId: v.shopify_variant_id,
            sku: v.sku ?? null,
            title: v.title ?? null,
            color: v.color ?? null,
            size: v.size ?? null,
            price: v.price != null ? Number(v.price) : null,
            compareAtPrice: v.compare_at_price != null ? Number(v.compare_at_price) : null,
            available,
            inventoryQuantity: v.inventory_quantity ?? null,
            inventoryPolicy: v.inventory_policy ?? null,
            position: v.position ?? null,
            shopifyImageId: v.shopify_image_id ?? null,
            metadata: meta,
            syncedAt: v.synced_at ?? null,
          };
          const arr = variantsByProduct.get(v.product_id) ?? [];
          arr.push(variant);
          variantsByProduct.set(v.product_id, arr);
        });
      }

      // 3) Resolve all images (primary first), then derive primary URL.
      const baseResult = rawProducts.map((p) => {
        const sortedImgs = [...(p.images ?? [])].sort(
          (a, b) =>
            Number(b.is_primary) - Number(a.is_primary) ||
            (a.sort_order ?? 0) - (b.sort_order ?? 0),
        );
        const images: PortalImage[] = sortedImgs
          .map((i) => {
            const url = resolveUrl(i);
            return url
              ? {
                  id: i.id,
                  url,
                  is_primary: !!i.is_primary,
                  sort_order: i.sort_order ?? 0,
                }
              : null;
          })
          .filter((x): x is PortalImage => !!x);

        const variants = variantsByProduct.get(p.id) ?? [];

        // Derive colors/sizes from variants when present; preserve first-seen
        // (Shopify position) order and drop null/empty values.
        let derivedColors: Array<{ name: string; hex: string | null }> | null = null;
        let derivedSizes: string[] | null = null;
        if (variants.length) {
          const seenColors = new Set<string>();
          const colorList: Array<{ name: string; hex: string | null }> = [];
          const seenSizes = new Set<string>();
          const sizeList: string[] = [];
          for (const v of variants) {
            if (v.color && !seenColors.has(v.color)) {
              seenColors.add(v.color);
              colorList.push({ name: v.color, hex: null });
            }
            if (v.size && !seenSizes.has(v.size)) {
              seenSizes.add(v.size);
              sizeList.push(v.size);
            }
          }
          derivedColors = colorList;
          derivedSizes = sizeList;
        }

        return {
          id: p.id,
          title: p.title,
          slug: p.slug,
          status: p.status,
          product_type: p.product_type,
          shopify_handle: p.shopify_handle,
          blank_id: p.blank_id,
          primary_image_url: images[0]?.url ?? null,
          images,
          price: p.price != null ? Number(p.price) : null,
          wholesale_price: p.wholesale_price != null ? Number(p.wholesale_price) : null,
          athlete_unit_price: null as number | null,
          variants,
          sizes:
            derivedSizes && derivedSizes.length
              ? derivedSizes
              : p.blank_id
              ? (sizesByBlank.get(p.blank_id) ?? [])
              : [],
          colors: (() => {
            if (derivedColors && derivedColors.length) return derivedColors;
            const blankColors = p.blank_id ? (colorsByBlank.get(p.blank_id) ?? []) : [];
            if (blankColors.length) return blankColors;
            const metaColors = Array.isArray(p.metadata?.colors) ? p.metadata.colors : [];
            return metaColors
              .map((c: any) =>
                typeof c === "string"
                  ? { name: c, hex: null }
                  : c && typeof c.name === "string"
                  ? { name: c.name, hex: c.hex ?? null }
                  : null,
              )
              .filter(Boolean) as Array<{ name: string; hex: string | null }>;
          })(),
          created_at: p.created_at,
        };
      });

      // 4) Athlete-tier unit price (MOQ=10) via RPC, parallel per product.
      if (organizationId && baseResult.length) {
        const priced = await Promise.all(
          baseResult.map(async (p) => {
            try {
              const { data: priceRow } = await supabase.rpc("compute_wholesale_price", {
                _product_id: p.id,
                _organization_id: organizationId,
                _unit_count: 10,
              });
              const row = Array.isArray(priceRow) ? priceRow[0] : priceRow;
              const unit = row?.unit_price ?? row?.tier_moq_price ?? null;
              return { ...p, athlete_unit_price: unit != null ? Number(unit) : null };
            } catch {
              return p;
            }
          }),
        );
        priced.sort((a, b) => b.created_at.localeCompare(a.created_at));
        if (cancelled) return;
        setProducts(priced);
        setLoading(false);
        return;
      }

      const result = baseResult;
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
