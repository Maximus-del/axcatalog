// Mobile-first. Test at 375px before merging.
//
// Portal-specific bottom nav. Most "destinations" on the portal home
// are sections within a single page, so we use anchor scrolls for
// in-page tabs and route to /portal for Home.

import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Home,
  ShoppingBag,
  Sparkles,
  User,
} from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/auth/AuthProvider";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

interface Slot {
  label: string;
  icon: typeof Home;
  /** Either an in-page section id or a route. */
  scrollTo?: string;
  to?: string;
}

const SLOTS: Slot[] = [
  { label: "Home", icon: Home, to: "/portal" },
  { label: "Products", icon: ShoppingBag, to: "/portal/products" },
  { label: "Sales", icon: BarChart3, to: "/portal/analytics" },
  { label: "Drops", icon: Sparkles, to: "/portal/drops" },
];

export function PortalBottomNav() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  function activate(slot: Slot) {
    haptic.tap();
    if (slot.to) {
      navigate(slot.to);
      return;
    }
    if (!slot.scrollTo) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    document
      .getElementById(slot.scrollTo)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-40 bg-background/85 backdrop-blur-md border-t border-border pb-safe"
        aria-label="Primary"
      >
        <ul className="flex items-stretch justify-around">
          {SLOTS.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.label} className="flex-1">
                <button
                  type="button"
                  onClick={() => activate(s)}
                  aria-label={s.label}
                  className={cn(
                    "pressable w-full h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="leading-none">{s.label}</span>
                </button>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                setProfileOpen(true);
              }}
              aria-label="Profile"
              className="pressable w-full h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground"
            >
              <User className="h-5 w-5" />
              <span className="leading-none">Profile</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
          <SheetHeader className="text-left">
            <SheetTitle>Profile</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-1">
            <div className="text-sm text-muted-foreground px-1">{user?.email}</div>
            <button
              type="button"
              onClick={() => {
                setProfileOpen(false);
                signOut();
              }}
              className="pressable w-full h-14 flex items-center gap-3 px-1 text-base text-destructive"
            >
              <LogOut className="h-5 w-5" />
              <span>Sign out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
