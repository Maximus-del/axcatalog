import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PortalOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  total_units: number;
  status:
    | "submitted"
    | "acknowledged"
    | "in_production"
    | "ready"
    | "shipped"
    | "completed"
    | "cancelled";
}

interface State {
  orders: PortalOrder[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePortalOrders(athleteId: string | null, limit = 25): State {
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!athleteId) {
      setOrders([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const { data, error: err } = await supabase
        .from("bulk_order_requests")
        .select("id, order_number, created_at, total_units, status")
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setOrders([]);
      } else {
        setOrders((data ?? []) as PortalOrder[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId, limit, tick]);

  return { orders, loading, error, refetch };
}
