// Mobile-first. Test at 375px before merging.
import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useCurrentAthlete } from "@/hooks/useCurrentAthlete";
import { usePortalStats } from "@/hooks/usePortalStats";
import { usePortalSales } from "@/hooks/usePortalSales";
import { usePortalProducts } from "@/hooks/usePortalProducts";
import { usePortalOrders } from "@/hooks/usePortalOrders";
import { usePortalHiddenProducts } from "@/hooks/usePortalHiddenProducts";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { ImpersonationBanner } from "@/components/portal/ImpersonationBanner";
import { ImpersonationGuardModal } from "@/components/portal/ImpersonationGuardModal";
import { PortalNavDrawer } from "@/components/portal/PortalNavDrawer";
import { MobileHeader } from "@/components/portal/home/MobileHeader";
import { HubCardsRow, type HubCardKey } from "@/components/portal/HubCardsRow";
import { PortalStatsRow } from "@/components/portal/PortalStatsRow";
import { PortalSection } from "@/components/portal/PortalSection";
import { MyProductsGrid } from "@/components/portal/MyProductsGrid";
import { BulkOrderSheet } from "@/components/portal/BulkOrderSheet";
import { OrderDraftBar } from "@/components/portal/OrderDraftBar";
import { OrderDraftProvider } from "@/components/portal/OrderDraftContext";
import { AnalyticsTopProducts } from "@/components/portal/AnalyticsTopProducts";
import { AnalyticsRevenueChart } from "@/components/portal/AnalyticsRevenueChart";
import { AnalyticsRecentOrders } from "@/components/portal/AnalyticsRecentOrders";
import { ContentHubGrid } from "@/components/portal/ContentHubGrid";
import { RecommendationsCarousel } from "@/components/portal/home/RecommendationsCarousel";
import { EraComparison } from "@/components/portal/home/EraComparison";
import { SuperfansCard } from "@/components/portal/home/SuperfansCard";
import { FanbaseMap } from "@/components/portal/home/FanbaseMap";
import { UpcomingDrops } from "@/components/portal/home/UpcomingDrops";

