// @vitest-environment jsdom
//
// The invoice builder in a real DOM: click products onto the invoice, set
// quantities, see the client's total beside AX's side and the client's side,
// switch giving away / selling, and create the order.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PricingSheet, SheetProduct } from "@/lib/v2/pricing-sheet";

const TEE = "tee-blank";
const mk = (id: string, over: Partial<SheetProduct> = {}): SheetProduct => ({
  id,
  title: id,
  status: "published",
  garment: "tee",
  onShopify: false,
  blankId: TEE,
  blankName: "DRI EASE OVERSIZED TEE",
  blankCatalogCost: 12,
  detectedSides: "front_back",
  imageUrl: null,
  retail: 45,
  athletePrice: 26,
  ruleAthletePrice: 18,
  pricing: { blankCost: null, printCost: null, otherCost: null, clientPrice: null, sharePercent: null, printSides: null, notes: "" },
  ...over,
});
const SHEET: PricingSheet = {
  products: [mk("Signature Jersey #11 Tee"), mk("WRLD #11 Tee V1", { detectedSides: "front", athletePrice: 23 }), mk("Old Shopify Tee", { blankId: null, onShopify: true })],
  terms: { revenueSharePercent: 90, payoutSchedule: "", note: "", splitBasis: "profit", paymentInstructions: "Zelle to pay@ax.test" },
  presets: { [TEE]: { blank: { cost: 12, price: 18 }, front: { cost: 2, price: 5 }, back: { cost: 2, price: 3 }, services: { cost: null, price: null } } },
};
const createInvoice = vi.fn().mockResolvedValue({ id: "o1", orderNumber: "BR-2026-00042" });

vi.mock("@/lib/v2/pricing-sheet", async (orig) => ({
  ...(await orig<typeof import("@/lib/v2/pricing-sheet")>()),
  usePricingSheet: () => ({ data: SHEET, isLoading: false, isError: false }),
}));
vi.mock("@/lib/v2/invoice-builder", async (orig) => ({
  ...(await orig<typeof import("@/lib/v2/invoice-builder")>()),
  useCreateInvoice: () => ({ mutateAsync: createInvoice, isPending: false }),
}));
vi.mock("@/lib/v2/invoices", async (orig) => ({
  ...(await orig<typeof import("@/lib/v2/invoices")>()),
  useSetPaymentStatus: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/usePortalPricing", async (orig) => ({
  ...(await orig<typeof import("@/hooks/usePortalPricing")>()),
  usePortalPricing: () => ({ config: { base_markup_pct: 50, tiers: [] }, loading: false }),
}));
vi.mock("@/lib/v2/data", () => ({ useEntityWorkspace: () => ({ data: { entity: { name: "Darnell Mooney", organizationId: "org1" } }, isLoading: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import V2InvoiceBuilder from "../V2InvoiceBuilder";

let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin-v2/people/e1/invoice"]}>
          <Routes>
            <Route path="/admin-v2/people/:id/invoice" element={<V2InvoiceBuilder />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  createInvoice.mockClear();
});

const text = () => host.textContent ?? "";
const button = (match: (t: string) => boolean) => [...host.querySelectorAll("button")].find((b) => match(b.textContent?.trim() ?? ""))!;
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const card = (title: string) => [...host.querySelectorAll("h2")].find((h) => h.textContent?.startsWith(title))!.closest("div")!.parentElement!;

describe("invoice builder", () => {
  it("lists only products on a blank (old Shopify-only ones are left out)", () => {
    expect(text()).toContain("Signature Jersey #11 Tee");
    expect(text()).not.toContain("Old Shopify Tee");
  });

  it("adds products, prices them from the sheet, and shows both sides", async () => {
    await click([...host.querySelectorAll('button[title="Add to the invoice"]')].find((b) => b.textContent?.includes("Signature Jersey"))!);
    // 12 front + back tees at $26 = $312; our cost 12 × $16 = $192; AX makes $120.
    expect(card("Invoice").textContent).toContain("$312.00");
    expect(card("Our side").textContent).toContain("$192.00");
    expect(card("Our side").textContent).toContain("$120.00");
    expect(card("Darnell's side").textContent).toContain("$26.00"); // per piece

    await click(button((t) => t === "Selling"));
    // Sold at $45: $540 in, $228 kept, $19 a piece.
    expect(card("Darnell's side").textContent).toContain("$540.00");
    expect(card("Darnell's side").textContent).toContain("$228.00");

    await click(button((t) => t.startsWith("Create invoice")));
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(createInvoice.mock.calls[0][0].figures).toMatchObject({ units: 12, total: 312 });
    expect(text()).toContain("BR-2026-00042");
  });

  it("Add all puts a whole print line on the invoice", async () => {
    await click(button((t) => t.startsWith("Add all")));
    expect(card("On the invoice").textContent).toContain("12 pieces");
  });
});
