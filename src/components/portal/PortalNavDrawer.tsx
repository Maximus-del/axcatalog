import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { isActive, labelFor, PORTAL_NAV, toWithSearch } from "@/lib/portal/nav";
import { NAV_ICONS } from "@/components/portal/portal-nav-icons";

interface Props {
  open: boolean;
  onClose: () => void;
}


export function PortalNavDrawer({ open, onClose }: Props) {
  const { pathname, search } = useLocation();

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />
      {/* Drawer */}
      <aside
        aria-hidden={!open}
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-72 max-w-[80%] bg-[hsl(var(--dark))] border-r border-border shadow-2xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="p-6">
          <div className="ax-label mb-6">Navigate</div>
          <nav className="flex flex-col gap-1">
            {PORTAL_NAV.map((l) => {
              const Icon = NAV_ICONS[l.icon];
              const active = isActive(l, pathname);
              return (
                <NavLink
                  key={l.to}
                  to={toWithSearch(l.to, search)}
                  end={l.end}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-md text-base transition-colors",
                    active
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-foreground hover:bg-accent/10 hover:text-accent",
                  )}
                >
                  {Icon && <Icon className="h-5 w-5" aria-hidden />}
                  <span>{labelFor(l, true)}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
}
