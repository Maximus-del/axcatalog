// @vitest-environment jsdom
// Brand HQ sales detail mounts in its three states and shows what matters:
// products, fan orders (expandable), invoices grouped by product.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseSalesDetail } from "@/lib/portal/api/sales";

const state: { data: unknown; isLoading: boolean; isError: boolean } = { data: null, isLoading: false, isError: false };
vi.mock("@/hooks/usePortalApi", () => ({
  usePortalSalesDetail: () => ({ ...state, refetch: vi.fn(), photo: () => null, inLocker: (id: string | null) => id === "p1" }),
}));
import { SalesHistory } from "./SalesHistory";

const DETAIL = parseSalesDetail({
  attributable: true,
  products: [
    { productId: "p1", title: "All-Access Black Tee", status: "current", units: 23, gross: 914, orders: 13, lastSale: "2025-11-07T00:00:00Z" },
    { productId: "p9", title: "Kids Moons Tee", status: "archived", units: 3, gross: 90, orders: 3, lastSale: "2025-01-01T00:00:00Z" },
  ],
  fanOrders: [{ id: "o1", number: "#1648", date: "2026-06-10T00:00:00Z", refunded: false, units: 1, gross: 48, items: [{ productId: "p1", title: "All-Access Black Tee", variant: "L / Black", quantity: 1, total: 48 }] }],
  fanOrderCount: 60,
  invoices: [
    { id: "i1", number: "#1641", date: "2026-05-21T00:00:00Z", charged: 1337.6, billedOutside: false, units: 76, items: [
      { productId: null, title: "Community Day Tee", variant: "L / White", quantity: 50 },
      { productId: null, title: "Community Day Tee", variant: "XL / White", quantity: 26 },
    ] },
    { id: "i2", number: "#1607", date: "2025-12-29T00:00:00Z", charged: 0, billedOutside: true, units: 37, items: [{ productId: "p2", title: "Unleashed Tee", variant: "M", quantity: 37 }] },
  ],
});

let host: HTMLDivElement;
let root: Root;
const mount = async () => {
  await act(async () => root.render(<MemoryRouter><SalesHistory /></MemoryRouter>));
  return host.textContent ?? "";
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Object.assign(state, { data: null, isLoading: false, isError: false });
});

describe("SalesHistory", () => {
  it("shows products, fan orders and invoices", async () => {
    state.data = DETAIL;
    const text = await mount();
    expect(text).toContain("Sales by product");
    expect(text).toContain("All-Access Black Tee");
    expect(text).toContain("In your lineup");
    expect(text).toContain("Archived");
    expect(text).toContain("60 orders from your store");
    expect(text).toContain("Invoice #1641");
    expect(text).toContain("L / White ×50 · XL / White ×26");
    expect(text).toContain("Billed separately");
    expect(text).toContain("$1,337.60 charged");
    // Only products still in the locker link to their page.
    expect(host.querySelectorAll('a[href*="/portal/products/p1"]').length).toBeGreaterThan(0);
    expect(host.querySelector('a[href*="/portal/products/p9"]')).toBeNull();
  });

  it("opens a fan order to show what was in it", async () => {
    state.data = DETAIL;
    await mount();
    const btn = host.querySelector<HTMLButtonElement>(".mw-sales-order-btn")!;
    expect(host.textContent).not.toContain("L / Black · ×1");
    await act(async () => btn.click());
    expect(host.textContent).toContain("L / Black · ×1");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("hides Invoices when the client never ordered from AX", async () => {
    state.data = { ...DETAIL, invoices: [] };
    expect(await mount()).not.toContain("Invoices");
  });

  it("loading and failed states render, not a blank or a crash", async () => {
    state.isLoading = true;
    await mount();
    expect(host.querySelector(".mw-studio-panel")).not.toBeNull();
    Object.assign(state, { isLoading: false, isError: true });
    expect(await mount()).toContain("Unable to load your sales.");
  });

  it("not attributable → renders nothing", async () => {
    state.data = parseSalesDetail({ attributable: false });
    expect(await mount()).toBe("");
  });
});
