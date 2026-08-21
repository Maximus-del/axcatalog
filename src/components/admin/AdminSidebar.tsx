// A rail, not a menu.
//
// This used to be twenty-six labelled rows in collapsible groups — the entire
// navigation hierarchy, restated in full, next to a homepage that restated it
// again. Now the homepage is where you choose a department and the rail is how
// you switch between them once you are working: four departments, four
// utilities, no text unless you hover.
//
// The rule that keeps it honest: nothing goes in this rail that is a TOOL. If
// it is somewhere you work rather than somewhere you go, it is a tab inside a
// department, and it belongs to the department bar instead.
import { NavLink, useLocation } from "react-router-dom";
import { Home, Inbox, ListChecks, BarChart3, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEPARTMENTS, departmentFor, isItemActive } from "@/lib/admin-ia";

interface Props {
  onNavigate?: () => void;
}

interface RailItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  /** Set when this icon stands for a whole department. */
  deptKey?: string;
}

const TOP: RailItem[] = [
  { label: "Command center", to: "/admin", icon: Home, end: true },
];

const UTILITIES: RailItem[] = [
  { label: "Inbox", to: "/admin/inbox", icon: Inbox },
  { label: "Tasks", to: "/admin/tasks", icon: ListChecks },
  { label: "Analytics", to: "/admin/analytics", icon: BarChart3 },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

export function AdminSidebar({ onNavigate }: Props) {
  const { pathname } = useLocation();
  const dept = departmentFor(pathname);

  const departments: RailItem[] = DEPARTMENTS.map((d) => ({
    label: d.label,
    to: d.home,
    icon: d.icon,
    deptKey: d.key,
  }));

  return (
    <aside className="h-full w-[68px] shrink-0 bg-[hsl(var(--ax-sidebar))] border-r border-[hsl(var(--ax-border))] flex flex-col items-center">
      <NavLink
        to="/admin"
        onClick={onNavigate}
        className="h-16 flex items-center justify-center shrink-0"
        aria-label="AthleteXclusive"
      >
        <span className="h-9 w-9 rounded-[11px] bg-[hsl(var(--ax-accent))] text-white flex items-center justify-center font-bold text-[15px]">
          AX
        </span>
      </NavLink>

      <nav className="flex-1 w-full flex flex-col items-center gap-1 pt-2 overflow-y-auto scroll-touch">
        {TOP.map((it) => (
          <Rail key={it.to} item={it} pathname={pathname} deptKey={dept?.key} onNavigate={onNavigate} />
        ))}

        <span className="my-2 h-px w-8 bg-[hsl(var(--ax-border))]" />

        {departments.map((it) => (
          <Rail key={it.to} item={it} pathname={pathname} deptKey={dept?.key} onNavigate={onNavigate} />
        ))}

        <span className="my-2 h-px w-8 bg-[hsl(var(--ax-border))]" />

        {UTILITIES.map((it) => (
          <Rail key={it.to} item={it} pathname={pathname} deptKey={dept?.key} onNavigate={onNavigate} />
        ))}
      </nav>
    </aside>
  );
}

function Rail({
  item, pathname, deptKey, onNavigate,
}: {
  item: RailItem;
  pathname: string;
  deptKey?: string;
  onNavigate?: () => void;
}) {
  // A department icon stays lit anywhere inside that department, not only on
  // the one page it links to — otherwise the rail goes dark the moment you
  // move to a second tab and you lose your sense of place.
  const active = item.deptKey
    ? deptKey === item.deptKey
    : isItemActive(item.to, pathname, item.end);

  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={item.label}
      aria-label={item.label}
      className={cn(
        "group relative h-11 w-11 rounded-[12px] flex items-center justify-center transition-colors",
        active
          ? "bg-[hsl(var(--ax-accent)/0.14)] text-[hsl(var(--ax-accent))]"
          : "text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))] hover:bg-[hsl(var(--ax-line))]",
      )}
    >
      {/* The lit pill alone reads as hover on a dark ground; the marker on the
          rail edge is what actually says "you are here". */}
      {active && (
        <span className="absolute left-[-10px] h-5 w-[3px] rounded-r bg-[hsl(var(--ax-accent))]" />
      )}
      <Icon className="h-[18px] w-[18px]" />

      <span
        role="tooltip"
        className="pointer-events-none absolute left-[54px] z-50 whitespace-nowrap rounded-md bg-[hsl(var(--ax-card))] border border-[hsl(var(--ax-border))] px-2 py-1 text-[12px] font-medium text-[hsl(var(--ax-ink))] opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {item.label}
      </span>
    </NavLink>
  );
}
