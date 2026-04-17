import { useState } from "react";
import { Navigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/AuthProvider";
import { useCurrentAthlete } from "@/hooks/useCurrentAthlete";
import { usePortalStats } from "@/hooks/usePortalStats";
import { usePortalProducts } from "@/hooks/usePortalProducts";
import { usePortalOrders } from "@/hooks/usePortalOrders";
import { ImpersonationBanner } from "@/components/portal/ImpersonationBanner";
import { PortalNavDrawer } from "@/components/portal/PortalNavDrawer";
import { PortalHero } from "@/components/portal/PortalHero";
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

function PortalHomeInner() {
  const { user, signOut } = useAuth();
  const { athlete, loading, isImpersonating, noAccess } = useCurrentAthlete();
  const { productsLive, activeDesigns, loading: statsLoading } = usePortalStats(
    athlete?.id ?? null,
  );
  const { products, loading: productsLoading } = usePortalProducts(athlete?.id ?? null);
  const { orders, loading: ordersLoading, refetch: refetchOrders } = usePortalOrders(
    athlete?.id ?? null,
  );

  const [navOpen, setNavOpen] = useState(false);
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);

  if (noAccess) return <Navigate to="/pending-access" replace />;

  if (loading || !athlete) {
    return (
      <div className="min-h-screen">
        <div className="bg-[hsl(var(--dark))] border-b border-border py-16 flex flex-col items-center gap-6">
          <Skeleton className="h-12 w-12 rounded-full" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="max-w-[1200px] mx-auto p-6 space-y-6">
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
    <div className="min-h-screen scroll-smooth">
      {isImpersonating && (
        <ImpersonationBanner athleteName={`${athlete.first_name} ${athlete.last_name}`} />
      )}

      <PortalNavDrawer open={navOpen} onClose={() => setNavOpen(false)} />

      <PortalHero
        firstName={athlete.first_name}
        lastName={athlete.last_name}
        onMenuClick={() => setNavOpen(true)}
      />

      <div className="max-w-[1200px] mx-auto px-6 pt-4 flex items-center justify-end gap-3">
        <span className="text-xs text-muted-foreground hidden sm:block">{user?.email}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="text-muted-foreground hover:text-accent h-8"
        >
          <LogOut className="h-4 w-4 mr-1.5" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>

      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-8 pb-32">
        <HubCardsRow onSelect={handleHubSelect} />

        <PortalStatsRow
          productsLive={productsLive}
          activeDesigns={activeDesigns}
          loading={statsLoading}
        />

        <p className="text-sm text-muted-foreground text-center">
          Scroll down to explore your analytics, products, content, and ordering.
        </p>

        <div className="h-px bg-accent/30" />

        <PortalSection
          id="sec-products"
          title="Your Product Lineup"
          description="Your merch lineup — share, promote, and order."
          actions={
            <Button
              onClick={() => setOrderSheetOpen(true)}
              className="bg-accent text-accent-foreground hover:bg-accent/90 uppercase tracking-wider font-bold"
            >
              Bulk Order Sheet
            </Button>
          }
        >
          <MyProductsGrid products={products} loading={productsLoading} />
        </PortalSection>

        <PortalSection id="sec-analytics" title="Analytics" defaultOpen={false}>
          <div className="space-y-6">
            <div>
              <div className="ax-label mb-3">Top Products</div>
              <AnalyticsTopProducts products={products} loading={productsLoading} />
            </div>
            <div>
              <div className="ax-label mb-3">Revenue Over Time</div>
              <AnalyticsRevenueChart />
            </div>
            <div>
              <div className="ax-label mb-3">Recent Orders</div>
              <AnalyticsRecentOrders orders={orders} loading={ordersLoading} />
            </div>
          </div>
        </PortalSection>

        <PortalSection
          id="sec-content"
          title="Social Media Content"
          defaultOpen={false}
          description="Ready-to-post graphics for your collections. Save and share."
        >
          <ContentHubGrid products={products} loading={productsLoading} />
        </PortalSection>
      </main>

      <BulkOrderSheet
        open={orderSheetOpen}
        onOpenChange={setOrderSheetOpen}
        products={products}
        athleteId={athlete.id}
        organizationId={athlete.organization_id}
        onSubmitted={refetchOrders}
      />

      <OrderDraftBar onOpenSheet={() => setOrderSheetOpen(true)} />
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
