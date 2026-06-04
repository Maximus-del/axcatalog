import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const LINKS = [
  { to: "/portal/products", label: "Product Lineup" },
  { to: "/portal/analytics", label: "Analytics" },
  { to: "/portal/content", label: "Social Content" },
  { to: "/portal/drops", label: "Upcoming Drops" },
  { to: "/portal/era", label: "AR / Era" },
];

export function PortalSubNav() {
  const { search } = useLocation();
  return (
    <nav
      className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30"
      aria-label="Portal sections"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <ul className="flex gap-1 overflow-x-auto no-scrollbar -mb-px">
          {LINKS.map((l) => (
            <li key={l.to} className="flex-shrink-0">
              <NavLink
                to={{ pathname: l.to, search }}
                end
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center h-11 px-3 sm:px-4 text-xs sm:text-sm font-bold uppercase tracking-wider whitespace-nowrap border-b-2 transition-colors",
                    isActive
                      ? "border-accent text-accent"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}