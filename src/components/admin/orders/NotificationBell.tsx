import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NotifOrder {
  id: string;
  order_number: string | null;
  created_at: string;
  total_units: number;
  athlete: { full_name: string | null; first_name: string; last_name: string } | null;
  team: { name: string } | null;
}

const READ_KEY = "admin.orderNotificationsReadAt";

export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotifOrder[]>([]);
  const [readAt, setReadAt] = useState<number>(() => {
    const stored = localStorage.getItem(READ_KEY);
    return stored ? parseInt(stored, 10) : 0;
  });

  useEffect(() => {
    let cancelled = false;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    void supabase
      .from("bulk_order_requests")
      .select(
        `id, order_number, created_at, total_units,
         athlete:athletes!bulk_order_requests_athlete_id_fkey(full_name, first_name, last_name),
         team:teams!bulk_order_requests_team_id_fkey(name)`,
      )
      .eq("status", "submitted")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (cancelled) return;
        setItems((data ?? []) as unknown as NotifOrder[]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = items.filter((i) => +new Date(i.created_at) > readAt).length;

  const markRead = () => {
    const now = Date.now();
    setReadAt(now);
    localStorage.setItem(READ_KEY, String(now));
  };

  const labelFor = (n: NotifOrder) => {
    if (n.athlete) {
      return (
        n.athlete.full_name ||
        `${n.athlete.first_name} ${n.athlete.last_name}`.trim()
      );
    }
    return n.team?.name ?? "Client";
  };

  return (
    <DropdownMenu onOpenChange={(open) => open && markRead()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative text-muted-foreground hover:text-accent"
          aria-label="Order notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-dark" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 bg-card border-border">
        <div className="px-4 py-3 border-b border-border">
          <div className="ax-section-header">New Bulk Orders</div>
          <div className="text-xs text-muted-foreground mt-1">
            Submitted in the last 7 days
          </div>
        </div>
        <div className="max-h-80 overflow-auto divide-y divide-border">
          {items.length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No new orders.
            </div>
          )}
          {items.map((n) => {
            const isUnread = +new Date(n.created_at) > readAt;
            return (
              <button
                key={n.id}
                onClick={() => navigate(`/admin/orders/${n.id}`)}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-accent/5 transition-colors flex items-start gap-3",
                  isUnread && "bg-accent/[0.04]",
                )}
              >
                {isUnread && (
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{labelFor(n)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span className="font-mono">{n.order_number ?? "—"}</span>
                    <span>·</span>
                    <span>{n.total_units} units</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="border-t border-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs"
            onClick={() => navigate("/admin/orders")}
          >
            View all orders
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
