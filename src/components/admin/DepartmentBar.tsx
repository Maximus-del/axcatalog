// The strip that turns a department's tools into tabs.
//
// It renders above whatever page you are on, so a tool becomes a tab without
// its URL changing at all — /admin/designs is still /admin/designs, it just
// now sits under a Creative tab strip that shows you the other four. That is
// the whole trick: the consolidation is chrome, not a re-route, so nothing
// bookmarked or linked anywhere breaks.
import { Link, NavLink } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { activeToolFor, departmentFor } from "@/lib/admin-ia";
import { cn } from "@/lib/utils";

export function DepartmentBar({ pathname }: { pathname: string }) {
  const dept = departmentFor(pathname);
  if (!dept) return null;

  const active = activeToolFor(pathname);
  const DeptIcon = dept.icon;

  return (
    <div className="sticky top-16 z-20 bg-[hsl(var(--ax-canvas)/0.92)] backdrop-blur border-b border-[hsl(var(--ax-border))]">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-8">
        <div className="flex items-center gap-3 h-14">
          <Link
            to="/admin"
            className="shrink-0 flex items-center gap-1.5 text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))] transition-colors"
            aria-label="Back to the command center"
          >
            <ChevronLeft className="h-4 w-4" />
            <DeptIcon className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
            <span className="text-[13px] font-bold text-[hsl(var(--ax-ink))]">{dept.label}</span>
          </Link>

          <span className="h-4 w-px bg-[hsl(var(--ax-border))] shrink-0" />

          {/* Horizontal scroll rather than a wrap: a tab strip that reflows to
              two rows stops reading as one strip. */}
          <nav className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto scroll-touch">
            {dept.tools.map((tool) => {
              const on = active?.to === tool.to;
              return (
                <NavLink
                  key={tool.to}
                  to={tool.to}
                  title={tool.within ? `${tool.label}: ${tool.within.join(" · ")}` : tool.label}
                  className={cn(
                    "shrink-0 h-8 px-3 rounded-lg text-[13px] font-semibold transition-colors",
                    on
                      ? "bg-[hsl(var(--ax-accent)/0.14)] text-[hsl(var(--ax-accent))]"
                      : "text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] hover:bg-[hsl(var(--ax-line))]",
                  )}
                >
                  {tool.label}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* What lives inside the tab you are on. Naming the filters here is how
            you learn that Orders has statuses without having to click in. */}
        {active?.within && (
          <div className="pb-2.5 -mt-1.5 flex items-center gap-1.5 text-[11px] text-[hsl(var(--ax-faint))] overflow-x-auto scroll-touch">
            <span className="shrink-0 uppercase tracking-[0.1em] mr-0.5">Inside</span>
            {active.within.map((w) => (
              <span key={w} className="shrink-0 px-1.5 py-0.5 rounded bg-[hsl(var(--ax-line))] text-[hsl(var(--ax-secondary))]">
                {w}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
