import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { Package, Palette, ShoppingCart, Download } from "lucide-react";
import { cn } from "@/lib/utils";

type ActivityKind = "product" | "design" | "bulk_order" | "ingestion";

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  description: string;
  createdAt: string;
  route: string;
}

const ICONS: Record<ActivityKind, typeof Package> = {
  product: Package,
  design: Palette,
  bulk_order: ShoppingCart,
  ingestion: Download,
};

function truncate(s: string, n = 40) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export function RecentActivity() {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [products, designs, orders, ingestion] = await Promise.all([
        supabase
          .from("products")
          .select("id, title, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("designs")
          .select("id, title, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("bulk_order_requests")
          .select("id, created_at, athlete_id, athletes:athlete_id(full_name, first_name, last_name)")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("ingestion_jobs")
          .select("id, source_url, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (cancelled) return;

      const merged: ActivityItem[] = [];

      (products.data ?? []).forEach((p) =>
        merged.push({
          id: `p-${p.id}`,
          kind: "product",
          title: p.title,
          description: `New product: ${p.title}`,
          createdAt: p.created_at,
          route: `/admin/products/${p.id}`,
        }),
      );
      (designs.data ?? []).forEach((d) =>
        merged.push({
          id: `d-${d.id}`,
          kind: "design",
          title: d.title,
          description: `Design created: ${d.title}`,
          createdAt: d.created_at,
          route: `/admin/designs/${d.id}`,
        }),
      );
      (orders.data ?? []).forEach((o) => {
        const athlete = o.athletes as
          | { full_name: string | null; first_name: string | null; last_name: string | null }
          | null;
        const name = athlete
          ? athlete.full_name || `${athlete.first_name ?? ""} ${athlete.last_name ?? ""}`.trim()
          : "unknown";
        merged.push({
          id: `o-${o.id}`,
          kind: "bulk_order",
          title: name,
          description: `Bulk order from ${name}`,
          createdAt: o.created_at,
          route: `/admin/orders/${o.id}`,
        });
      });
      (ingestion.data ?? []).forEach((j) =>
        merged.push({
          id: `i-${j.id}`,
          kind: "ingestion",
          title: j.source_url,
          description: `URL ingestion queued: ${truncate(j.source_url, 50)}`,
          createdAt: j.created_at,
          route: `/admin/ingestion/${j.id}`,
        }),
      );

      merged.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      setItems(merged.slice(0, 10));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="ax-card p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border">
        <div className="ax-section-header">Recent Activity</div>
      </div>

      <div className="divide-y divide-border">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <Skeleton className="h-8 w-8 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}

        {!loading && items && items.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No activity yet — start by adding a product or design.
          </div>
        )}

        {!loading &&
          items?.map((item) => {
            const Icon = ICONS[item.kind];
            return (
              <button
                key={item.id}
                onClick={() => {
                  // Detail pages don't exist yet — log intended route.
                  // eslint-disable-next-line no-console
                  console.log("Navigate to:", item.route);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-5 py-3 text-left ax-row-hover transition-colors",
                )}
              >
                <div className="flex items-center justify-center h-8 w-8 rounded-md bg-muted shrink-0">
                  <Icon className="h-4 w-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{item.description}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </section>
  );
}
