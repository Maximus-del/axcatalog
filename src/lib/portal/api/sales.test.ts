import { describe, expect, it } from "vitest";
import { groupInvoiceItems, parseSalesDetail } from "./sales";

const RAW = {
  attributable: true,
  products: [
    { productId: "p1", title: "All-Access Black Tee", status: "current", units: 23, gross: 914, orders: 13, firstSale: "2024-06-01T00:00:00Z", lastSale: "2025-11-07T00:00:00Z" },
    { productId: null, title: "Old Tee", status: "weird", units: 2, gross: 90, orders: 2 },
  ],
  fanOrders: [{ id: "o1", number: "#1648", date: "2026-06-10T02:39:44Z", refunded: false, units: 1, gross: 48, items: [{ productId: "p1", title: "Tee", variant: "L / Black", quantity: 1, total: 48 }] }],
  fanOrderCount: 60,
  invoices: [
    { id: "i1", number: "#1641", date: "2026-05-21T00:00:00Z", charged: 1337.6, billedOutside: false, units: 76, items: [
      { productId: null, title: "Community Day Tee", variant: "L / White", quantity: 50 },
      { productId: null, title: "Community Day Tee", variant: "XL / White", quantity: 26 },
    ] },
    { id: "i2", number: "#1607", date: "2025-12-29T00:00:00Z", charged: 0, billedOutside: true, units: 37, items: [{ productId: "p2", title: "Unleashed Tee", variant: null, quantity: 37 }] },
  ],
};

describe("Brand HQ sales detail", () => {
  it("parses products, fan orders and invoices", () => {
    const d = parseSalesDetail(RAW);
    expect(d.attributable).toBe(true);
    expect(d.products[0]).toMatchObject({ productId: "p1", status: "current", units: 23, gross: { amountMinor: 91400, currency: "USD" } });
    expect(d.products[1].status).toBe("retired"); // unknown → retired, never "current"
    expect(d.fanOrderCount).toBe(60);
    expect(d.fanOrders[0].items[0]).toEqual({ productId: "p1", title: "Tee", variant: "L / Black", quantity: 1, total: { amountMinor: 4800, currency: "USD" } });
    expect(d.invoices[0].charged?.amountMinor).toBe(133760);
    expect(d.invoices[1].charged).toBeNull(); // billed outside Shopify: no $0 shown as a charge
    expect(d.invoices[1].billedOutside).toBe(true);
  });
  it("not attributable → empty, never another client's sales", () => {
    expect(parseSalesDetail({ attributable: false, reason: "shared_organization" })).toEqual({ attributable: false, products: [], fanOrders: [], fanOrderCount: 0, invoices: [] });
    expect(parseSalesDetail(null).attributable).toBe(false);
  });
  it("groups an invoice's sizes under each product", () => {
    const d = parseSalesDetail(RAW);
    expect(groupInvoiceItems(d.invoices[0].items)).toEqual([{ productId: null, title: "Community Day Tee", units: 76, sizes: "L / White ×50 · XL / White ×26" }]);
    expect(groupInvoiceItems(d.invoices[1].items)[0].sizes).toBe("One size ×37");
  });
});
