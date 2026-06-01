import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatData {
  activeProducts: number;
  totalOrders: number;
  lifetimeRevenue: number;
  unattributedRevenue: number;
  unattributedLineItems: number;
  openBulkOrders: number;
  overdueSubmitted: boolean;
}

export function StatCards() {
  const navigate = useNavigate();
  const [data, setData] = useState<StatData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const overdueCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [products, ordersCount, revenueRows, unattribRows, openBulk, overdue] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .in("status", ["published", "internal"]),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("is_test", false),
        supabase
          .from("order_line_items")
          .select("line_total"),
        supabase
          .from("order_line_items")
          .select("line_total", { count: "exact" })
          .is("attributed_org_id", null),
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
      const lifetime = (revenueRows.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.line_total ?? 0), 0,
      );
      const unattribRev = (unattribRows.data ?? []).reduce(
        (s: number, r: any) => s + Number(r.line_total ?? 0), 0,
      );
      setData({
        activeProducts: products.count ?? 0,
        totalOrders: ordersCount.count ?? 0,
        lifetimeRevenue: Math.round(lifetime * 100) / 100,
        unattributedRevenue: Math.round(unattribRev * 100) / 100,
        unattributedLineItems: unattribRows.count ?? 0,
        openBulkOrders: openBulk.count ?? 0,
        overdueSubmitted: (overdue.count ?? 0) > 0,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fmtMoney = (n?: number) =>
    n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const cards = [
    {
      label: "Lifetime Revenue",
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
  );
}
