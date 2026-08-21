// The status model is derived from four independent signals, and every surface
// reads it. If lifecycleOf() gets the precedence wrong, an unapproved product
// can look publishable — so the ordering is pinned here.
import { describe, it, expect } from "vitest";
import {
  generateProductDescription,
  generateProductTitle,
  hasUnsyncedChanges,
  isConcept,
  isShopifyReady,
  lifecycleOf,
  materialChangesSince,
  missingRequirements,
  needsReapproval,
  shopifyProductUrl,
  showsPendingClock,
  type ProductLike,
} from "./merch";

const complete = (over: Partial<ProductLike> = {}): ProductLike => ({
  id: "p1",
  title: "Mooney Collegiate Heavyweight Tee",
  description: "A tee.",
  price: 45,
  status: "draft",
  approval_state: "none",
  approval_note: null,
  blank_id: "blank-1",
  shopify_product_id: null,
  shopify_handle: null,
  shopify_sync_status: null,
  shopify_last_synced_at: null,
  updated_at: "2026-08-15T00:00:00Z",
  image_count: 2,
  design_count: 1,
  color_count: 3,
  size_count: 6,
  ...over,
});

describe("shopify readiness", () => {
  it("passes only when every commerce field is present", () => {
    expect(isShopifyReady(complete())).toBe(true);
    expect(missingRequirements(complete())).toEqual([]);
  });

  it("names exactly what is missing", () => {
    const missing = missingRequirements(complete({ blank_id: null, price: null }));
    expect(missing.map((m) => m.key).sort()).toEqual(["blank", "price"]);
  });

  it("treats a zero price as missing, not as free", () => {
    expect(isShopifyReady(complete({ price: 0 }))).toBe(false);
  });

  it("treats whitespace-only text as missing", () => {
    expect(isShopifyReady(complete({ title: "   " }))).toBe(false);
    expect(isShopifyReady(complete({ description: "" }))).toBe(false);
  });

  it("requires an image and a size range", () => {
    expect(missingRequirements(complete({ image_count: 0 })).map((m) => m.key)).toContain("image");
    expect(missingRequirements(complete({ size_count: 0 })).map((m) => m.key)).toContain("size");
  });
});

describe("isConcept", () => {
  it("is a product with something to look at but no setup", () => {
    expect(isConcept(complete({ blank_id: null, price: null }))).toBe(true);
    expect(isConcept(complete({ price: null, image_count: 0, design_count: 1 }))).toBe(true);
  });

  it("is not a concept once it is fully configured", () => {
    expect(isConcept(complete())).toBe(false);
  });

  it("is not a concept when there is nothing visual yet", () => {
    expect(isConcept(complete({ blank_id: null, price: null, image_count: 0, design_count: 0 }))).toBe(false);
  });
});

describe("lifecycleOf", () => {
  it("reports live once Shopify has the product, whatever else is true", () => {
    expect(lifecycleOf(complete({ shopify_product_id: "123", approval_state: "approved" }))).toBe("live");
  });

  it("puts archived above everything", () => {
    expect(lifecycleOf(complete({ status: "archived", shopify_product_id: "123" }))).toBe("archived");
  });

  it("never calls an unapproved product ready, however complete it is", () => {
    expect(lifecycleOf(complete({ approval_state: "none" }))).toBe("draft");
    expect(lifecycleOf(complete({ approval_state: "pending" }))).toBe("awaiting_approval");
  });

  it("separates approved-and-ready from approved-but-incomplete", () => {
    expect(lifecycleOf(complete({ approval_state: "approved" }))).toBe("ready_for_shopify");
    expect(lifecycleOf(complete({ approval_state: "approved", price: null }))).toBe("approved_setup_pending");
  });

  it("surfaces a rejection as changes requested", () => {
    expect(lifecycleOf(complete({ approval_state: "rejected", approval_note: "bigger graphic" }))).toBe("changes_requested");
  });

  it("shows concept for a half-built product with imagery", () => {
    expect(lifecycleOf(complete({ blank_id: null, price: null }))).toBe("concept");
  });

  it("shows draft for an empty shell", () => {
    expect(lifecycleOf(complete({ blank_id: null, price: null, image_count: 0, design_count: 0 }))).toBe("draft");
  });
});

describe("showsPendingClock", () => {
  it("appears whenever setup is incomplete", () => {
    expect(showsPendingClock(complete({ price: null }))).toBe(true);
    expect(showsPendingClock(complete({ approval_state: "approved", blank_id: null }))).toBe(true);
  });

  it("disappears once the product is fully configured", () => {
    expect(showsPendingClock(complete())).toBe(false);
  });

  it("never shows on live or archived products", () => {
    expect(showsPendingClock(complete({ shopify_product_id: "1", price: null }))).toBe(false);
    expect(showsPendingClock(complete({ status: "archived", price: null }))).toBe(false);
  });
});

