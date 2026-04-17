import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatData {
  activeProducts: number;
  activeDesigns: number;
  openBulkOrders: number;
  pendingIngestion: number;
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
      const [products, designs, orders, ingestion, overdue] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact", head: true })
          .in("status", ["published", "internal"]),
        supabase
          .from("designs")
          .select("id", { count: "exact", head: true })
          .in("status", ["approved", "production_ready"]),
        supabase
          .from("bulk_order_requests")
          .select("id", { count: "exact", head: true })
          .in("status", ["submitted", "acknowledged", "in_production"]),
        supabase
          .from("ingestion_jobs")
          .select("id", { count: "exact", head: true })
          .in("status", ["pending", "processing", "review"]),
        supabase
          .from("bulk_order_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted")
          .lt("created_at", overdueCutoff),
      ]);
      if (cancelled) return;
      setData({
        activeProducts: products.count ?? 0,
        activeDesigns: designs.count ?? 0,
        openBulkOrders: orders.count ?? 0,
        pendingIngestion: ingestion.count ?? 0,
        overdueSubmitted: (overdue.count ?? 0) > 0,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    { label: "Active Products", value: data?.activeProducts, accent: true },
    { label: "Active Designs", value: data?.activeDesigns },
    {
      label: "Open Bulk Orders",
      value: data?.openBulkOrders,
      onClick: () => navigate("/admin/orders?tab=open"),
      alert: data?.overdueSubmitted,
    },
    {
      label: "Pending Ingestion",
      value: data?.pendingIngestion,
      onClick: () => navigate("/admin/ingestion"),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div className={cn("ax-stat", c.accent && "text-accent")}>{c.value}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
