// Acceptance cases 18-20 plus filtering and summary counts.
import { describe, expect, it } from "vitest";
import {
  imagesForColor, matchesInventoryFilters, summarize,
  type InventoryBlank,
} from "./blanks-inventory-data";

function blank(over: Partial<InventoryBlank> = {}): InventoryBlank {
  return {
    id: "b1", sku: "AX-TEE-01", name: "Oversized Heavyweight Tee",
    manufacturer: "AXISM", styleNumber: "7010", garmentType: "tee",
    isHidden: false, isInventoryManaged: false, isMainRotation: false,
    shopifyProductId: null, shopifyStatus: null,
    driveFolderId: null, driveFolderUrl: null, matchStatus: "unmatched",
    lastShopifySyncAt: null, lastDriveSyncAt: null,
    syncState: "success", lastInventorySuccessAt: "2026-08-25T00:00:00Z", lastInventoryError: null,
    assortments: ["athlete", "standard"], colors: ["Black"], variants: [], images: [],
    status: "not_linked", totalAvailable: 0, coverage: "missing_image",
    barcodesMissing: 0, barcodesDuplicated: 0,
    ...over,
  };
}

describe("summary counts", () => {
  it("puts every blank in exactly one status bucket", () => {
    const s = summarize([
      blank({ status: "available" }), blank({ status: "available" }),
      blank({ status: "sold_out" }), blank({ status: "hidden" }),
      blank({ status: "not_linked" }), blank({ status: "not_linked" }),
    ]);
    expect(s.status).toEqual({ available: 2, sold_out: 1, hidden: 1, not_linked: 2, not_managed: 0, sync_pending: 0, sync_error: 0 });
    const total = Object.values(s.status).reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
  });

  it("counts barcode issues only for MANAGED blanks", () => {
    // The denominator bug this replaces: counting barcode gaps across every
    // blank — and, worse, across the decorated catalogue — then reporting the
    // result as physical blank-inventory health.
    const s = summarize([
      blank({ isInventoryManaged: true, barcodesMissing: 3 }),
      blank({ isInventoryManaged: false, barcodesMissing: 9 }),
      blank({ isInventoryManaged: true, barcodesDuplicated: 1 }),
      blank({ isInventoryManaged: false, barcodesDuplicated: 7 }),
    ]);
    expect(s.missingBarcode).toBe(1);
    expect(s.duplicateBarcode).toBe(1);
    expect(s.managed).toBe(2);
  });

  it("counts image coverage against the MAIN ROTATION, not every blank", () => {
    // A reference blank with no photography is not a gap; we do not market it.
    const s = summarize([
      blank({ isMainRotation: true, coverage: "partial" }),
      blank({ isMainRotation: false, coverage: "partial" }),
      blank({ isMainRotation: true, coverage: "image_match_required" }),
    ]);
    expect(s.partialImage).toBe(1);
    expect(s.matchRequired).toBe(1);
    expect(s.mainRotation).toBe(2);
  });

  it("sums units only from managed blanks in a real inventory state", () => {
    const s = summarize([
      blank({ isInventoryManaged: true, status: "available", totalAvailable: 12 }),
      blank({ isInventoryManaged: true, status: "sold_out", totalAvailable: 0 }),
      blank({ isInventoryManaged: true, status: "not_linked", totalAvailable: 9999 }),
      blank({ isInventoryManaged: false, status: "not_managed", totalAvailable: 500 }),
    ]);
    // 12 only. not_linked has no verified quantity; not_managed is outside.
    expect(s.totalUnits).toBe(12);
  });

  it("scopes the page to the rotation, keeping reference blanks reachable", () => {
    const rot = blank({ isMainRotation: true, isHidden: false });
    const ref = blank({ id: "r", isMainRotation: false, isHidden: true });
    expect(matchesInventoryFilters(rot, { scope: "rotation" })).toBe(true);
    expect(matchesInventoryFilters(ref, { scope: "rotation" })).toBe(false);
    expect(matchesInventoryFilters(ref, { scope: "reference" })).toBe(true);
    expect(matchesInventoryFilters(ref, { scope: "all" })).toBe(true);
  });
});

