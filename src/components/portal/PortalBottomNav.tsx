// Mobile-first. Test at 375px before merging.
// Primary bottom navigation — five sections (section 3):
// Home · Products · Studio · Content · Profile.
import { NavLink, useLocation } from "react-router-dom";
import { Home, ShoppingBag, Wand2, LayoutGrid, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

interface Slot {
  label: string;
  icon: LucideIcon;
  to: string;
  /** Exact-match only (Home). */
  end?: boolean;
}

const SLOTS: Slot[] = [
  { label: "Home", icon: Home, to: "/portal", end: true },
  { label: "Products", icon: ShoppingBag, to: "/portal/products" },
  { label: "Studio", icon: Wand2, to: "/portal/studio" },
  { label: "Content", icon: LayoutGrid, to: "/portal/content" },
  { label: "Profile", icon: User, to: "/portal/profile" },
];

export function PortalBottomNav() {
  const { pathname, search } = useLocation();

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
                to={{ pathname: s.to, search }}
                onClick={() => haptic.tap()}
                aria-label={s.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "pressable relative w-full h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              >
                {active && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" aria-hidden />
                )}
                <Icon className={cn("h-[22px] w-[22px]", active && "drop-shadow-[0_0_6px_hsl(var(--accent)/0.5)]")} />
                <span className="leading-none">{s.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
