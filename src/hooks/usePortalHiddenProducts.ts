import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Per-athlete "hidden in portal" flags. Lets an athlete remove products from
 * their own portal view without touching the admin or Shopify records.
 */
export function usePortalHiddenProducts(athleteId: string | null) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!athleteId) {
      setHiddenIds(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from("portal_hidden_products")
        .select("product_id")
        .eq("athlete_id", athleteId);
      if (cancelled) return;
      setHiddenIds(new Set((data ?? []).map((r) => r.product_id as string)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId, tick]);

  const hide = useCallback(
    async (productIds: string[]) => {
      if (!athleteId || productIds.length === 0) return;
      const rows = productIds.map((pid) => ({ athlete_id: athleteId, product_id: pid }));
      const { error } = await supabase
        .from("portal_hidden_products")
        .upsert(rows, { onConflict: "athlete_id,product_id" });
      if (error) throw error;
      setHiddenIds((prev) => {
        const next = new Set(prev);
        productIds.forEach((id) => next.add(id));
        return next;
      });
    },
    [athleteId],
  );

  const unhide = useCallback(
    async (productIds: string[]) => {
      if (!athleteId || productIds.length === 0) return;
      const { error } = await supabase
        .from("portal_hidden_products")
        .delete()
        .eq("athlete_id", athleteId)
        .in("product_id", productIds);
      if (error) throw error;
      setHiddenIds((prev) => {
        const next = new Set(prev);
        productIds.forEach((id) => next.delete(id));
        return next;
      });
    },
    [athleteId],
  );

  return { hiddenIds, loading, hide, unhide, refetch };
}