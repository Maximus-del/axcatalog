import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, Users, Palette, ShoppingBag, Receipt, ArrowUpRight } from "lucide-react";

// AX OS V2 shell.
//
// Deliberately five destinations: Overview, People, Creative, Commerce, Orders.
// V1's sidebar carries ~30. Anything not on this list has not earned a place
// yet — see AX_LEGACY_FEATURE_MAP.md for what is parked and why.
//
// Reuses the existing `.admin-os` token block so V2 inherits the established
// dark operator language without a single new CSS variable.

const NAV = [
  { to: "/admin-v2", end: true, label: "Overview", icon: Home },
  { to: "/admin-v2/people", end: false, label: "People", icon: Users },
  { to: "/admin-v2/creative", end: false, label: "Creative", icon: Palette },
  { to: "/admin-v2/commerce", end: false, label: "Commerce", icon: ShoppingBag },
  { to: "/admin-v2/orders", end: false, label: "Orders", icon: Receipt },
];

export default function V2Layout() {
  const location = useLocation();

  return (
    <div className="admin-os min-h-screen w-full bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))]">
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--ax-line))] bg-[hsl(var(--ax-sidebar))]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          <NavLink to="/admin-v2" className="flex shrink-0 items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight">AX OS</span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest"
              style={{ background: "hsl(var(--ax-accent) / 0.14)", color: "hsl(var(--ax-accent))" }}
            >
              V2
            </span>
          </NavLink>

          <nav className="ml-2 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scroll-touch">
            {NAV.map(({ to, end, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-[hsl(var(--ax-accent)/0.14)] text-[hsl(var(--ax-accent))]"
                      : "text-[hsl(var(--ax-secondary))] hover:bg-white/5 hover:text-[hsl(var(--ax-ink))]",
                  ].join(" ")
                }
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <a
            href="/admin"
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] sm:flex"
            title="V1 stays available for everything V2 has not migrated"
          >
            V1 dashboard
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      <main key={location.pathname} className="animate-fade-in mx-auto max-w-[1400px] px-4 pb-24 pt-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
