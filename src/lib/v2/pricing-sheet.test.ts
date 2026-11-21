import { describe, expect, it } from "vitest";
import {
  arrangeRows,
  cellKey,
  cellRange,
  changedFields,
  detectSides,
  draftOf,
  emptyPreset,
  fillCells,
  garmentOf,
  presetBreakdown,
  presetCosts,
  previewOf,
  backPreviewOf,
  printLines,
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
  pricing: { blankCost: null, printCost: null, otherCost: null, clientPrice: null, sharePercent: null, printSides: null, notes: "" },
  ...over,
});

const tee = make({ id: "tee-fb", title: "Signature Jersey #11 Tee" });
const teeFront = make({ id: "tee-f", title: "WRLD #11 Tee — V1", detectedSides: "front" });
const hoodie = make({ id: "hood-fb", title: "WRLD #11 Hoodie", garment: "hoodie", blankId: HOOD, blankName: "Garment-Wash Hoodie 14oz", blankCatalogCost: 22.25, retail: 65, ruleAthletePrice: 35 });

// Chase's example: blank $12 → $18, front $2 → $5, back $2 → $3 (front + back = $8).
const presets: Presets = {
  [TEE]: { blank: { cost: 12, price: 18 }, front: { cost: 2, price: 5 }, back: { cost: 2, price: 3 }, services: { cost: null, price: null } },
  [HOOD]: { blank: { cost: null, price: null }, front: { cost: 2, price: 5 }, back: { cost: 2, price: 3 }, services: { cost: null, price: null } },
};
// AX keeps 10% of the profit after the client's cost.
const profit90 = { revenueSharePercent: 90, splitBasis: "profit" as const };

describe("the C-level breakdown per blank", () => {
  it("lines up our cost, the client price and our margin line by line", () => {
    const fb = presetBreakdown(presets[TEE], "front_back", 12);
    expect(fb.lines.map((l) => [l.component, l.cost, l.price, l.margin])).toEqual([
      ["blank", 12, 18, 6],
      ["front", 2, 5, 3],
      ["back", 2, 3, 1],
      ["services", null, null, null],
    ]);
    expect(fb).toMatchObject({ cost: 16, price: 26, margin: 10, marginPercent: 38.5 });
    expect(presetBreakdown(presets[TEE], "front", 12)).toMatchObject({ cost: 14, price: 23, margin: 9 });
  });

  it("has no client price until the blank is priced; the catalogue cost fills an unset blank cost", () => {
    const h = presetBreakdown(presets[HOOD], "front_back", 22.25);
    expect(h).toMatchObject({ cost: 26.25, price: null, margin: null });
    expect(presetBreakdown(emptyPreset(), null, 12)).toMatchObject({ cost: 12, price: null });
  });
});

describe("rowMaths", () => {
  it("front + back tee: $16 cost, $26 to the client, $10 to AX per unit", () => {
    const m = rowMaths(tee, draftOf(tee), profit90, presets);
    expect(m).toMatchObject({ trueCost: 16, clientPrice: 26, clientPriceSource: "preset", unitMargin: 10, storedPriceTarget: 26, priceChanges: true });
  });

  it("a store sale splits the profit after the client's cost", () => {
    const m = rowMaths(tee, draftOf(tee), profit90, presets);
    // $45 retail − $26 client cost = $19 profit; client keeps 90% ($17.10), AX 10% ($1.90).
    expect(m).toMatchObject({ storeProfit: 19, clientPerSale: 17.1, axSplit: 1.9 });
    // AX overall: $10 on the unit + $1.90 split.
    expect(m.axPerSale).toBe(11.9);
  });

  it("front only drops the back line from cost and price", () => {
    const m = rowMaths(teeFront, draftOf(teeFront), profit90, presets);
    expect(m).toMatchObject({ trueCost: 14, clientPrice: 23, unitMargin: 9, storeProfit: 22, clientPerSale: 19.8, axSplit: 2.2, axPerSale: 11.2 });
  });

  it("a row's client price overrides the presets; unpriced falls back to the rule and is flagged", () => {
    expect(rowMaths(tee, { ...draftOf(tee), clientPrice: 24 }, profit90, presets)).toMatchObject({ clientPrice: 24, clientPriceSource: "row", unitMargin: 8 });
    const h = rowMaths(hoodie, draftOf(hoodie), profit90, presets);
    expect(h).toMatchObject({ clientPrice: 35, clientPriceSource: "rule", storedPriceTarget: null, priceChanges: false });
    expect(h.missing).toContain("price");
  });

  it("gross basis gives the client a share of retail instead", () => {
    const m = rowMaths(tee, draftOf(tee), { revenueSharePercent: 20, splitBasis: "gross" }, presets);
    expect(m).toMatchObject({ clientPerSale: 9, axSplit: null, axPerSale: 20 });
  });

  it("a saved price that matches is not a change", () => {
    const saved = { ...tee, athletePrice: 26 };
    expect(rowMaths(saved, draftOf(saved), profit90, presets).priceChanges).toBe(false);
  });
});

