// Mobile-first premium bottom nav: Home · Discover · Access · Shop · You.
import { NavLink, useLocation } from "react-router-dom";
import { Home, Compass, Sparkles, ShoppingBag, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Slot {
  label: string;
  icon: LucideIcon;
  to: string;
  end?: boolean;
}

const SLOTS: Slot[] = [
  { label: "Home", icon: Home, to: "/feed", end: true },
  { label: "Discover", icon: Compass, to: "/feed/discover" },
  { label: "Access", icon: Sparkles, to: "/feed/access" },
  { label: "Shop", icon: ShoppingBag, to: "/feed/shop" },
  { label: "You", icon: User, to: "/feed/profile" },
];

export function FanBottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-background/90 backdrop-blur-md border-t border-border pb-safe"
      aria-label="Primary"
    >
      <ul className="flex items-stretch justify-around">
        {SLOTS.map((s) => {
          const Icon = s.icon;
          const active = s.end ? pathname === s.to : pathname.startsWith(s.to);
          return (
            <li key={s.label} className="flex-1">
              <NavLink
                to={s.to}
                aria-label={s.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative w-full h-16 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              >
                {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" aria-hidden />}
                <Icon className={cn("h-[21px] w-[21px]", active && "drop-shadow-[0_0_6px_hsl(var(--accent)/0.5)]")} />
                <span className="leading-none">{s.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
