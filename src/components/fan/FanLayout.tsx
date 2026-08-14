// Mobile-first shell for Goat Farm Access (the fan experience).
import { Outlet, Link, useLocation } from "react-router-dom";
import { Compass, Star, User } from "lucide-react";
import { FanBottomNav } from "./FanBottomNav";
import { cn } from "@/lib/utils";

const DESKTOP_LINKS = [
  { to: "/feed/discover", label: "Discover", icon: Compass },
  { to: "/feed/following", label: "Following", icon: Star },
  { to: "/feed/profile", label: "You", icon: User },
];

export default function FanLayout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth">
      <header className="sticky top-0 z-40 bg-[hsl(var(--dark))]/95 backdrop-blur-md border-b border-border">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/feed" className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center text-accent-foreground font-black text-sm">
              G
            </span>
            <span className="font-black tracking-tight text-[15px]">
              GOAT FARM <span className="text-accent">ACCESS</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {DESKTOP_LINKS.map((l) => {
              const Icon = l.icon;
              const active = pathname.startsWith(l.to);
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={cn(
                    "flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold transition-colors",
                    active ? "text-accent bg-accent/10" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-5 pb-24 md:pb-10">
        <Outlet />
      </main>

      <FanBottomNav />
    </div>
  );
}
