import { useState } from "react";
import { Navigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/AuthProvider";
import { useCurrentAthlete } from "@/hooks/useCurrentAthlete";
import { usePortalStats } from "@/hooks/usePortalStats";
import { ImpersonationBanner } from "@/components/portal/ImpersonationBanner";
import { PortalNavDrawer } from "@/components/portal/PortalNavDrawer";
import { PortalHero } from "@/components/portal/PortalHero";
import { HubCardsRow, type HubCardKey } from "@/components/portal/HubCardsRow";
import { PortalStatsRow } from "@/components/portal/PortalStatsRow";
import { PortalSection } from "@/components/portal/PortalSection";

export default function PortalHome() {
  const { user, signOut } = useAuth();
  const { athlete, loading, isImpersonating, noAccess } = useCurrentAthlete();
  const { productsLive, activeDesigns, loading: statsLoading } = usePortalStats(
    athlete?.id ?? null,
  );
  const [navOpen, setNavOpen] = useState(false);

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
    const map: Record<HubCardKey, string> = {
      sales: "sec-analytics",
      products: "sec-products", // TODO Pass 2: open all-products modal
      content: "sec-content",
      order: "sec-products", // TODO Pass 2: also open Bulk Order Sheet
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

      {/* Account row — small + subtle, top-right of content */}
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

      <main className="max-w-[1200px] mx-auto px-6 py-6 space-y-8">
        {/* Hub cards */}
        <HubCardsRow onSelect={handleHubSelect} />

        {/* Stats */}
        <PortalStatsRow
          productsLive={productsLive}
          activeDesigns={activeDesigns}
          loading={statsLoading}
        />

        <p className="text-sm text-muted-foreground text-center">
          Scroll down to explore your analytics, products, content, and ordering.
        </p>

        {/* Accent divider */}
        <div className="h-px bg-accent/30" />

        {/* Sections (Pass 2 will fill these) */}
        <PortalSection
          id="sec-products"
          title="Your Product Lineup"
          description="Your merch lineup — share, promote, and order."
          actions={
            <Button
              disabled
              className="bg-accent text-accent-foreground hover:bg-accent/90 uppercase tracking-wider font-bold"
            >
              Bulk Order Sheet
            </Button>
          }
        >
          <div className="ax-card p-12 text-center text-muted-foreground">
            Product grid arrives in the next pass.
          </div>
        </PortalSection>

        <PortalSection id="sec-analytics" title="Analytics" defaultOpen={false}>
          <div className="ax-card p-12 text-center text-muted-foreground">
            Top products, revenue chart, and recent orders arrive in the next pass.
          </div>
        </PortalSection>

        <PortalSection
          id="sec-content"
          title="Social Media Content"
          defaultOpen={false}
          description="Ready-to-post graphics for your collections. Save and share."
        >
          <div className="ax-card p-12 text-center text-muted-foreground">
            Content hub arrives in the next pass.
          </div>
        </PortalSection>
      </main>
    </div>
  );
}
