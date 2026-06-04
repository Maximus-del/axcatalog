import { Button } from "@/components/ui/button";
import { PortalSection } from "@/components/portal/PortalSection";
import { MyProductsGrid } from "@/components/portal/MyProductsGrid";
import { usePortalData } from "@/components/portal/PortalDataContext";

export default function PortalProducts() {
  const { products, productsLoading, hidden, openOrderSheet } = usePortalData();
  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-bottom-nav md:pb-32">
      <PortalSection
        id="sec-products"
        title="Your Product Lineup"
        description="Your merch lineup — share, promote, and order."
        actions={
          <Button
            onClick={openOrderSheet}
            className="bg-accent text-accent-foreground hover:bg-accent/90 uppercase tracking-wider font-bold tap-target w-full sm:w-auto"
          >
            Bulk Order Sheet
          </Button>
        }
      >
        <MyProductsGrid
          products={products}
          loading={productsLoading}
          hiddenIds={hidden.hiddenIds}
          onHide={hidden.hide}
          onUnhide={hidden.unhide}
        />
      </PortalSection>
    </main>
  );
}