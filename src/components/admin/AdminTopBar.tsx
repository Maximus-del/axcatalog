import { useEffect, useRef, useState } from "react";
import { Search, Plus, LogOut, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/admin/orders/NotificationBell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface Props {
  onOpenMobileNav: () => void;
}

const NEW_ACTIONS = [
  { label: "Product", to: "/admin/products" },
  { label: "Design", to: "/admin/designs" },
  { label: "Athlete", to: "/admin/athletes" },
  { label: "Order", to: "/admin/orders" },
];

export function AdminTopBar({ onOpenMobileNav }: Props) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const initial = (user?.email?.[0] ?? "A").toUpperCase();

  return (
    <header className="h-16 flex items-center gap-3 px-4 md:px-6 border-b border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-canvas))] sticky top-0 z-30 pt-safe">
      <button
        onClick={onOpenMobileNav}
        className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-[11px] border border-[hsl(var(--ax-border))] bg-white"
        aria-label="Open navigation"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="flex-1 max-w-xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--ax-faint))]" />
        <input
          ref={searchRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products, athletes, orders…"
          className="w-full h-10 pl-9 pr-12 rounded-[11px] border border-[hsl(var(--ax-border))] bg-white text-[hsl(var(--ax-ink))] text-sm placeholder:text-[hsl(var(--ax-faint))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ax-accent)/0.25)] focus:border-[hsl(var(--ax-accent))]"
        />
        <kbd className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 h-5 px-1.5 items-center rounded-md border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-line))] text-[10px] text-[hsl(var(--ax-secondary))] font-medium">/</kbd>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="h-10 px-4 rounded-[11px] bg-[hsl(var(--ax-accent))] hover:bg-[hsl(var(--ax-accent)/0.92)] text-white font-semibold gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {NEW_ACTIONS.map((a) => (
            <DropdownMenuItem key={a.label} onClick={() => navigate(a.to)}>
              New {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <NotificationBell />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="h-10 w-10 rounded-full bg-[hsl(var(--ax-accent))] text-white font-semibold flex items-center justify-center hover:opacity-90"
            aria-label="Account"
          >
            {initial}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5 text-xs text-muted-foreground truncate">{user?.email}</div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate("/admin/settings")}>Settings</DropdownMenuItem>
          <DropdownMenuItem onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
