import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/admin/orders/StatusBadge";
import { DRAFT_STATUS, type BulkOrderStatus } from "@/lib/order-status";

interface RecentOrder {
  id: string;
  order_number: string | null;
  status: BulkOrderStatus;
  total_units: number;
  created_at: string;
  athlete: { full_name: string | null; first_name: string; last_name: string } | null;
  team: { name: string } | null;
}

export function RecentBulkOrders() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RecentOrder[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .from("bulk_order_requests")
      .select(
        `id, order_number, status, total_units, created_at,
         athlete:athletes!bulk_order_requests_athlete_id_fkey(full_name, first_name, last_name),
         team:teams!bulk_order_requests_team_id_fkey(name)`,
      )
      .neq("status", DRAFT_STATUS)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        if (cancelled) return;
        setItems((data ?? []) as unknown as RecentOrder[]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const labelFor = (o: RecentOrder) =>
    o.athlete
      ? o.athlete.full_name || `${o.athlete.first_name} ${o.athlete.last_name}`.trim()
      : (o.team?.name ?? "Unknown");

  return (
    <section className="ax-card p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 border-b border-border">
        <div className="ax-section-header">Recent Bulk Order Requests</div>
      </div>

      <div className="divide-y divide-border">
        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-5 py-3">
              <Skeleton className="h-10" />
            </div>
          ))}

        {!loading && items && items.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No pending bulk orders.
          </div>
        )}

        {!loading &&
          items?.map((o) => (
            <button
              key={o.id}
              onClick={() => navigate(`/admin/orders/${o.id}`)}
              className="w-full flex items-center gap-3 px-5 py-3 text-left ax-row-hover transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-accent">
                    {o.order_number ?? "—"}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="truncate">{labelFor(o)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {o.total_units} units · {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}
                </div>
              </div>
              <StatusBadge status={o.status} />
            </button>
          ))}
      </div>
    </section>
  );
}
