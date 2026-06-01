import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ProductSales {
  quantity: number;
  revenue: number;
}

export interface PortalSales {
  lifetimeRevenue: number;
  totalOrders: number;
  byProduct: Map<string, ProductSales>;
  loading: boolean;
}

/**
 * Aggregates attributed-revenue stats for an org from order_line_items.
 * Excludes test orders. Refunds (negative line_totals) net out.
 */
export function usePortalSales(organizationId: string | null): PortalSales {
  const [state, setState] = useState<PortalSales>({
    lifetimeRevenue: 0,
    totalOrders: 0,
    byProduct: new Map(),
    loading: false,
  });

  useEffect(() => {
    if (!organizationId) {
      setState({ lifetimeRevenue: 0, totalOrders: 0, byProduct: new Map(), loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    void (async () => {
      // Page through all line items attributed to this org.
      // Join orders to filter out test orders.
      const pageSize = 1000;
      let from = 0;
      let revenue = 0;
      const orderIds = new Set<string>();
      const byProduct = new Map<string, ProductSales>();

      while (true) {
        const { data, error } = await supabase
          .from("order_line_items")
          .select("order_id, product_id, quantity, line_total, orders!inner(id, is_test)")
          .eq("attributed_org_id", organizationId)
          .eq("orders.is_test", false)
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);

        if (error || !data) break;
        for (const r of data as Array<{
          order_id: string;
          product_id: string | null;
          quantity: number | null;
          line_total: number | null;
        }>) {
          const lt = Number(r.line_total ?? 0);
          revenue += lt;
          orderIds.add(r.order_id);
          if (r.product_id) {
            const cur = byProduct.get(r.product_id) ?? { quantity: 0, revenue: 0 };
            cur.quantity += Number(r.quantity ?? 0);
            cur.revenue += lt;
            byProduct.set(r.product_id, cur);
          }
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }

      if (cancelled) return;
      setState({
        lifetimeRevenue: Math.round(revenue * 100) / 100,
        totalOrders: orderIds.size,
        byProduct,
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return state;
}