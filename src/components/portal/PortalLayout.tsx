// Mobile-first. Test at 375px before merging.
import { useCallback, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/AuthProvider";
import { useCurrentAthlete } from "@/hooks/useCurrentAthlete";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { ImpersonationGuardModal } from "./ImpersonationGuardModal";
import { PortalNavDrawer } from "./PortalNavDrawer";
import { AthleteHeader } from "./home/AthleteHeader";
import { NotificationsSheet } from "./NotificationsSheet";
import { BulkOrderSheet } from "./BulkOrderSheet";
import { OrderDraftBar } from "./OrderDraftBar";
import { OrderDraftProvider } from "./OrderDraftContext";
import { PortalBottomNav } from "./PortalBottomNav";
import { PortalDataProvider, usePortalData } from "./PortalDataContext";

function BulkOrderSheetBridge({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { athlete, isImpersonating, products, refetchOrders, openGuard } = usePortalData();
  return (
    <BulkOrderSheet
      open={open}
      onOpenChange={onOpenChange}
      products={products}
      athleteId={athlete.id}
      organizationId={athlete.organization_id}
      onSubmitted={refetchOrders}
      impersonating={isImpersonating}
      onBlockedSubmit={openGuard}
    />
  );
}

function OrderDraftBarBridge({ onOpen }: { onOpen: () => void }) {
  return <OrderDraftBar onOpenSheet={onOpen} />;
}

export default function PortalLayout() {
  const { user, signOut } = useAuth();
  const { athlete, loading, isImpersonating, noAccess } = useCurrentAthlete();

  const [navOpen, setNavOpen] = useState(false);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Pull-to-refresh: trigger a window reload of the data hooks via a key.
  // We delegate the actual refetch to child pages by emitting a custom event.
  const handleRefresh = useCallback(async () => {
    window.dispatchEvent(new CustomEvent("portal:refresh"));
    await new Promise((r) => setTimeout(r, 350));
  }, []);
  const { pullPx, refreshing } = usePullToRefresh({ onRefresh: handleRefresh });

  if (noAccess) return <Navigate to="/pending-access" replace />;

  if (loading || !athlete) {
    return (
      <div className="min-h-screen">
        <div className="bg-[hsl(var(--dark))] border-b border-border py-16 flex flex-col items-center gap-6">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="max-w-[1200px] mx-auto p-4 sm:p-6 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <OrderDraftProvider>
      <PortalDataProvider
        athlete={athlete}
        isImpersonating={isImpersonating}
        openOrderSheet={() => setOrderSheetOpen(true)}
        openGuard={() => setGuardOpen(true)}
      >
        <div className="min-h-screen bg-background scroll-smooth scroll-touch">
          {(pullPx > 0 || refreshing) && (
            <div
              className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center pointer-events-none"
              style={{ transform: `translateY(${Math.min(pullPx, 80)}px)` }}
            >
              <div className="mt-2 h-9 w-9 rounded-full bg-card border border-border flex items-center justify-center shadow-md">
                <RefreshCw
                  className={`h-4 w-4 text-accent ${refreshing ? "animate-spin" : ""}`}
                  style={{ transform: `rotate(${pullPx * 4}deg)` }}
                />
              </div>
            </div>
          )}

          {isImpersonating && (
            <ImpersonationBanner
              athleteId={athlete.id}
              athleteName={
                athlete.full_name || `${athlete.first_name} ${athlete.last_name}`
              }
              teamName={null}
            />
          )}

          <PortalNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />

          <AthleteHeader onMenuClick={() => setNavOpen(true)} onBellClick={() => setNotifOpen(true)} />
          <NotificationsSheet open={notifOpen} onOpenChange={setNotifOpen} />

          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-3 hidden md:flex items-center justify-end gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">{user?.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="text-muted-foreground hover:text-accent h-9 tap-target"
            >
              <LogOut className="h-4 w-4 mr-1.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>

          <div className="pb-bottom-nav md:pb-0">
            <Outlet />
          </div>

          <BulkOrderSheetBridge open={orderSheetOpen} onOpenChange={setOrderSheetOpen} />
          <OrderDraftBarBridge onOpen={() => setOrderSheetOpen(true)} />
          <ImpersonationGuardModal open={guardOpen} onOpenChange={setGuardOpen} />

          <PortalBottomNav />
        </div>
      </PortalDataProvider>
    </OrderDraftProvider>
  );
}
