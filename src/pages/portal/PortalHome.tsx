// Mobile-first. Portal landing: hub cards + credit wallet + stats.
// Sub-sections (products, analytics, content, drops, era) live on their
// own routes under /portal/* and are rendered through PortalLayout.
import { useNavigate } from "react-router-dom";
import { HubCardsRow, type HubCardKey } from "@/components/portal/HubCardsRow";
import { PortalStatsRow } from "@/components/portal/PortalStatsRow";
import { CreditWalletCard } from "@/components/portal/CreditWalletCard";
import { usePortalData } from "@/components/portal/PortalDataContext";

export default function PortalHome() {
  const navigate = useNavigate();
  const { athlete, stats, sales, openOrderSheet } = usePortalData();

  const handleHubSelect = (key: HubCardKey) => {
    if (key === "order") {
      openOrderSheet();
      navigate("/portal/products");
      return;
    }
    const map: Record<Exclude<HubCardKey, "order">, string> = {
      sales: "/portal/analytics",
      products: "/portal/products",
      content: "/portal/content",
    };
    navigate(map[key]);
  };

  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-8 pb-bottom-nav md:pb-32">
      <div className="stagger-fade" style={{ ["--i" as string]: 0 }}>
        <HubCardsRow onSelect={handleHubSelect} />
      </div>
      <div className="stagger-fade" style={{ ["--i" as string]: 1 }}>
        <CreditWalletCard athleteId={athlete.id} onUseCredit={openOrderSheet} />
      </div>
      <div className="stagger-fade" style={{ ["--i" as string]: 1 }}>
        <PortalStatsRow
          productsLive={stats.productsLive}
          activeDesigns={stats.activeDesigns}
          loading={stats.loading}
          lifetimeRevenue={sales.lifetimeRevenue}
          totalOrders={sales.totalOrders}
          salesLoading={sales.loading}
        />
      </div>
    </main>
  );
}
