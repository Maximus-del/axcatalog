// Mobile-first. Products: My Products · AX Blanks · My Designs (section 11).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalSection } from "@/components/portal/PortalSection";
import { MyProductsGrid } from "@/components/portal/MyProductsGrid";
import { BlanksGrid } from "@/components/portal/products/BlanksGrid";
import { DesignsGrid } from "@/components/portal/products/DesignsGrid";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { cn } from "@/lib/utils";

type Tab = "products" | "blanks" | "designs";

const TABS: { key: Tab; label: string }[] = [
  { key: "products", label: "My Products" },
  { key: "blanks", label: "AX Blanks" },
  { key: "designs", label: "My Designs" },
];

export default function PortalProducts() {
  const { products, productsLoading, hidden, openOrderSheet } = usePortalData();
  const [tab, setTab] = useState<Tab>("products");

  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 pb-bottom-nav md:pb-32">
      {/* Segmented tabs */}
      <div className="flex gap-1 rounded-xl bg-muted/50 p-1 mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 h-9 rounded-lg text-[13px] font-semibold transition-colors",
              tab === t.key
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "products" && (
        <PortalSection
          id="sec-products"
          title="Your Product Lineup"
          description="Your merch lineup — share, promote, and reorder."
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
      )}

      {tab === "blanks" && (
        <PortalSection
          id="sec-blanks"
          title="AX Blanks"
          description="Premium blank garments. Pick one, then add a design."
        >
          <BlanksGrid />
        </PortalSection>
      )}

      {tab === "designs" && (
        <PortalSection
          id="sec-designs"
          title="My Designs"
          description="Designs AX has created for you. Put one on a garment."
        >
          <DesignsGrid />
        </PortalSection>
      )}
    </main>
  );
}
