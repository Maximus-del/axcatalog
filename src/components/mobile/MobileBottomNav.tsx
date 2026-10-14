// Mobile-first. Test at 375px before merging.
//
// iOS-style fixed bottom tab bar shown only on phone widths (<768px).
// One slot is always "More" — opening a slide-up sheet for less-used
// destinations (Settings, Logout, etc).

import { useState, type ComponentType } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LogOut, MoreHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

export interface BottomNavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** When true, only exact match counts as active (use for home routes). */
  end?: boolean;
}

interface Props {
  primary: BottomNavItem[]; // 4 items shown directly
  more: BottomNavItem[]; // shown inside the "More" sheet
}

export function MobileBottomNav({ primary, more }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  function isActive(item: BottomNavItem): boolean {
    if (item.end) return location.pathname === item.to;
    return location.pathname.startsWith(item.to);
  }

  function go(item: BottomNavItem) {
    haptic.tap();
    navigate(item.to);
  }

  return (
    <>
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-background/85 backdrop-blur-md border-t border-border pb-safe"
        aria-label="Primary"
      >
        <ul className="flex items-stretch justify-around">
          {primary.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex-1">
                <button
                  type="button"
                  onClick={() => go(item)}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "pressable w-full h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                    active ? "text-accent" : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="leading-none">{item.label}</span>
                </button>
              </li>
            );
          })}
          {more.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => {
                  haptic.tap();
                  setMoreOpen(true);
                }}
                aria-label="More"
                className="pressable w-full h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
              >
                <MoreHorizontal className="h-5 w-5" />
                <span className="leading-none">More</span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          {/* Drag handle */}
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
          <SheetHeader className="text-left">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          {/* The list grew past a phone screen once the admin sheet covered
              everything the sidebar does — cap it and let it scroll. */}
          <ul className="mt-4 divide-y divide-border max-h-[60vh] overflow-y-auto scroll-touch">
            {more.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <button
                    type="button"
                    onClick={() => {
                      setMoreOpen(false);
                      go(item);
                    }}
                    className="pressable w-full h-14 flex items-center gap-3 px-1 text-base text-foreground"
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  signOut();
                }}
                className="pressable w-full h-14 flex items-center gap-3 px-1 text-base text-destructive"
              >
                <LogOut className="h-5 w-5" />
                <span>Sign out</span>
              </button>
            </li>
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