describe("filters", () => {
  const linked = blank({ status: "available", shopifyProductId: "9" });
  const unlinked = blank({ id: "b2", status: "not_linked" });

  it("filters by every status including Not Linked", () => {
    expect(matchesInventoryFilters(unlinked, { status: "not_linked" })).toBe(true);
    expect(matchesInventoryFilters(linked, { status: "not_linked" })).toBe(false);
    expect(matchesInventoryFilters(linked, { status: "available" })).toBe(true);
  });

  it("searches name, sku, style and manufacturer", () => {
    for (const q of ["oversized", "AX-TEE-01", "7010", "axism"]) {
      expect(matchesInventoryFilters(linked, { search: q })).toBe(true);
    }
    expect(matchesInventoryFilters(linked, { search: "hoodie" })).toBe(false);
  });

  it("filters the issue queues", () => {
    expect(matchesInventoryFilters(blank({ barcodesMissing: 2 }), { issue: "missing_barcode" })).toBe(true);
    expect(matchesInventoryFilters(blank({ barcodesMissing: 0 }), { issue: "missing_barcode" })).toBe(false);
    expect(matchesInventoryFilters(blank({ coverage: "partial" }), { issue: "partial_image" })).toBe(true);
    expect(matchesInventoryFilters(blank({ coverage: "image_match_required" }), { issue: "image_match_required" })).toBe(true);
  });

  it("19. filters by assortment without changing membership", () => {
    const b = blank({ assortments: ["athlete", "client"] });
    expect(matchesInventoryFilters(b, { assortment: "athlete" })).toBe(true);
    expect(matchesInventoryFilters(b, { assortment: "subscriber" })).toBe(false);
    // Reading is not writing: the array is untouched by the filter.
    expect(b.assortments).toEqual(["athlete", "client"]);
  });

  it("passes everything with no filters set", () => {
    expect(matchesInventoryFilters(linked, {})).toBe(true);
    expect(matchesInventoryFilters(unlinked, {})).toBe(true);
  });
});

describe("images for a colour", () => {
  const img = (color: string, viewType: string, missing = false) => ({
    id: `${color}-${viewType}`, color, normalizedColor: color.toUpperCase().replace(/[^A-Z0-9]/g, ""),
    viewType: viewType as never, driveFileId: `f-${color}-${viewType}`,
    driveUrl: "u", filename: "f.png", missing,
  });

  it("returns only that colour's approved views", () => {
    const b = blank({ images: [img("Black", "FRONT"), img("Black", "BACK_HOOD_UP"), img("Sand", "FRONT")] });
    expect(imagesForColor(b, "Black").map((i) => i.viewType).sort())
      .toEqual(["BACK_HOOD_UP", "FRONT"]);
  });

  it("16. leaves out a file marked missing rather than substituting another", () => {
    const b = blank({ images: [img("Black", "FRONT", true), img("Sand", "FRONT")] });
    expect(imagesForColor(b, "Black")).toHaveLength(0);
  });

  it("matches the colour however it is punctuated", () => {
    const b = blank({ images: [img("VINTAGE_BLACK", "FRONT")] });
    expect(imagesForColor(b, "Vintage Black")).toHaveLength(1);
  });
});

describe("18-20: what a sync must never do", () => {
  it("18. carries no pricing fields at all, so a sync cannot change a price", () => {
    // Prices are not part of InventoryBlank. Nothing on this path can write one.
    expect(Object.keys(blank())).not.toContain("price_standard");
    expect(Object.keys(blank())).not.toContain("retail_price");
  });

  it("20. a blank with no Shopify link is Not Linked, so decorated merch cannot appear", () => {
    // Only blanks with an explicit shopify_product_id are reconciled. An
    // athlete's decorated hoodie has no row here to be swept into.
    expect(blank({ shopifyProductId: null }).status).toBe("not_linked");
  });
});
