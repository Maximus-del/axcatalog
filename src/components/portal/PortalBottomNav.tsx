// Mobile-first. Test at 375px before merging.
// The five primary sections, from the shared list in lib/portal/nav.ts.
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { isActive, labelFor, PRIMARY_NAV, toWithSearch } from "@/lib/portal/nav";
import { NAV_ICONS } from "@/components/portal/portal-nav-icons";
import { navForRole } from "@/lib/portal/roles";
import { usePortalData } from "@/components/portal/PortalDataContext";

export function PortalBottomNav() {
  const { portalRole } = usePortalData();
  const { pathname, search } = useLocation();

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-background/90 backdrop-blur-md border-t border-border pb-safe"
      aria-label="Primary"
    >
      <ul className="flex items-stretch justify-around">
        {navForRole(PRIMARY_NAV, portalRole).map((d) => {
          const Icon = NAV_ICONS[d.icon];
          const active = isActive(d, pathname);
          return (
            <li key={d.to} className="flex-1">
              <NavLink
                to={toWithSearch(d.to, search)}
                onClick={() => haptic.tap()}
                aria-label={labelFor(d, false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "pressable relative w-full h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              >
                {active && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-accent" aria-hidden />
                )}
                {Icon && (
                  <Icon
                    className={cn(
                      "h-[22px] w-[22px]",
                      active && "drop-shadow-[0_0_6px_hsl(var(--accent)/0.5)]",
                    )}
                  />
                )}
                <span className="leading-none">{labelFor(d, false)}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
