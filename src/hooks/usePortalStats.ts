import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface State {
  productsLive: number | null;
  activeDesigns: number | null;
  loading: boolean;
}

/**
 * Counts for the portal stats row:
 *  - productsLive: published products linked to athlete (via product_athletes)
 *  - activeDesigns: designs linked to athlete with status in approved/production_ready
 *    (via design_athletes)
 */
export function usePortalStats(athleteId: string | null): State {
  const [productsLive, setProductsLive] = useState<number | null>(null);
  const [activeDesigns, setActiveDesigns] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!athleteId) {
      setProductsLive(null);
      setActiveDesigns(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [productsRes, designsRes] = await Promise.all([
        // Products linked to this athlete with status='published'
        supabase
          .from("product_athletes")
          .select("product_id, products!inner(status)", { count: "exact", head: false })
          .eq("athlete_id", athleteId)
          .eq("products.status", "published"),
        // Designs linked to this athlete with status in approved / production_ready
        supabase
          .from("design_athletes")
          .select("design_id, designs!inner(status)", { count: "exact", head: false })
          .eq("athlete_id", athleteId)
          .in("designs.status", ["approved", "production_ready"]),
      ]);

      if (cancelled) return;
      setProductsLive(productsRes.count ?? productsRes.data?.length ?? 0);
      setActiveDesigns(designsRes.count ?? designsRes.data?.length ?? 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  return { productsLive, activeDesigns, loading };
}
