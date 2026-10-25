import { describe, expect, it } from "vitest";
import {
  draftQty,
  draftToLines,
  dueLabel,
  matchColor,
  missingShipTo,
  orderGrid,
  parseStoredDraft,
  payNowPrice,
  productUnits,
  quickTargets,
  setDraftQty,
} from "./cart";
import { buildDraftInput, isAccessDenied, variantGid, WHOLESALE_TAG, NET_30_TEMPLATE } from "../../../supabase/functions/_shared/shopify-draft";
import { isSafePaymentUrl, parseOptions } from "./api/checkout";
import type { PortalVariant } from "@/hooks/usePortalProducts";

const v = (color: string | null, size: string | null, available = true): PortalVariant =>
  ({ id: `${color}-${size}`, productId: "p", shopifyVariantId: "1", sku: null, title: null, color, size, price: null, compareAtPrice: null, available, inventoryQuantity: null, inventoryPolicy: null, position: null, shopifyImageId: null }) as PortalVariant;

const tee = { status: "published" as const, colors: [], variants: [v("black", "S"), v("black", "M", false), v("graphite", "S")] };
const tumbler = { status: "published" as const, colors: [], variants: [v("black", null), v("pink", null), v("white", null, false)] };
const stainless = { status: "published" as const, colors: [], variants: [v(null, null)] };
const blank = { status: "published" as const, colors: [{ name: "Almond", hex: "#eee" }], variants: [] };

describe("order grid", () => {
  it("uses real variants for sizes and stock", () => {
    const g = orderGrid(tee);
    expect(g.sizes).toEqual(["S", "M"]);
    expect(g.colors.map((c) => c.key)).toEqual(["black", "graphite"]);
    expect(g.colors[0].name).toBe("Black");
    expect(g.isAvailable("black", "M")).toBe(false);
    expect(g.isAvailable("graphite", "M")).toBe(false); // combination doesn't exist
  });
  it("gives a colour-only piece no size column", () => {
    expect(orderGrid(tumbler).sizes).toEqual([""]);
    expect(orderGrid(stainless).sizes).toEqual([""]);
    expect(orderGrid(stainless).colors).toEqual([{ key: "", name: "One color", hex: null }]);
  });
  it("falls back to S–3XL for made-to-order blanks", () => {
    const g = orderGrid(blank);
    expect(g.sizes).toHaveLength(6);
    expect(g.isAvailable("Almond", "3XL")).toBe(true);
  });
  it("treats archived pieces as made to order", () => {
    expect(orderGrid({ ...tee, status: "archived" }).isAvailable("black", "M")).toBe(true);
  });
});

describe("quick order", () => {
  it("offers sizes of the shown colour, or colours when there are no sizes", () => {
    expect(quickTargets(tee, "black").map((t) => [t.label, t.available])).toEqual([["S", true], ["M", false]]);
    expect(quickTargets(tumbler, "").map((t) => [t.color, t.label, t.available])).toEqual([
      ["black", "Black", true],
      ["pink", "Pink", true],
      ["white", "White", false],
    ]);
    expect(quickTargets(stainless, "").map((t) => t.label)).toEqual(["Add"]);
  });
  it("follows the colourway on the card", () => {
    expect(matchColor(tee, "Graphite")).toBe("graphite");
    expect(matchColor(tee, "Nope")).toBe("black");
    expect(matchColor(tee, null)).toBe("black");
  });
});

describe("cart state", () => {
  it("adds, caps and removes cleanly", () => {
    let d = setDraftQty({}, "p1", "M", 3, "black");
    d = setDraftQty(d, "p1", "L", 2, "black");
    d = setDraftQty(d, "p2", "", 900, "pink");
    expect(draftQty(d, "p1", "M", "black")).toBe(3);
    expect(draftQty(d, "p2", "", "pink")).toBe(500);
    expect(productUnits(d, "p1")).toBe(5);
    d = setDraftQty(d, "p1", "M", 0, "black");
    d = setDraftQty(d, "p1", "L", -4, "black");
    expect(d.p1).toBeUndefined();
  });
  it("turns into server lines, skipping products no longer in the locker", () => {
    const d = setDraftQty(setDraftQty({}, "p1", "M", 3, "black"), "gone", "S", 1);
    expect(draftToLines(d, new Set(["p1"]))).toEqual([{ productId: "p1", color: "black", size: "M", quantity: 3 }]);
    expect(draftToLines(setDraftQty({}, "p2", "", 2, ""))).toEqual([{ productId: "p2", color: null, size: null, quantity: 2 }]);
  });
  it("reads a stored cart defensively", () => {
    expect(parseStoredDraft(null)).toEqual({});
    expect(parseStoredDraft("not json")).toEqual({});
    expect(parseStoredDraft("[1,2]")).toEqual({});
    expect(parseStoredDraft(JSON.stringify({ p1: { black: { M: 2, L: "x", XL: -1 } }, p2: 5 }))).toEqual({ p1: { black: { M: 2 } } });
  });
});

