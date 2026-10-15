// Mobile-first. Player Portal Home (Phase 1).
// Hierarchy (section 21): [global Athlete Header] → AX Credit → Quick
// Actions → Dynamic Action Card → Packages → Your Products preview.
// Projects / New Content / Code Vault land in later phases.
import { useNavigate } from "react-router-dom";
import { AxCreditCard } from "@/components/portal/home/AxCreditCard";
import { QuickActions } from "@/components/portal/home/QuickActions";
import { DynamicActionCard } from "@/components/portal/home/DynamicActionCard";
import { PackagesRow } from "@/components/portal/home/PackagesRow";
import { ProductPreviewSlider } from "@/components/portal/ProductPreviewSlider";
import { CodeVault } from "@/components/portal/CodeVault";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { PortalTitleCard } from "@/components/portal/home/PortalTitleCard";

export default function PortalHomeClassic() {
  const navigate = useNavigate();
  const { products, productsLoading, athlete } = usePortalData();

  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 space-y-7 pb-bottom-nav md:pb-32">
      <PortalTitleCard theme={athlete.portal_theme} />

      <div className="stagger-fade" style={{ ["--i" as string]: 0 }}>
        <AxCreditCard />
      </div>

      <div className="stagger-fade" style={{ ["--i" as string]: 1 }}>
        <QuickActions />
      </div>

      <div className="stagger-fade" style={{ ["--i" as string]: 2 }}>
        <DynamicActionCard />
      </div>

      <div className="stagger-fade" style={{ ["--i" as string]: 3 }}>
        <PackagesRow />
      </div>

      <div className="stagger-fade" style={{ ["--i" as string]: 4 }}>
        <ProductPreviewSlider
          products={products}
          loading={productsLoading}
          onViewAll={() => navigate("/portal/products")}
        />
      </div>

      <div className="stagger-fade" style={{ ["--i" as string]: 5 }}>
        <CodeVault />
      </div>
    </main>
  );
}
