import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PortalOrder } from "@/hooks/usePortalOrders";

const PAGE_SIZE = 5;

const STATUS_COLORS: Record<PortalOrder["status"], string> = {
  submitted: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  acknowledged: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  in_production: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  ready: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  shipped: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  completed: "bg-accent/15 text-accent border-accent/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

interface Props {
  orders: PortalOrder[];
  loading: boolean;
}

export function AnalyticsRecentOrders({ orders, loading }: Props) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const paged = orders.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) {
    return (
      <div className="ax-card p-4 space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-md" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="ax-card p-12 text-center">
        <p className="text-sm text-muted-foreground">
          You haven't submitted any orders yet. Use the Bulk Order Sheet to request merch.
        </p>
      </div>
    );
  }

  return (
    <div className="ax-card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--dark))] border-b border-border">
          <tr>
            <th className="text-left px-4 py-3 ax-label">Order #</th>
            <th className="text-left px-4 py-3 ax-label">Date</th>
            <th className="text-right px-4 py-3 ax-label">Units</th>
            <th className="text-left px-4 py-3 ax-label">Status</th>
          </tr>
        </thead>
        <tbody>
          {paged.map((o) => (
            <tr key={o.id} className="border-b border-border/60 last:border-0 hover:bg-accent/5">
              <td className="px-4 py-3 font-mono text-xs">{o.order_number ?? "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {format(new Date(o.created_at), "MMM d, yyyy")}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{o.total_units}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
                    STATUS_COLORS[o.status],
                  )}
                >
                  {o.status.replace(/_/g, " ")}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-[hsl(var(--dark))]">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="h-7 text-xs"
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="h-7 text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
