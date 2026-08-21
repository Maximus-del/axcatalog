// Mobile-first. Products: My Products · My Designs.
//
// There is deliberately no blanks tab. An athlete has no reason to browse our
// garment catalogue as a catalogue — picking a garment is a STEP inside making
// something, not a destination. The full blanks library is an operations
// concern and stays on the admin side.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalSection } from "@/components/portal/PortalSection";
import { MyProductsGrid } from "@/components/portal/MyProductsGrid";
import { DesignsGrid } from "@/components/portal/products/DesignsGrid";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { cn } from "@/lib/utils";

type Tab = "products" | "designs";

const TABS: { key: Tab; label: string }[] = [
  { key: "products", label: "My Products" },
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

      {tab === "designs" && (
        <PortalSection
          id="sec-designs"
          title="My Designs"
          description="Your artwork — what we've made for you, and anything you create yourself. Put one on a product."
        >
          <DesignsGrid />
        </PortalSection>
      )}
    </main>
  );
}
