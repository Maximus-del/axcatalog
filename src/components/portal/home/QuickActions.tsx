// Mobile-first. Four quick actions under the credit card.
import { ShoppingBag, Shirt, Ticket, Sparkles, type LucideIcon } from "lucide-react";
import { QUICK_ACTIONS, type QuickAction } from "@/lib/portal-config";
import { usePortalActions } from "@/components/portal/usePortalActions";
import { haptic } from "@/lib/haptics";

const ICONS: Record<QuickAction["key"], LucideIcon> = {
  shop: ShoppingBag,
  order_gear: Shirt,
  get_code: Ticket,
  start_design: Sparkles,
};

export function QuickActions() {
  const run = usePortalActions();
  return (
    <div className="grid grid-cols-4 gap-2.5">
      {QUICK_ACTIONS.map((a) => {
        const Icon = ICONS[a.key];
        return (
          <button
            key={a.key}
            onClick={() => {
              haptic.tap();
              run(a.action);
            }}
            className="pressable flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card py-4 px-1 hover:border-accent/40 transition-colors"
          >
            <span className="h-10 w-10 rounded-xl bg-accent/12 flex items-center justify-center">
              <Icon className="h-5 w-5 text-accent" />
            </span>
            <span className="text-[11px] font-semibold text-foreground text-center leading-tight">
              {a.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
