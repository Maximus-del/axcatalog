// Mobile-first. Test at 375px before merging.
import { Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { AdminBottomNav } from "./AdminBottomNav";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/admin/orders/NotificationBell";

export default function AdminLayout() {
  const { user, signOut } = useAuth();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {/* Desktop/tablet sidebar — hidden on phones, replaced by bottom tabs */}
        <div className="hidden md:block">
          <AdminSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between px-4 border-b border-border bg-dark pt-safe">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hidden md:inline-flex text-muted-foreground hover:text-accent" />
              <span className="ax-label hidden sm:block">Admin</span>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <span className="text-xs text-muted-foreground hidden sm:block">{user?.email}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="hidden md:inline-flex text-muted-foreground hover:text-accent"
              >
                <LogOut className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </div>
          </header>
          {/* No overflow on main: let body scroll. The sticky bars and the
              left filter sidebar each manage their own scroll ancestors so
              wheel/keyboard/PageDown work everywhere on the page. */}
          <main className="flex-1 scroll-touch pb-bottom-nav md:pb-0 min-w-0">
            <Outlet />
          </main>
        </div>
        <AdminBottomNav />
      </div>
    </SidebarProvider>
  );
}