describe("hasUnsyncedChanges", () => {
  it("is false for products that were never published", () => {
    expect(hasUnsyncedChanges(complete())).toBe(false);
  });

  it("is true when the product changed after its last sync", () => {
    expect(hasUnsyncedChanges(complete({
      shopify_product_id: "1",
      shopify_last_synced_at: "2026-08-14T00:00:00Z",
      updated_at: "2026-08-15T00:00:00Z",
    }))).toBe(true);
  });

  it("is false when the sync is newer than the edit", () => {
    expect(hasUnsyncedChanges(complete({
      shopify_product_id: "1",
      shopify_last_synced_at: "2026-08-16T00:00:00Z",
      updated_at: "2026-08-15T00:00:00Z",
    }))).toBe(false);
  });

  it("tolerates the write-then-sync ordering within a second", () => {
    expect(hasUnsyncedChanges(complete({
      shopify_product_id: "1",
      updated_at: "2026-08-15T00:00:00.500Z",
      shopify_last_synced_at: "2026-08-15T00:00:00.000Z",
    }))).toBe(false);
  });
});

describe("reapproval", () => {
  const snapshot = { title: "Tee", price: 45, colors: ["Black"], sizes: ["S", "M"] };

  it("flags material changes", () => {
    expect(materialChangesSince(snapshot, { ...snapshot, price: 50 })).toEqual(["price"]);
    expect(needsReapproval(snapshot, { ...snapshot, title: "Other" })).toBe(true);
  });

  it("ignores fields outside the material set", () => {
    expect(needsReapproval(snapshot, { ...snapshot, ...({ notes: "internal" } as object) })).toBe(false);
  });

  it("does not fire on identical values in a different object order", () => {
    expect(needsReapproval(snapshot, { price: 45, title: "Tee", sizes: ["S", "M"], colors: ["Black"] })).toBe(false);
  });

  it("detects size range changes, since that is what the athlete saw", () => {
    expect(materialChangesSince(snapshot, { ...snapshot, sizes: ["S", "M", "L"] })).toEqual(["sizes"]);
  });

  it("says nothing changed when there is no snapshot to compare against", () => {
    expect(needsReapproval(null, snapshot)).toBe(false);
  });
});

describe("generated copy", () => {
  it("builds athlete + collection + garment", () => {
    expect(generateProductTitle({
      athleteName: "Darnell Mooney",
      collectionName: "Collegiate",
      blankName: "Heavyweight Tee",
    })).toBe("Darnell Mooney Collegiate Heavyweight Tee");
  });

  it("collapses words the collection already repeats", () => {
    expect(generateProductTitle({
      athleteName: "Darnell Mooney",
      collectionName: "Mooney Collegiate",
      blankName: "Heavyweight Tee",
    })).toBe("Darnell Mooney Collegiate Heavyweight Tee");
  });

  it("falls back to the garment type when there is no blank name", () => {
    expect(generateProductTitle({ athleteName: "Nick Bosa", garmentType: "zip_hoodie" })).toBe("Nick Bosa Zip Hoodie");
  });

  it("writes a description from the blank's specs rather than marketing fluff", () => {
    const out = generateProductDescription({
      athleteName: "Darnell Mooney",
      collectionName: "Mooney Collegiate",
      blankName: "Heavyweight Tee",
      designName: "Mooney Collegiate 01",
      color: "Black",
      fabric: "100% ring-spun cotton",
      fabricSpecs: { weight_oz: 6.5 },
    });
    expect(out).toContain("Mooney Collegiate collection");
    expect(out).toContain("Mooney Collegiate 01");
    expect(out).toContain("Shown in Black");
    expect(out).toContain("6.5 oz");
    expect(out).not.toMatch(/amazing|incredible|must-have/i);
  });

  it("still produces something usable with almost no input", () => {
    expect(generateProductDescription({ garmentType: "hat" })).toContain("Hat");
  });
});

describe("shopifyProductUrl", () => {
  it("builds the storefront link from the stored handle", () => {
    expect(shopifyProductUrl("mooney-tee")).toBe("https://athletexclusive.com/products/mooney-tee");
  });

  it("returns null rather than a broken link", () => {
    expect(shopifyProductUrl(null)).toBeNull();
    expect(shopifyProductUrl("")).toBeNull();
  });
});
