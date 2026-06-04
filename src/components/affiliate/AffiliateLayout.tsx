import { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { LogOut } from "lucide-react";

const tabs = [
  { to: "/affiliate", label: "Overview", end: true },
  { to: "/affiliate/products", label: "Products" },
  { to: "/affiliate/sales", label: "Sales" },
  { to: "/affiliate/payouts", label: "Payouts" },
];

export default function AffiliateLayout({ children }: { children?: ReactNode }) {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wordmark size="sm" />
            <span className="text-xs uppercase tracking-label text-muted-foreground">Affiliate</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
        <nav className="max-w-6xl mx-auto px-6 flex gap-6 overflow-x-auto">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `py-3 text-sm font-medium uppercase tracking-label border-b-2 transition-colors ${
                  isActive ? "border-accent text-accent" : "border-transparent text-muted-foreground hover:text-foreground"
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">{children ?? <Outlet />}</main>
    </div>
  );
}