describe("checkout maths and labels", () => {
  it("takes 5% to the cent, same as the server", () => {
    expect(payNowPrice(1721.2)).toEqual({ discount: 86.06, total: 1635.14 });
    expect(payNowPrice(15)).toEqual({ discount: 0.75, total: 14.25 });
  });
  it("needs a full address for net 30", () => {
    expect(missingShipTo(null)).toEqual(["Name", "Street", "City", "State", "ZIP"]);
    expect(missingShipTo({ name: "A", address1: "1 Main", city: "Austin", province: "TX", zip: " " })).toEqual(["ZIP"]);
  });
  it("labels the due date", () => {
    expect(dueLabel("2026-11-24")).toBe("Due Nov 24");
    expect(dueLabel(null)).toBeNull();
  });
  it("reads checkout options safely", () => {
    expect(parseOptions(null)).toEqual({ canChoose: false, payNowPct: 5, net30: false, shipTo: null });
    expect(parseOptions({ canChoose: true, net30: true, payNowPct: 5, shipTo: { city: "Austin" } }).shipTo).toEqual({ city: "Austin" });
  });
  it("only sends people to Shopify pages", () => {
    expect(isSafePaymentUrl("https://819d62-2.myshopify.com/123/invoices/abc")).toBe(true);
    expect(isSafePaymentUrl("https://shop.athletexclusive.com/123/invoices/abc")).toBe(true);
    expect(isSafePaymentUrl("https://evil.example/myshopify.com")).toBe(false);
    expect(isSafePaymentUrl("javascript:alert(1)")).toBe(false);
    expect(isSafePaymentUrl(null)).toBe(false);
  });
});

describe("Shopify draft order", () => {
  const base = {
    orderId: "o1",
    orderNumber: "BR-2026-00001",
    email: "owner@gym.com",
    shipTo: { name: "Jamie Lee Fox", address1: "1 Main St", city: "Austin", province: "TX", zip: "78701", country: "US" },
    lines: [
      { title: "Tumbler", color: "black", size: null, quantity: 60, effectiveUnitPrice: 27, shopifyVariantId: "gid://shopify/ProductVariant/49426083184830" },
      { title: "Custom tee", color: "Almond", size: "M", quantity: 10, effectiveUnitPrice: "16.2", shopifyVariantId: null, sku: "X1" },
    ],
    surcharge: 40,
    creditApplied: 10,
    payNowDiscount: 86.06,
  };
  it("pay now: variant prices pinned, credit + 5% off as one discount, tagged wholesale", () => {
    const d = buildDraftInput({ ...base, terms: "pay_now" }) as Record<string, any>;
    expect(d.lineItems[0]).toEqual({ variantId: base.lines[0].shopifyVariantId, quantity: 60, priceOverride: { amount: "27.00", currencyCode: "USD" } });
    expect(d.lineItems[1]).toMatchObject({ title: "Custom tee — Almond / M", quantity: 10, originalUnitPriceWithCurrency: { amount: "16.20", currencyCode: "USD" }, sku: "X1" });
    expect(d.lineItems[2]).toMatchObject({ title: "Rush turnaround", originalUnitPriceWithCurrency: { amount: "40.00" } });
    expect(d.appliedDiscount).toEqual({ title: "AX credit + Pay-now 5% off", value: 96.06, valueType: "FIXED_AMOUNT" });
    expect(d.tags).toEqual([WHOLESALE_TAG, "BR-2026-00001"]);
    expect(d.paymentTerms).toBeUndefined();
    expect(d.shippingAddress).toMatchObject({ firstName: "Jamie", lastName: "Lee Fox", provinceCode: "TX", countryCode: "US" });
  });
  it("net 30: Net 30 terms, no pay-now discount", () => {
    const d = buildDraftInput({ ...base, terms: "net_30", creditApplied: 0 }, new Date("2026-10-25T12:00:00Z")) as Record<string, any>;
    expect(d.paymentTerms).toEqual({ paymentTermsTemplateId: NET_30_TEMPLATE, paymentSchedules: [{ issuedAt: "2026-10-25T12:00:00.000Z" }] });
    expect(d.appliedDiscount).toBeUndefined();
  });
  it("normalises variant ids and spots a missing scope", () => {
    expect(variantGid("123")).toBe("gid://shopify/ProductVariant/123");
    expect(variantGid("gid://shopify/Product/1")).toBeNull();
    expect(isAccessDenied([{ message: "Access denied for draftOrderCreate field. Required access: `write_draft_orders`", extensions: { code: "ACCESS_DENIED" } }])).toBe(true);
    expect(isAccessDenied([{ message: "Throttled" }])).toBe(false);
  });
});