function PortalHomeInner() {
  const { user, signOut } = useAuth();
  const { athlete, loading, isImpersonating, noAccess } = useCurrentAthlete();
  const { productsLive, activeDesigns, loading: statsLoading } = usePortalStats(
    athlete?.id ?? null,
  );
  const sales = usePortalSales(athlete?.organization_id ?? null);
  const { products, loading: productsLoading, refetch: refetchProducts } =
    usePortalProducts(athlete?.id ?? null);
  const { orders, loading: ordersLoading, refetch: refetchOrders } = usePortalOrders(
    athlete?.id ?? null,
  );
  const { hiddenIds, hide, unhide } = usePortalHiddenProducts(athlete?.id ?? null);

  const [navOpen, setNavOpen] = useState(false);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const [teamName, setTeamName] = useState<string | null>(null);

  // Pull-to-refresh on mobile — refetch products + orders.
  const handleRefresh = useCallback(async () => {
    refetchProducts();
    refetchOrders();
    // Tiny delay so the spinner is perceptible even on a fast refetch.
    await new Promise((r) => setTimeout(r, 350));
  }, [refetchProducts, refetchOrders]);
  const { pullPx, refreshing } = usePullToRefresh({ onRefresh: handleRefresh });

  // Fetch the current team name for display in the impersonation banner.
  useEffect(() => {
    if (!athlete?.current_team_id) {
      setTeamName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("teams")
        .select("name")
        .eq("id", athlete.current_team_id!)
        .maybeSingle();
      if (!cancelled) setTeamName(data?.name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [athlete?.current_team_id]);

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const handleHubSelect = (key: HubCardKey) => {
    if (key === "order") {
      setOrderSheetOpen(true);
      document.getElementById("sec-products")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const map: Record<Exclude<HubCardKey, "order">, string> = {
      sales: "sec-analytics",
      products: "sec-products",
      content: "sec-content",
    };
    document.getElementById(map[key])?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen scroll-smooth scroll-touch">
      {/* Pull-to-refresh indicator */}
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
          teamName={teamName}
        />
      )}

      <PortalNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />

      <MobileHeader
        firstName={athlete.first_name}
        lastName={athlete.last_name}
        lifetimeRevenue={sales.loading ? null : sales.lifetimeRevenue}
        onMenuClick={() => setNavOpen(true)}
      />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-3 flex items-center justify-end gap-3">
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

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-8 pb-bottom-nav md:pb-32">
        <div className="stagger-fade" style={{ ["--i" as string]: 0 }}>
          <HubCardsRow onSelect={handleHubSelect} />
        </div>

        <div className="stagger-fade" style={{ ["--i" as string]: 1 }}>
          <PortalStatsRow
            productsLive={productsLive}
            activeDesigns={activeDesigns}
            loading={statsLoading}
            lifetimeRevenue={sales.lifetimeRevenue}
            totalOrders={sales.totalOrders}
            salesLoading={sales.loading}
          />
        </div>

        <PortalSection
          id="sec-products"
          title="Your Product Lineup"
          description="Your merch lineup — share, promote, and order."
          actions={
            <Button
              onClick={() => setOrderSheetOpen(true)}
              className="bg-accent text-accent-foreground hover:bg-accent/90 uppercase tracking-wider font-bold tap-target w-full sm:w-auto"
            >
              Bulk Order Sheet
            </Button>
          }
        >
          <MyProductsGrid
            products={products}
            loading={productsLoading}
            hiddenIds={hiddenIds}
            onHide={hide}
            onUnhide={unhide}
          />
        </PortalSection>

        <PortalSection id="sec-analytics" title="Analytics" defaultOpen={false}>
          <div className="space-y-6">
            <div>
              <div className="ax-label mb-3">Top Products</div>
              <AnalyticsTopProducts
                products={products}
                loading={productsLoading}
                salesByProduct={sales.byProduct}
              />
            </div>
            <div>
              <div className="ax-label mb-3">Revenue Over Time</div>
              <AnalyticsRevenueChart />
            </div>
            <div>
              <div className="ax-label mb-3">Recent Orders</div>
              <AnalyticsRecentOrders orders={orders} loading={ordersLoading} />
            </div>
            <div>
              <div className="ax-label mb-3">Superfans</div>
              <SuperfansCard />
            </div>
            <div>
              <div className="ax-label mb-3">Fanbase Map</div>
              <FanbaseMap />
            </div>
          </div>
        </PortalSection>

        <PortalSection
          id="sec-content"
          title="Social Media Content"
          defaultOpen={false}
          description="Ready-to-post graphics for your collections. Save and share."
        >
          <ContentHubGrid
            products={products}
            loading={productsLoading}
            athleteId={athlete.id}
            organizationId={athlete.organization_id}
            salesByProduct={sales.byProduct}
          />
        </PortalSection>

        <PortalSection
          id="sec-drops"
          title="Upcoming Drops"
          defaultOpen={false}
        >
          <UpcomingDrops />
        </PortalSection>

        <div className="h-px bg-accent/30" />

        <PortalSection
          id="sec-recs"
          title="This Week's Recommendations"
          defaultOpen={false}
        >
          <RecommendationsCarousel />
        </PortalSection>

        <PortalSection
          id="sec-era"
          title="AR / Era Comparison"
          defaultOpen={false}
        >
          <EraComparison athleteId={athlete.id} />
        </PortalSection>
      </main>

      <BulkOrderSheet
        open={orderSheetOpen}
        onOpenChange={setOrderSheetOpen}
        products={products}
        athleteId={athlete.id}
        organizationId={athlete.organization_id}
        onSubmitted={refetchOrders}
        impersonating={isImpersonating}
        onBlockedSubmit={() => setGuardOpen(true)}
      />

      <OrderDraftBar onOpenSheet={() => setOrderSheetOpen(true)} />

      <ImpersonationGuardModal open={guardOpen} onOpenChange={setGuardOpen} />
    </div>
  );
}

export default function PortalHome() {
  return (
    <OrderDraftProvider>
      <PortalHomeInner />
    </OrderDraftProvider>
  );
}
