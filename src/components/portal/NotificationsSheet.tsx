// Mobile-first. Notifications — derived from real signals (unread requests,
// credit available, active orders, weekly codes) and deep-linked.
// BACKEND: a real notifications table can replace these derivations later.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, MessageSquare, Wallet, Truck, Ticket, Sparkles, type LucideIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { useAthleteCredit } from "@/hooks/useAthleteCredit";
import { fmtUsd } from "@/lib/portal-config";
import { threadTimeAgo, type PortalThread } from "@/lib/portal-messaging";

interface Notif {
  id: string;
  icon: LucideIcon;
  title: string;
  sub: string;
  to: string;
}

const ACTIVE_ORDER = new Set(["submitted", "acknowledged", "in_production", "ready", "shipped"]);
const ORDER_STATUS_LABEL: Record<string, string> = {
  submitted: "submitted",
  acknowledged: "acknowledged",
  in_production: "in production",
  ready: "ready",
  shipped: "shipped",
};

export function NotificationsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { athlete, orders } = usePortalData();
  const { wallet } = useAthleteCredit(athlete.id);
  const [unreadThreads, setUnreadThreads] = useState<PortalThread[]>([]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const { data } = await supabase
        .from("portal_threads")
        .select("*")
        .eq("athlete_id", athlete.id)
        .eq("portal_unread", true)
        .order("last_message_at", { ascending: false })
        .limit(10);
      setUnreadThreads((data ?? []) as PortalThread[]);
    })();
  }, [open, athlete.id]);

  const notifs: Notif[] = [];
  for (const t of unreadThreads) {
    notifs.push({
      id: `thread-${t.id}`,
      icon: MessageSquare,
      title: "AX replied to your request",
      sub: `${t.subject} · ${threadTimeAgo(t.last_message_at)}`,
      to: "/portal/messages",
    });
  }
  if (wallet && wallet.balance > 0) {
    notifs.push({
      id: "credit",
      icon: Wallet,
      title: `You have ${fmtUsd(wallet.balance, { cents: true })} in AX Credit`,
      sub: "Apply it to your next order",
      to: "/portal",
    });
  }
  const activeOrder = orders.find((o) => ACTIVE_ORDER.has(o.status));
  if (activeOrder) {
    notifs.push({
      id: `order-${activeOrder.id}`,
      icon: Truck,
      title: `Order ${activeOrder.order_number ?? ""} is ${ORDER_STATUS_LABEL[activeOrder.status] ?? activeOrder.status}`,
      sub: `${activeOrder.total_units} units`,
      to: "/portal/profile",
    });
  }
  notifs.push({
    id: "codes",
    icon: Ticket,
    title: "Your weekly codes are ready",
    sub: "Share them with your fans",
    to: "/portal/profile",
  });

  function open_(to: string) {
    onOpenChange(false);
    navigate({ pathname: to, search: window.location.search });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[80vh] overflow-y-auto">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-accent" /> Notifications
          </SheetTitle>
        </SheetHeader>

        {notifs.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-accent/12 flex items-center justify-center mb-3">
              <Sparkles className="h-5 w-5 text-accent" />
            </div>
            <p className="text-sm text-muted-foreground">You're all caught up.</p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2 pb-4">
            {notifs.map((n) => {
              const Icon = n.icon;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => open_(n.to)}
                    className="w-full text-left flex items-start gap-3 rounded-xl border border-border bg-card p-3 hover:border-accent/40 transition-colors"
                  >
                    <span className="h-9 w-9 rounded-lg bg-accent/12 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-accent" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{n.title}</div>
                      <div className="text-[12px] text-muted-foreground truncate">{n.sub}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
