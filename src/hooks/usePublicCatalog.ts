import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// PUBLIC-FACING. Reads ONLY from the `public_catalog` view, which exposes
// a strict allow-list of safe columns from `blanks`. Never query `blanks`
// directly from this layer — that would leak vendor/cost/internal data.
export interface CatalogItem {
  id: string;
  sku: string | null;
  name: string;
  garment_type: string | null;
  price_athlete: number | null;
  price_corporate: number | null;
  price_standard: number | null;
  image_url: string | null;
}

const SAFE_COLUMNS =
  "id, sku, name, garment_type, price_athlete, price_corporate, price_standard, image_url";

export function usePublicCatalog() {
  return useQuery({
    queryKey: ["public-catalog"],
    queryFn: async (): Promise<CatalogItem[]> => {
      const { data, error } = await supabase
        .from("public_catalog")
        .select(SAFE_COLUMNS)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CatalogItem[];
    },
  });
}

export function usePublicCatalogItem(id: string | undefined) {
  return useQuery({
    queryKey: ["public-catalog", id],
    enabled: !!id,
    queryFn: async (): Promise<CatalogItem | null> => {
      const { data, error } = await supabase
        .from("public_catalog")
        .select(SAFE_COLUMNS)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data as CatalogItem | null) ?? null;
    },
  });
}

export interface CatalogColor {
  color_name: string;
  sort_order: number;
}

export interface CatalogSize {
  size: string;
  sort_order: number;
}

export function usePublicCatalogColors(blankId: string | undefined) {
  return useQuery({
    queryKey: ["public-catalog-colors", blankId],
    enabled: !!blankId,
    queryFn: async (): Promise<CatalogColor[]> => {
      const { data, error } = await supabase
        .from("public_catalog_colors" as any)
        .select("color_name, sort_order")
        .eq("blank_id", blankId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CatalogColor[];
    },
  });
}

export function usePublicCatalogSizes(blankId: string | undefined) {
  return useQuery({
    queryKey: ["public-catalog-sizes", blankId],
    enabled: !!blankId,
    queryFn: async (): Promise<CatalogSize[]> => {
      const { data, error } = await supabase
        .from("public_catalog_sizes" as any)
        .select("size, sort_order")
        .eq("blank_id", blankId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CatalogSize[];
    },
  });
}