import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { monthlyRevenue, type RevenuePoint } from "@/lib/portal/revenue-series";
import { fetchRevenue } from "@/lib/portal/api/summary";
import { lastMonths } from "@/lib/portal/api/period";

export interface ProductSales {
  quantity: number;
  revenue: number;
}

export interface PortalSales {
  lifetimeRevenue: number;
  totalOrders: number;
  byProduct: Map<string, ProductSales>;
  /** Attributed revenue per calendar month, last 12, oldest first. */
  monthly: RevenuePoint[];
  loading: boolean;
}

/**
 * Attributed-revenue stats for the portal header, profile and analytics.
 *
 * SERVER FIRST. portal_revenue_summary() aggregates server-side for the
 * scoped athlete. Reading order_line_items directly only ever worked for AX
 * accounts: the client policy on those rows requires a product link that none
 * of the imported Shopify lines carry, so a real client login read $0 and 0
 * orders while "View as" showed the true figures. Falls back to the direct read
 * only while that function is not deployed.
 *
 * Basis: GROSS — line totals before refunds and cancellations (decided
 * 2026-10-15: label it honestly rather than change it). Refund-flagged orders
 * are included, as they always were; the import does not store them negative.
 */
export function usePortalSales(organizationId: string | null, athleteId?: string | null): PortalSales {
  const [state, setState] = useState<PortalSales>({
    lifetimeRevenue: 0,
    totalOrders: 0,
    byProduct: new Map(),
    monthly: [],
    loading: false,
  });

  useEffect(() => {
    if (!organizationId) {
      setState({ lifetimeRevenue: 0, totalOrders: 0, byProduct: new Map(), monthly: [], loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    void (async () => {
      if (athleteId) {
        try {
          const period = lastMonths(12, "UTC");
          const report = await fetchRevenue(
            { athleteId, organizationId, viewingAs: false },
            period,
          );
          if (report) {
            if (cancelled) return;
            const toNum = (m: { amountMinor: number } | null | undefined) => (m ? m.amountMinor / 100 : 0);
            setState({
              lifetimeRevenue: report.attributable ? toNum(report.lifetime?.gross) : 0,
              totalOrders: report.attributable ? (report.lifetime?.orders ?? 0) : 0,
              // Shopify lines carry no product_id, so per-product revenue by id is
              // empty either way; top sellers by title are on usePortalRevenue.
              byProduct: new Map(),
              monthly: monthlyRevenue(
                report.monthly.map((m) => ({ orderDate: `${m.month}-15T00:00:00Z`, lineTotal: toNum(m.gross) })),
              ),
              loading: false,
            });
            return;
          }
        } catch {
          // fall through to the direct read
        }
      }
      // Page through all line items attributed to this org.
      // Join orders to filter out test orders.
      const pageSize = 1000;
      let from = 0;
      let revenue = 0;
      const orderIds = new Set<string>();
      const byProduct = new Map<string, ProductSales>();
      const dated: Array<{ orderDate: string | null; lineTotal: number }> = [];

      while (true) {
        const { data, error } = await supabase
          .from("order_line_items")
          .select("order_id, product_id, quantity, line_total, orders!inner(id, is_test, order_date)")
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
          orders?: { order_date?: string | null } | Array<{ order_date?: string | null }> | null;
        }>) {
          const lt = Number(r.line_total ?? 0);
          revenue += lt;
          orderIds.add(r.order_id);
          const joined = Array.isArray(r.orders) ? r.orders[0] : r.orders;
          dated.push({ orderDate: joined?.order_date ?? null, lineTotal: lt });
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
        monthly: monthlyRevenue(dated),
        loading: false,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, athleteId]);

  return state;
}