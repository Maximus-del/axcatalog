import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

interface StatData {
  activeProducts: number;
  totalOrders: number;
  lifetimeRevenue: number;
  unattributedRevenue: number;
  unattributedLineItems: number;
  openBulkOrders: number;
  overdueSubmitted: boolean;
  orgBreakdown: Array<{ org_id: string; name: string; revenue: number; line_items: number }>;
}

export function StatCards() {
  const navigate = useNavigate();
  const [data, setData] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeTest, setIncludeTest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const overdueCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Page through line items (joined to orders for is_test filter).
      const pageSize = 1000;
      let revenue = 0;
      let unattribRevenue = 0;
      let unattribCount = 0;
      const attributedOrderIds = new Set<string>();
      const orgAgg = new Map<string, { revenue: number; line_items: number }>();
      let from = 0;
      while (true) {
        let q = supabase
          .from("order_line_items")
          .select("order_id, attributed_org_id, line_total, orders!inner(id, is_test)")
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);
        if (!includeTest) q = q.eq("orders.is_test", false);
        const { data: page, error } = await q;
        if (error || !page) break;
        for (const r of page as Array<{
          order_id: string;
          attributed_org_id: string | null;
          line_total: number | null;
        }>) {
          const lt = Number(r.line_total ?? 0);
          if (r.attributed_org_id) {
            revenue += lt;
            attributedOrderIds.add(r.order_id);
            const cur = orgAgg.get(r.attributed_org_id) ?? { revenue: 0, line_items: 0 };
            cur.revenue += lt;
            cur.line_items += 1;
            orgAgg.set(r.attributed_org_id, cur);
          } else {
            unattribRevenue += lt;
            unattribCount += 1;
          }
        }
        if (page.length < pageSize) break;
        from += pageSize;
      }

      const orgIds = [...orgAgg.keys()];
      const namesById = new Map<string, string>();
      if (orgIds.length) {
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id, name")
          .in("id", orgIds);
        for (const o of orgs ?? []) namesById.set(o.id, o.name);
      }
      const orgBreakdown = [...orgAgg.entries()]
        .map(([org_id, v]) => ({
          org_id,
          name: namesById.get(org_id) ?? org_id,
          revenue: Math.round(v.revenue * 100) / 100,
          line_items: v.line_items,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      const [products, openBulk, overdue] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .in("status", ["published", "internal"]),
        supabase
          .from("bulk_order_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "acknowledged", "in_production"]),
        supabase
          .from("bulk_order_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted")
          .lt("created_at", overdueCutoff),
      ]);
      if (cancelled) return;
      setData({
        activeProducts: products.count ?? 0,
        totalOrders: attributedOrderIds.size,
        lifetimeRevenue: Math.round(revenue * 100) / 100,
        unattributedRevenue: Math.round(unattribRevenue * 100) / 100,
        unattributedLineItems: unattribCount,
        openBulkOrders: openBulk.count ?? 0,
        overdueSubmitted: (overdue.count ?? 0) > 0,
        orgBreakdown,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [includeTest]);

  const fmtMoney = (n?: number) =>
    n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const cards = [
    {
      label: "Attributed Revenue",
      value: fmtMoney(data?.lifetimeRevenue),
      accent: true,
    },
    {
      label: "Total Orders",
      value: data?.totalOrders?.toLocaleString(),
      onClick: () => navigate("/admin/orders"),
    },
    {
      label: "Products Live",
      value: data?.activeProducts?.toLocaleString(),
      onClick: () => navigate("/admin/products"),
    },
    {
      label: "Unattributed",
      value: fmtMoney(data?.unattributedRevenue),
      sub: data?.unattributedLineItems
        ? `${data.unattributedLineItems} line items`
        : "All attributed",
      onClick: () => navigate("/admin/imports/orders"),
      alert: (data?.unattributedLineItems ?? 0) > 0,
    },
    {
      label: "Open Bulk Orders",
      value: data?.openBulkOrders?.toLocaleString(),
      onClick: () => navigate("/admin/orders?tab=open"),
      alert: data?.overdueSubmitted,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <label htmlFor="include-test" className="cursor-pointer">Include test orders</label>
        <Switch id="include-test" checked={includeTest} onCheckedChange={setIncludeTest} />
      </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((c) => {
        const clickable = !!c.onClick;
        return (
          <div
            key={c.label}
            onClick={c.onClick}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={(e) => {
              if (clickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                c.onClick?.();
              }
            }}
            className={cn(
              "ax-card relative",
              clickable && "cursor-pointer hover:border-accent hover:-translate-y-0.5",
            )}
          >
            {c.alert && (
              <span className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card animate-pulse" />
            )}
            <div className="ax-label mb-3">{c.label}</div>
            {loading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <>
                <div className={cn("ax-stat", c.accent && "text-accent")}>{c.value ?? "—"}</div>
                {(c as any).sub && (
                  <div className="text-[11px] text-muted-foreground mt-1">{(c as any).sub}</div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>

    </div>
  );
}
