import { describe, expect, it } from "vitest";
import {
  arrangeRows,
  cellKey,
  cellRange,
  changedFields,
  detectSides,
  draftOf,
  fillCells,
  garmentOf,
  presetCosts,
  rowError,
  rowMaths,
  type Presets,
  type SheetProduct,
} from "./pricing-sheet";

const TEE = "da7d45ff";
const HOOD = "cec81b15";

const make = (over: Partial<SheetProduct> & { id: string }): SheetProduct => ({
  title: over.id,
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
  pricing: { blankCost: null, printCost: null, otherCost: null, sharePercent: null, printSides: null, notes: "" },
  ...over,
});

const tee = make({ id: "tee-fb", title: "Signature Jersey #11 Tee" });
const teeFront = make({ id: "tee-f", title: "WRLD #11 Tee — V1", detectedSides: "front" });
const hoodie = make({ id: "hood-fb", title: "WRLD #11 Hoodie", garment: "hoodie", blankId: HOOD, blankName: "Garment-Wash Hoodie 14oz", blankCatalogCost: 22.25, retail: 65, ruleAthletePrice: 35 });

const presets: Presets = {
  [TEE]: { blank: null, front: 5, back: 4 },
  [HOOD]: { blank: 23, front: 6, back: 5 },
};
const gross = { revenueSharePercent: 20, splitBasis: "gross" as const };

describe("presets by blank and print", () => {
  it("front only pays the front preset; front + back pays both", () => {
    expect(presetCosts(teeFront, "front", presets)).toEqual({ blank: 12, print: 5 });
    expect(presetCosts(tee, "front_back", presets)).toEqual({ blank: 12, print: 9 });
    expect(presetCosts(hoodie, "front_back", presets)).toEqual({ blank: 23, print: 11 });
  });

  it("a row uses presets until it overrides them", () => {
    const m = rowMaths(tee, draftOf(tee), gross, presets);
    expect(m).toMatchObject({ blankCost: 12, printCost: 9, totalCost: 21, printFromPreset: true, blankFromPreset: true });
    const o = rowMaths(tee, { ...draftOf(tee), printCost: 7.5 }, gross, presets);
    expect(o).toMatchObject({ printCost: 7.5, printFromPreset: false, totalCost: 19.5 });
  });

  it("switching a row to front only drops the back print", () => {
    const m = rowMaths(tee, { ...draftOf(tee), printSides: "front" }, gross, presets);
    expect(m.sides).toBe("front");
    expect(m.printCost).toBe(5);
  });

  it("no presets and no print sides → flagged, not guessed", () => {
    const m = rowMaths(make({ id: "x", detectedSides: null }), draftOf(make({ id: "x", detectedSides: null })), { revenueSharePercent: null, splitBasis: "gross" });
    expect(m.missing).toEqual(["sides", "print", "share"]);
    expect(m.printCost).toBeNull();
  });
});

describe("rowMaths", () => {
  it("splits a store sale on the gross", () => {
    const m = rowMaths(tee, { ...draftOf(tee), otherCost: 1 }, gross, presets);
    expect(m.totalCost).toBe(22);
    expect(m.clientPerSale).toBe(9);
    expect(m.axPerSale).toBe(14);
    expect(m.axMarginPercent).toBe(31.1);
  });

  it("splits on profit, and a per-product share wins", () => {
    const m = rowMaths(tee, { ...draftOf(tee), sharePercent: 50 }, { revenueSharePercent: 20, splitBasis: "profit" }, presets);
    expect(m.clientPerSale).toBe(12); // 50% of (45 - 21)
    expect(m.axPerSale).toBe(12);
  });

  it("a set bulk price replaces the rule", () => {
    const m = rowMaths(tee, { ...draftOf(tee), athletePrice: 25 }, gross, presets);
    expect(m).toMatchObject({ bulkPrice: 25, bulkIsRule: false, bulkProfit: 4, bulkMarginPercent: 16 });
  });
});

