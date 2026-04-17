import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { BulkOrderStatus } from "@/lib/order-status";

export interface AdminOrderRow {
  id: string;
  order_number: string | null;
  status: BulkOrderStatus;
  priority: string;
  total_units: number;
  created_at: string;
  acknowledged_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  tracking_number: string | null;
  shipping_carrier: string | null;
  athlete_id: string | null;
  team_id: string | null;
  athlete: {
    id: string;
    full_name: string | null;
    first_name: string;
    last_name: string;
  } | null;
  team: {
    id: string;
    name: string;
  } | null;
}

export function useAdminOrders() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bulk_order_requests")
      .select(
        `id, order_number, status, priority, total_units, created_at,
         acknowledged_at, shipped_at, completed_at,
         tracking_number, shipping_carrier,
         athlete_id, team_id,
         athlete:athletes!bulk_order_requests_athlete_id_fkey(id, full_name, first_name, last_name),
         team:teams!bulk_order_requests_team_id_fkey(id, name)`,
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("useAdminOrders error", error);
      setOrders([]);
    } else {
      setOrders((data ?? []) as unknown as AdminOrderRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  return { orders, loading, refetch: fetchOrders };
}

export function clientName(o: AdminOrderRow): string {
  if (o.athlete) {
    return (
      o.athlete.full_name ||
      `${o.athlete.first_name} ${o.athlete.last_name}`.trim() ||
      "Unknown"
    );
  }
  if (o.team) return o.team.name;
  return "Unknown client";
}
