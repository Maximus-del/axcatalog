import { describe, expect, it } from "vitest";
import { changedFields, draftOf, garmentOf, rowError, rowMaths, type SheetProduct } from "./pricing-sheet";

const tee: SheetProduct = {
  id: "t",
  title: "Mooney World Signature Jersey #11 Tee — V1",
  status: "published",
  garment: "tee",
  onShopify: false,
  blankName: "DRI EASE OVERSIZED TEE",
  blankDefaultCost: 12,
  retail: 45,
  athletePrice: null,
  ruleAthletePrice: 18,
  pricing: { blankCost: null, printCost: null, otherCost: null, sharePercent: null, notes: "" },
};
const gross = { revenueSharePercent: 20, splitBasis: "gross" as const };

describe("rowMaths", () => {
  it("uses the blank's cost until AX overrides it, and flags what's missing", () => {
    const m = rowMaths(tee, draftOf(tee), { revenueSharePercent: null, splitBasis: "gross" });
    expect(m.blankCost).toBe(12);
    expect(m.totalCost).toBe(12);
    expect(m.costPercent).toBe(26.7);
    expect(m.bulkPrice).toBe(18);
    expect(m.bulkIsRule).toBe(true);
    expect(m.bulkProfit).toBe(6);
    expect(m.missing).toEqual(["print", "share"]);
    expect(m.clientPerSale).toBeNull();
  });

  it("splits a store sale on the gross", () => {
    const m = rowMaths(tee, { ...draftOf(tee), printCost: 6, otherCost: 1 }, gross);
    expect(m.totalCost).toBe(19);
    expect(m.clientPerSale).toBe(9); // 20% of $45
    expect(m.axPerSale).toBe(17); // 45 - 19 - 9
    expect(m.axMarginPercent).toBe(37.8);
    expect(m.missing).toEqual([]);
  });

  it("splits on profit when the terms say so, and a per-product share wins", () => {
    const m = rowMaths(tee, { ...draftOf(tee), printCost: 6, otherCost: 1, sharePercent: 50 }, { revenueSharePercent: 20, splitBasis: "profit" });
    expect(m.sharePercent).toBe(50);
    expect(m.clientPerSale).toBe(13); // 50% of (45 - 19)
    expect(m.axPerSale).toBe(13);
  });

  it("a set bulk price replaces the rule", () => {
    const m = rowMaths(tee, { ...draftOf(tee), printCost: 6, athletePrice: 22 }, gross);
    expect(m.bulkPrice).toBe(22);
    expect(m.bulkIsRule).toBe(false);
    expect(m.bulkProfit).toBe(4);
    expect(m.bulkMarginPercent).toBe(18.2);
  });
});

describe("editing", () => {
  it("knows exactly which fields changed", () => {
    expect(changedFields(tee, draftOf(tee))).toEqual([]);
    expect(changedFields(tee, { ...draftOf(tee), printCost: 6, notes: "" })).toEqual(["printCost"]);
  });

  it("refuses bad numbers and Shopify retail edits", () => {
    expect(rowError(tee, { ...draftOf(tee), printCost: -1 })).toMatch(/positive/);
    expect(rowError(tee, { ...draftOf(tee), sharePercent: 120 })).toMatch(/100/);
    expect(rowError({ ...tee, onShopify: true }, { ...draftOf(tee), retail: 50 })).toMatch(/Shopify/);
    expect(rowError(tee, { ...draftOf(tee), retail: 50 })).toBeNull();
  });

  it("reads the garment from the blank, then the title", () => {
    expect(garmentOf("Mooney World WRLD #1 Hoodie", null)).toBe("hoodie");
    expect(garmentOf("Something", "tee")).toBe("tee");
    expect(garmentOf("Moon's House Mug", null)).toBe("other");
  });
});
