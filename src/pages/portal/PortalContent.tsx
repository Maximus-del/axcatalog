import { PortalSection } from "@/components/portal/PortalSection";
import { ContentHubGrid } from "@/components/portal/ContentHubGrid";
import { usePortalData } from "@/components/portal/PortalDataContext";

export default function PortalContent() {
  const { athlete, products, productsLoading, sales } = usePortalData();
  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-bottom-nav md:pb-32">
      <PortalSection
        id="sec-content"
        title="Social Media Content"
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
    </main>
  );
}