describe("arrange", () => {
  const all = [hoodie, tee, teeFront];
  const opts = { terms: gross, presets };

  it("groups by blank, front before front + back inside each", () => {
    const g = arrangeRows(all, {}, { ...opts, groupBy: "blank", sortBy: "print" });
    expect(g.map((x) => x.label)).toEqual(["DRI EASE OVERSIZED TEE", "Garment-Wash Hoodie 14oz"]);
    expect(g[0].rows.map((r) => r.id)).toEqual(["tee-f", "tee-fb"]);
  });

  it("groups by blank and print together", () => {
    const g = arrangeRows(all, {}, { ...opts, groupBy: "blank_print", sortBy: "product" });
    expect(g.map((x) => x.label)).toEqual([
      "DRI EASE OVERSIZED TEE · Front",
      "DRI EASE OVERSIZED TEE · Front + back",
      "Garment-Wash Hoodie 14oz · Front + back",
    ]);
  });

  it("groups by print across blanks, and a draft print choice moves the row", () => {
    const g = arrangeRows(all, { [tee.id]: { ...draftOf(tee), printSides: "front" } }, { ...opts, groupBy: "print", sortBy: "blank" });
    expect(g[0].label).toBe("Front");
    expect(g[0].rows.map((r) => r.id).sort()).toEqual(["tee-f", "tee-fb"]);
  });

  it("sorts by AX take, best first", () => {
    const g = arrangeRows(all, {}, { ...opts, groupBy: "none", sortBy: "ax" });
    expect(g[0].rows.map((r) => r.id)).toEqual(["tee-f", "hood-fb", "tee-fb"]); // $19, $18, $15
  });
});

describe("selecting and filling cells", () => {
  const order = ["hood-fb", "tee-fb", "tee-f"];

  it("a drag or shift-click selects the rectangle between two cells", () => {
    expect(cellRange(cellKey("hood-fb", "printCost"), cellKey("tee-f", "printCost"), order)).toEqual([
      cellKey("hood-fb", "printCost"),
      cellKey("tee-fb", "printCost"),
      cellKey("tee-f", "printCost"),
    ]);
    expect(cellRange(cellKey("tee-f", "otherCost"), cellKey("tee-fb", "blankCost"), order)).toHaveLength(6);
  });

  it("fills every selected cell with one value and skips Shopify retail", () => {
    const shop = make({ id: "shop", onShopify: true });
    const r = fillCells([tee, teeFront, shop], {}, [cellKey("tee-fb", "retail"), cellKey("tee-f", "retail"), cellKey("shop", "retail")], 50);
    expect(r).toMatchObject({ filled: 2, skipped: 1 });
    expect(r.drafts["tee-fb"].retail).toBe(50);
    expect(r.drafts.shop).toBeUndefined();
  });

  it("clearing a cell sends it back to its preset", () => {
    const set = fillCells([tee], {}, [cellKey("tee-fb", "printCost")], 8).drafts;
    const cleared = fillCells([tee], set, [cellKey("tee-fb", "printCost")], null).drafts;
    expect(rowMaths(tee, cleared[tee.id], gross, presets).printCost).toBe(9);
    expect(changedFields(tee, cleared[tee.id])).toEqual([]);
  });
});

describe("helpers", () => {
  it("reads print sides from the pictures", () => {
    expect(detectSides([{ file_name: "MW-X_V1_CC_HOD475_JetBlack_BACK.png", metadata: { source: "drive" } }])).toBe("front_back");
    expect(detectSides([{ file_name: "MW-X_FRONT.png", metadata: { source: "drive" } }])).toBe("front");
    expect(detectSides([{ file_name: "shopify-1.jpg", metadata: {} }])).toBeNull();
    expect(detectSides([{ file_name: "a.png", metadata: { portal_view: "back" } }])).toBe("front_back");
  });

  it("refuses bad numbers and Shopify retail edits", () => {
    expect(rowError(tee, { ...draftOf(tee), printCost: -1 })).toMatch(/positive/);
    expect(rowError(tee, { ...draftOf(tee), sharePercent: 120 })).toMatch(/100/);
    expect(rowError({ ...tee, onShopify: true }, { ...draftOf(tee), retail: 50 })).toMatch(/Shopify/);
  });

  it("reads the garment from the blank, then the title", () => {
    expect(garmentOf("WRLD #1 Hoodie", null)).toBe("hoodie");
    expect(garmentOf("Something", "tee")).toBe("tee");
  });
});
