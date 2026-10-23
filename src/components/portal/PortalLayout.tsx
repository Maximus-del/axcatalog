// Mobile-first. Test at 375px before merging.
import { useCallback, useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { canSeePath } from "@/lib/portal/roles";
import { readDrive } from "@/lib/portal/test-drive";
import { TestDriveBar } from "@/components/test-drive/TestDriveBar";
import { LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentAthlete } from "@/hooks/useCurrentAthlete";
import { useApplyPortalTheme } from "@/hooks/useApplyPortalTheme";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { ImpersonationBanner } from "./ImpersonationBanner";
import { ImpersonationGuardModal } from "./ImpersonationGuardModal";
import { BulkOrderSheet } from "./BulkOrderSheet";
import { OrderDraftBar } from "./OrderDraftBar";
import { OrderDraftProvider } from "./OrderDraftContext";
import { PortalDataProvider, usePortalData } from "./PortalDataContext";
import { MooneyShell } from "./mooney/MooneyShell";
import { PortalNavDrawer } from "./PortalNavDrawer";
import { AthleteHeader } from "./home/AthleteHeader";
import { NotificationsSheet } from "./NotificationsSheet";
import { PortalBottomNav } from "./PortalBottomNav";
import { PortalDesktopNav } from "./PortalDesktopNav";
import { PortalLayoutKindProvider, useResolvedLayout } from "./PortalLayoutKind";
import { entityVoice } from "@/lib/portal/entity-voice";
import { OrderReceiptHost } from "./OrderReceipt";

function BulkOrderSheetBridge({
  open,
  onOpenChange,
  world,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  world: boolean;
}) {
  const { athlete, isImpersonating, products, archivedProducts, refetchOrders, openGuard } = usePortalData();
  return (
    <BulkOrderSheet
      open={open}
      onOpenChange={onOpenChange}
      products={world ? [...products, ...archivedProducts] : products}
      world={world}
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

/**
 * The page, unless this is a Team login on an owner-only page — then a plain
 * note instead. Covers typed URLs and old bookmarks; the nav never offers
 * those pages to Team in the first place.
 */
function RoleOutlet() {
  const { portalRole } = usePortalData();
  const { pathname } = useLocation();
  if (canSeePath(pathname, portalRole)) return <Outlet />;
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="text-xl font-bold">Owner access only</h1>
      <p className="mt-2 text-sm text-muted-foreground">This part of the locker is for your organization's owners. Your gear and orders are all in My Gear.</p>
      <Button asChild className="mt-6"><Link to={`/portal/products${window.location.search}`}>Go to My Gear</Link></Button>
    </div>
  );
}

export default function PortalLayout() {
  const { athlete, loading, isImpersonating, noAccess, portalRole } = useCurrentAthlete();
  const location = useLocation();
  const drive = isImpersonating ? readDrive(location.pathname, location.search) : null;
  // The client's look, set by AX in V2. Called before any early return so the
  // hook order is stable; null until the athlete row arrives.
  useApplyPortalTheme(athlete?.portal_theme ?? null);
  // World (Locker Room) shell or classic: the client's theme decides, so the
  // Mooney World redesign only reaches clients AX has switched over.
  const layout = useResolvedLayout(athlete?.portal_theme ?? null);
  const { user, role, signOut } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);

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
        portalRole={portalRole}
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

          {isImpersonating && role === "admin" && drive ? (
            <TestDriveBar entityId={athlete.id} role={drive.role} stage={drive.stage} />
          ) : isImpersonating && role === "admin" && (
            <ImpersonationBanner
              athleteId={athlete.id}
              athleteName={
                entityVoice(athlete).name
              }
              teamName={null}
            />
          )}

          <PortalLayoutKindProvider value={layout}>
            {layout === "world" ? (
              <MooneyShell>
                <RoleOutlet />
              </MooneyShell>
            ) : (
              <>
                <PortalNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />
                <AthleteHeader onMenuClick={() => setNavOpen(true)} onBellClick={() => setNotifOpen(true)} />
                <NotificationsSheet open={notifOpen} onOpenChange={setNotifOpen} />
                <PortalDesktopNav />
                <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-3 hidden md:flex items-center justify-end gap-3">
                  <span className="text-xs text-muted-foreground hidden sm:block">{user?.email}</span>
                  <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-accent h-9 tap-target">
                    <LogOut className="h-4 w-4 mr-1.5" />
                    <span className="hidden sm:inline">Sign out</span>
                  </Button>
                </div>
                <div className="pb-bottom-nav md:pb-0">
                  <RoleOutlet />
                </div>
                <PortalBottomNav />
              </>
            )}
          </PortalLayoutKindProvider>

          <BulkOrderSheetBridge open={orderSheetOpen} onOpenChange={setOrderSheetOpen} world={layout === "world"} />
          <OrderDraftBarBridge onOpen={() => setOrderSheetOpen(true)} />
          <ImpersonationGuardModal open={guardOpen} onOpenChange={setGuardOpen} />
          {/* Every order flow ends here: number, amount due, how to pay. */}
          <OrderReceiptHost />

        </div>
      </PortalDataProvider>
    </OrderDraftProvider>
  );
}
