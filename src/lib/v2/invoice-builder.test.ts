import { describe, expect, it } from "vitest";
import { invoiceFigures, ladderPercent, orderNumber, type InvoiceLineDraft } from "./invoice-builder";
import { draftOf, rowMaths, type Presets, type SheetProduct } from "./pricing-sheet";

const TEE = "tee";
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
  retail: 45,
  athletePrice: null,
  ruleAthletePrice: 18,
  pricing: { blankCost: null, printCost: null, otherCost: null, clientPrice: null, sharePercent: null, printSides: null, notes: "" },
  ...over,
});
const presets: Presets = {
  [TEE]: { blank: { cost: 12, price: 18 }, front: { cost: 2, price: 5 }, back: { cost: 2, price: 3 }, services: { cost: null, price: null } },
};
const terms = { revenueSharePercent: 90, splitBasis: "profit" as const };
const fb = mk("fb");
const front = mk("front", { detectedSides: "front" });
const products = new Map([fb, front].map((p) => [p.id, p]));
const maths = new Map([fb, front].map((p) => [p.id, rowMaths(p, draftOf(p), terms, presets)]));
const line = (productId: string, quantity: number, over: Partial<InvoiceLineDraft> = {}): InvoiceLineDraft => ({
  productId,
  quantity,
  unitPrice: null,
  resalePrice: null,
  notes: "",
  ...over,
});

describe("invoice figures", () => {
  it("30 front + back tees and 10 front tees, no discount: the client pays, AX keeps the difference", () => {
    const f = invoiceFigures([line("fb", 30), line("front", 10)], products, maths, { discountPercent: 0, mode: "giveaway" });
    // 30 × $26 + 10 × $23 = $1,010. Our cost 30 × $16 + 10 × $14 = $620.
    expect(f).toMatchObject({ units: 40, subtotal: 1010, discount: 0, total: 1010 });
    expect(f.ax).toMatchObject({ revenue: 1010, trueCost: 620, profit: 390, marginPercent: 38.6, missingCost: 0 });
    expect(f.client).toMatchObject({ mode: "giveaway", cost: 1010, costPerPiece: 25.25, revenue: null, profit: null });
  });

  it("a volume discount comes off the client's total and AX's profit", () => {
    const f = invoiceFigures([line("fb", 50)], products, maths, { discountPercent: ladderPercent(50, [{ min_qty: 50, discount_pct: 10 }]), mode: "giveaway" });
    expect(f).toMatchObject({ discountPercent: 10, subtotal: 1300, discount: 130, total: 1170 });
    expect(f.ax.profit).toBe(370); // 1,170 − 50 × $16
  });

  it("selling at retail shows the client's revenue and profit", () => {
    const f = invoiceFigures([line("fb", 30)], products, maths, { discountPercent: 0, mode: "sell" });
    expect(f.client).toMatchObject({ revenue: 1350, profit: 570, profitPerPiece: 19 });
    const camp = invoiceFigures([line("fb", 30, { resalePrice: 35 })], products, maths, { discountPercent: 0, mode: "sell" });
    expect(camp.client).toMatchObject({ revenue: 1050, profit: 270 });
  });

  it("a line price override applies to this invoice only, and zero-quantity lines drop out", () => {
    const f = invoiceFigures([line("fb", 10, { unitPrice: 24 }), line("front", 0)], products, maths, { discountPercent: 0, mode: "giveaway" });
    expect(f.lines).toHaveLength(1);
    expect(f.total).toBe(240);
    expect(f.ax.profit).toBe(80);
  });

  it("an unknown cost leaves AX's profit unknown rather than overstated", () => {
    const nocost = mk("nc", { blankId: null, blankCatalogCost: null });
    const p = new Map([...products, [nocost.id, nocost]]);
    const m = new Map([...maths, [nocost.id, rowMaths(nocost, draftOf(nocost), terms, presets)]]);
    const f = invoiceFigures([line("fb", 1), line("nc", 1)], p, m, { discountPercent: 0, mode: "giveaway" });
    expect(f.ax).toMatchObject({ trueCost: null, profit: null, missingCost: 1 });
  });
});

describe("helpers", () => {
  it("ladder and order number", () => {
    const tiers = [{ min_qty: 50, discount_pct: 10 }, { min_qty: 100, discount_pct: 15 }];
    expect(ladderPercent(49, tiers)).toBe(0);
    expect(ladderPercent(120, tiers)).toBe(15);
    expect(orderNumber(new Date("2026-10-20T12:00:00Z"), () => 0.04213)).toBe("BR-2026-04213");
  });
});
