// TEMPORARY harness — used only by the /tmp browser check, deleted afterwards.
import { useEffect } from "react";
import { BulkOrderSheet } from "@/components/portal/BulkOrderSheet";
import { OrderDraftProvider, useOrderDraft } from "@/components/portal/OrderDraftContext";
import type { PortalProduct } from "@/hooks/usePortalProducts";

const product = (id: string, status: PortalProduct["status"]): PortalProduct => ({
  id,
  title: `${id.toUpperCase()} Tee`,
  slug: id,
  status,
  product_type: "tee",
  shopify_handle: null,
  blank_id: null,
  primary_image_url: null,
  images: [],
  price: 25,
  wholesale_price: null,
  athlete_unit_price: 18,
  variants: [],
  sizes: ["S", "M", "L", "XL", "2XL", "3XL"],
  colors: [
    { name: "Black", hex: "#111111" },
    { name: "Mocha", hex: "#7a5c44" },
    { name: "Cream", hex: "#f2ead9" },
  ],
  created_at: "2026-01-01T00:00:00Z",
});

function Seeder() {
  const { setQty } = useOrderDraft();
  useEffect(() => {
    setQty("p1", "M", 3, "Black");
    setQty("p3", "L", 2);
  }, [setQty]);
  return null;
}

export default function Harness() {
  const world = new URLSearchParams(window.location.search).get("world") !== "0";
  const products = [
    product("p1", "published"),
    product("p2", "published"),
    product("p3", "archived"),
    product("p4", "archived"),
  ];
  return (
    <div style={{ minHeight: "100vh", background: "hsl(var(--dark))" }}>
      <OrderDraftProvider>
        <Seeder />
        <BulkOrderSheet
          open
          onOpenChange={() => {}}
          products={products}
          athleteId="a1"
          organizationId="o1"
          world={world}
        />
      </OrderDraftProvider>
    </div>
  );
}
