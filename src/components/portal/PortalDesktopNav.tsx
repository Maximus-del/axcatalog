// A persistent horizontal nav for md+ — the thing the portal did not have.
//
// The bottom bar is `md:hidden` and the drawer opens from a hamburger, so a
// desktop client saw a header, a menu button and a page, with no indication of
// where else they could go. Every destination is here because desktop has the
// room; the mobile bar keeps its five.
//
// Horizontal rather than a sidebar on purpose: pages centre their own
// max-widths, and a left rail would have meant re-laying out all fourteen.
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { isActive, labelFor, PORTAL_NAV, toWithSearch } from "@/lib/portal/nav";
import { NAV_ICONS } from "@/components/portal/portal-nav-icons";

export function PortalDesktopNav() {
  const { pathname, search } = useLocation();

  return (
    <nav
      className="hidden md:block sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md"
      aria-label="Sections"
    >
      <ul className="max-w-[1200px] mx-auto px-4 sm:px-6 flex items-stretch gap-1 overflow-x-auto scroll-touch">
        {PORTAL_NAV.map((d) => {
          const Icon = NAV_ICONS[d.icon];
          const active = isActive(d, pathname);
          return (
            <li key={d.to} className="shrink-0">
              <NavLink
                to={toWithSearch(d.to, search)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative h-12 px-3 inline-flex items-center gap-2 text-[13px] font-semibold transition-colors border-b-2 -mb-px",
                  active
                    ? "text-accent border-accent"
                    : "text-muted-foreground border-transparent hover:text-foreground",
                )}
              >
                {Icon && <Icon className="h-4 w-4" />}
                {labelFor(d, true)}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
