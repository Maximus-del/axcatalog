// The admin sidebar: a short pinned list, then collapsible groups.
//
// Groups remember whether you left them open, so folding is a one-time cost
// rather than a click you pay on every visit. On a first run only the group
// holding the current page is open.
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUPS, PINNED, activeGroupFor, isItemActive, type NavItem } from "@/lib/admin-nav";

const OPEN_KEY = "ax.admin.nav.open";

function readOpen(): Record<string, boolean> | null {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : null;
  } catch {
    return null;
  }
}

interface Props {
  onNavigate?: () => void;
}

export function AdminSidebar({ onNavigate }: Props) {
  const { pathname } = useLocation();
  const activeGroup = activeGroupFor(pathname);

  const [open, setOpen] = useState<Record<string, boolean>>(
    () => readOpen() ?? (activeGroup ? { [activeGroup]: true } : {}),
  );

  // Navigating into a collapsed group opens it — you should always be able to
  // see where you are without hunting.
  useEffect(() => {
    if (activeGroup && !open[activeGroup]) {
      setOpen((prev) => ({ ...prev, [activeGroup]: true }));
    }
  }, [activeGroup]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(open)); } catch { /* private mode */ }
  }, [open]);

  return (
    <aside className="h-full w-64 shrink-0 bg-[hsl(var(--ax-sidebar))] border-r border-[hsl(var(--ax-border))] flex flex-col">
      <div className="h-16 flex items-center px-5 border-b border-[hsl(var(--ax-border))]">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-[10px] bg-[hsl(var(--ax-accent))] text-white flex items-center justify-center font-bold">
            X
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold text-[hsl(var(--ax-ink))]">AthleteXclusive</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">OS</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4 scroll-touch">
        <ul className="space-y-0.5">
          {PINNED.map((it) => (
            <li key={it.to}>
              <Row item={it} pathname={pathname} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>

        <div className="pt-1 space-y-1">
          {GROUPS.map((g) => {
            const isOpen = !!open[g.label];
            const holdsActive = activeGroup === g.label;
            return (
              <div key={g.label}>
                <button
                  type="button"
                  onClick={() => setOpen((prev) => ({ ...prev, [g.label]: !prev[g.label] }))}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-1.5 px-3 h-7 rounded-lg text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-secondary))] hover:bg-[hsl(var(--ax-line))] transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 shrink-0 transition-transform",
                      isOpen ? "rotate-0" : "-rotate-90",
                    )}
                  />
                  <span>{g.label}</span>
                  {/* Collapsed but you're inside it — say so rather than hide it. */}
                  {holdsActive && !isOpen && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--ax-accent))]" />
                  )}
                </button>

                {isOpen && (
                  <ul className="space-y-0.5 mt-0.5">
                    {g.items.map((it) => (
                      <li key={it.to}>
                        <Row item={it} pathname={pathname} onNavigate={onNavigate} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}

function Row({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isItemActive(item.to, pathname, item.end);
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 h-9 px-3 rounded-[10px] text-[13px] font-medium transition-colors",
        active
          ? "bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
          : "text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] hover:bg-[hsl(var(--ax-line))]",
      )}
    >
      <Icon className={cn("h-[15px] w-[15px] shrink-0", active && "text-[hsl(var(--ax-accent))]")} />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}