describe("presetCosts", () => {
  it("gives the cost lines and the client price", () => {
    expect(presetCosts(tee, "front_back", presets)).toEqual({ blank: 12, print: 4, services: null, clientPrice: 26 });
    expect(presetCosts(teeFront, "front", presets)).toEqual({ blank: 12, print: 2, services: null, clientPrice: 23 });
  });
});

describe("arrange", () => {
  const all = [hoodie, tee, teeFront];
  const opts = { terms: profit90, presets };

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

  it("sorts by AX per unit, best first", () => {
    const g = arrangeRows(all, {}, { ...opts, groupBy: "none", sortBy: "unit" });
    expect(g[0].rows.map((r) => r.id)).toEqual(["tee-fb", "tee-f", "hood-fb"]); // $10, $9, $8.75
  });
});

describe("selecting and filling cells", () => {
  const order = ["hood-fb", "tee-fb", "tee-f"];

  it("a drag or shift-click selects the rectangle between two cells", () => {
    expect(cellRange(cellKey("hood-fb", "printCost"), cellKey("tee-f", "printCost"), order)).toHaveLength(3);
    expect(cellRange(cellKey("tee-f", "otherCost"), cellKey("tee-fb", "blankCost"), order)).toHaveLength(6);
  });

  it("fills every selected cell and skips Shopify retail", () => {
    const shop = make({ id: "shop", onShopify: true });
    const r = fillCells([tee, teeFront, shop], {}, [cellKey("tee-fb", "retail"), cellKey("tee-f", "retail"), cellKey("shop", "retail")], 50);
    expect(r).toMatchObject({ filled: 2, skipped: 1 });
  });

  it("clearing a cell sends it back to its preset", () => {
    const set = fillCells([tee], {}, [cellKey("tee-fb", "clientPrice")], 30).drafts;
    const cleared = fillCells([tee], set, [cellKey("tee-fb", "clientPrice")], null).drafts;
    expect(rowMaths(tee, cleared[tee.id], profit90, presets).clientPrice).toBe(26);
    expect(changedFields(tee, cleared[tee.id])).toEqual([]);
  });
});

describe("helpers", () => {
  it("reads print sides from the pictures", () => {
    expect(detectSides([{ file_name: "MW-X_V1_CC_HOD475_JetBlack_BACK.png", metadata: { source: "drive" } }])).toBe("front_back");
    expect(detectSides([{ file_name: "MW-X_FRONT.png", metadata: { source: "drive" } }])).toBe("front");
    expect(detectSides([{ file_name: "shopify-1.jpg", metadata: {} }])).toBeNull();
  });

  it("refuses bad numbers and Shopify retail edits", () => {
    expect(rowError(tee, { ...draftOf(tee), clientPrice: -1 })).toMatch(/positive/);
    expect(rowError(tee, { ...draftOf(tee), sharePercent: 120 })).toMatch(/100/);
    expect(rowError({ ...tee, onShopify: true }, { ...draftOf(tee), retail: 50 })).toMatch(/Shopify/);
  });

  it("reads the garment from the blank, then the title", () => {
    expect(garmentOf("WRLD #1 Hoodie", null)).toBe("hoodie");
    expect(garmentOf("Something", "tee")).toBe("tee");
  });
});

describe("printLines", () => {
  it("collapses a blank to one line per print type, sharing one breakdown", () => {
    const tee2 = make({ id: "tee-fb2", title: "Unleashed #11 Tee" });
    const lines = printLines([tee, tee2, teeFront], {}, profit90, presets);
    expect(lines.map((l) => [l.sides, l.rows.length, l.shared.clientPrice, l.custom])).toEqual([
      ["front", 1, 23, 0],
      ["front_back", 2, 26, 0],
    ]);
  });

  it("counts a product with its own numbers as custom, without moving the line", () => {
    const tee2 = make({ id: "tee-fb2" });
    const lines = printLines([tee, tee2], { [tee2.id]: { ...draftOf(tee2), clientPrice: 30 } }, profit90, presets);
    expect(lines[0]).toMatchObject({ custom: 1 });
    expect(lines[0].shared.clientPrice).toBe(26);
  });
});

describe("preview pictures", () => {
  const img = (file_name: string, sort_order: number, metadata: Record<string, unknown> = {}) => ({
    file_name,
    sort_order,
    storage_bucket: "external",
    storage_path: `https://drive.example/${file_name}`,
    metadata,
  });
  it("one front and one back, in the same colourway, ignoring model shots", () => {
    const imgs = [
      img("model-1.jpg", 0),
      img("X_Graphite_BACK.png", 3, { drive_color: "GRAPHITE" }),
      img("X_Black_FRONT.png", 1, { drive_color: "BLACK" }),
      img("X_Black_BACK.png", 2, { drive_color: "BLACK" }),
    ];
    expect(previewOf(imgs)).toBe("https://drive.example/X_Black_FRONT.png");
    expect(backPreviewOf(imgs)).toBe("https://drive.example/X_Black_BACK.png");
  });
  it("AX's chosen sides win, and a front-only product has no back", () => {
    expect(backPreviewOf([img("a.png", 0, { portal_view: "front" }), img("b.png", 1, { portal_view: "back" })])).toBe("https://drive.example/b.png");
    expect(backPreviewOf([img("X_FRONT.png", 0)])).toBeNull();
  });
});
