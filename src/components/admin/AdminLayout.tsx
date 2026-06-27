import { Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { AdminBottomNav } from "./AdminBottomNav";
import { AdminTopBar } from "./AdminTopBar";
import { QuickActionsFab } from "./QuickActionsFab";

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="admin-os min-h-screen flex w-full bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))]">
      {/* Desktop sidebar */}
      <div className="hidden md:flex sticky top-0 h-screen">
        <AdminSidebar />
      </div>

      {/* Mobile off-canvas sidebar */}
      {mobileNavOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/30"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="md:hidden fixed top-0 left-0 z-50 h-full">
            <AdminSidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <AdminTopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 scroll-touch pb-bottom-nav md:pb-0 min-w-0">
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
      <AdminBottomNav />
      <QuickActionsFab />
    </div>
  );
}
