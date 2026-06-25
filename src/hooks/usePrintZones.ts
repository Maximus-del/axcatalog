import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GarmentCategory, PrintZone, SurfaceKey } from "@/lib/print-zones";

/**
 * Fetches print zones for a garment category from the `print_zones` table.
 * Returns all surfaces grouped by `SurfaceKey`. Public read is allowed.
 */
export function usePrintZones(category: GarmentCategory) {
  return useQuery({
    queryKey: ["print-zones", category],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<SurfaceKey, PrintZone[]>> => {
      const { data, error } = await supabase
        .from("print_zones" as any)
        .select("surface, zone_id, label, x, y, w, h, sort_order")
        .eq("garment_category", category)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const grouped: Record<SurfaceKey, PrintZone[]> = { front: [], back: [] };
      for (const r of (data ?? []) as any[]) {
        const surface = r.surface as SurfaceKey;
        if (surface !== "front" && surface !== "back") continue;
        grouped[surface].push({
          id: r.zone_id,
          label: r.label,
          x: Number(r.x),
          y: Number(r.y),
          w: Number(r.w),
          h: Number(r.h),
        });
      }
      return grouped;
    },
  });
}