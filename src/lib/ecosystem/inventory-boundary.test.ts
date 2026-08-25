// The inventory boundary, proved rather than asserted.
//
// The property under test: an unapproved Shopify product cannot influence
// blank inventory by ANY path. Not through titles, not vendors, not barcodes,
// not quantities, not Drive folders, not looking like a blank. The only way in
// is a person setting is_inventory_managed = true.
//
// These tests are adversarial on purpose. Each one takes a decorated athlete
// product — the exact thing that must stay out — and gives it every property
// that might tempt a heuristic into adopting it.
import { describe, expect, it } from "vitest";
import {
  availabilityStatusOf, countsTowardInventory, statusOfProduct,
  type AvailabilityStatus, type VariantLike,
} from "./blank-inventory";
import {
  selectManagedForReconcile, isManagedInventoryItem, summarizeManaged,
  type ManagedBlank,
} from "./inventory-boundary";

const LOC = { shopify_location_id: "loc1", location_name: "Main" };
const variant = (qty: number, over: Partial<VariantLike> = {}): VariantLike => ({
  shopify_variant_id: "v1", color: "Black", size: "M", sku: "SKU", barcode: "BC1",
  levels: [{ ...LOC, available_quantity: qty }],
  ...over,
});

function managed(over: Partial<ManagedBlank> = {}): ManagedBlank {
  return {
    id: "b1", sku: "AX-TEE-01", name: "Oversized Heavyweight Tee",
    isInventoryManaged: true, isMainRotation: true, isHidden: false,
    shopifyProductId: "gid://shopify/Product/1",
    variants: [variant(5)],
    ...over,
  };
}

/** A decorated athlete product dressed up to look as blank-like as possible. */
function decorated(over: Partial<ManagedBlank> = {}): ManagedBlank {
  return {
    id: "d1", sku: null, name: "Jesus Bless Hoodie",
    isInventoryManaged: false, isMainRotation: false, isHidden: true,
    shopifyProductId: "gid://shopify/Product/999",
    variants: [variant(250, { shopify_variant_id: "dv1", barcode: "BC1" })],
    ...over,
  };
}

describe("an unapproved product cannot enter inventory", () => {
  it("is Not Managed even with a Shopify link and plenty of stock", () => {
    expect(availabilityStatusOf({
      isHidden: false, isInventoryManaged: false,
      shopifyProductId: "gid://shopify/Product/999", totalAvailable: 250,
    })).toBe("not_managed");
  });

  it("is never Sold Out, however zero its quantity looks", () => {
    // The failure this prevents: reporting Sold Out for a garment nobody ever
    // counted. We have no basis for that claim.
    for (const qty of [0, -12, 500]) {
      const s = availabilityStatusOf({
        isHidden: false, isInventoryManaged: false,
        shopifyProductId: "gid://shopify/Product/999", totalAvailable: qty,
      });
      expect(s).toBe("not_managed");
      expect(s).not.toBe("sold_out");
    }
  });

  it("is never Not Linked either, so it cannot appear in a 'needs linking' queue", () => {
    expect(availabilityStatusOf({
      isHidden: false, isInventoryManaged: false, shopifyProductId: null, totalAvailable: 0,
    })).toBe("not_managed");
  });

  it("checks managed BEFORE the link, so the order cannot be reversed by accident", () => {
    const unmanagedUnlinked = availabilityStatusOf({
      isHidden: false, isInventoryManaged: false, shopifyProductId: null, totalAvailable: 0,
    });
    expect(unmanagedUnlinked).toBe("not_managed");
  });

  it("still lets Hidden win over everything, including the boundary", () => {
    expect(availabilityStatusOf({
      isHidden: true, isInventoryManaged: false, shopifyProductId: null, totalAvailable: 0,
    })).toBe("hidden");
  });

  it("defaults to unmanaged when the flag is simply absent", () => {
    // A caller that forgets to pass the flag must fail CLOSED, not open.
    expect(availabilityStatusOf({
      isHidden: false, shopifyProductId: "gid://p/1", totalAvailable: 99,
    })).toBe("not_managed");
  });
});

describe("countsTowardInventory", () => {
  it("admits only the two states that are a real claim about stock", () => {
    const all: AvailabilityStatus[] = ["available", "sold_out", "hidden", "not_linked", "not_managed"];
    expect(all.filter(countsTowardInventory)).toEqual(["available", "sold_out"]);
  });
});

describe("reconciliation starts from the allowlist, not from Shopify", () => {
  it("selects only approved, linked blanks", () => {
    const rows = [
      managed({ id: "ok" }),
      managed({ id: "approved-but-unlinked", shopifyProductId: null }),
      decorated({ id: "decorated" }),
      managed({ id: "not-approved", isInventoryManaged: false }),
    ];
    const sel = selectManagedForReconcile(rows);
    expect(sel.reconcile.map((b) => b.id)).toEqual(["ok"]);
    expect(sel.approvedButUnlinked.map((b) => b.id)).toEqual(["approved-but-unlinked"]);
    expect(sel.skipped.map((b) => b.id).sort()).toEqual(["decorated", "not-approved"]);
  });

  it("produces the exact Shopify id allowlist and nothing else", () => {
    const sel = selectManagedForReconcile([
      managed({ id: "a", shopifyProductId: "gid://shopify/Product/1" }),
      decorated({ id: "d", shopifyProductId: "gid://shopify/Product/999" }),
    ]);
    expect([...sel.shopifyProductIds]).toEqual(["gid://shopify/Product/1"]);
    expect(sel.shopifyProductIds.has("gid://shopify/Product/999")).toBe(false);
  });

  it("returns an empty allowlist when nothing is approved — reconciling nothing", () => {
    // The state we are in RIGHT NOW. Reconciliation must be a no-op, not a
    // whole-store scan.
    const sel = selectManagedForReconcile([decorated(), decorated({ id: "d2" })]);
    expect(sel.reconcile).toHaveLength(0);
    expect(sel.shopifyProductIds.size).toBe(0);
  });

  it("does not adopt a product just because its title reads like a blank", () => {
    const tempting = decorated({
      id: "trap",
      name: "Cotton Collective Heavy Crew 15 oz",   // identical to a real blank
      sku: "AX-CRW-02",                              // identical SKU too
    });
    expect(selectManagedForReconcile([tempting]).reconcile).toHaveLength(0);
  });
});

describe("inventory webhooks are filtered by the same allowlist", () => {
  const allowed = new Set(["inv_1", "inv_2"]);

  it("accepts an inventory item belonging to an approved blank", () => {
    expect(isManagedInventoryItem("inv_1", allowed)).toBe(true);
  });

  it("no-ops on an inventory item from a decorated product", () => {
    expect(isManagedInventoryItem("inv_decorated", allowed)).toBe(false);
  });

  it("no-ops on a missing or empty inventory item id", () => {
    expect(isManagedInventoryItem(null, allowed)).toBe(false);
    expect(isManagedInventoryItem("", allowed)).toBe(false);
  });

  it("no-ops on everything when the allowlist is empty", () => {
    // Today's state. Every inventory webhook must be a safe no-op.
    expect(isManagedInventoryItem("inv_1", new Set())).toBe(false);
  });
});

describe("totals use the managed denominator", () => {
  const rows = [
    managed({ id: "a", variants: [variant(5, { shopify_variant_id: "va", barcode: "BC-A" })] }),
    managed({ id: "b", variants: [variant(0, { shopify_variant_id: "vb", barcode: "BC-B" })] }),
    managed({ id: "c", shopifyProductId: null, variants: [] }),
    // Decorated AND hidden — the real-world shape. It lands in `hidden`.
    decorated({ id: "d", variants: [variant(250, { shopify_variant_id: "vd", barcode: "BC-A" })] }),
    // Unmanaged but visible — the row that proves `not_managed` exists.
    managed({ id: "e", isInventoryManaged: false, isHidden: false,
              variants: [variant(999, { shopify_variant_id: "ve", barcode: "BC-B" })] }),
  ];

  it("counts units only from managed, linked blanks", () => {
    // 5 + 0. The 250 and 999 belong to products outside the boundary.
    expect(summarizeManaged(rows).totalUnits).toBe(5);
  });

  it("counts available and sold out only within the boundary", () => {
    const s = summarizeManaged(rows);
    expect(s.available).toBe(1);
    expect(s.soldOut).toBe(1);
    expect(s.notLinked).toBe(1);
    // e is unmanaged and visible; d is unmanaged AND hidden, and hidden wins.
    expect(s.notManaged).toBe(1);
    expect(s.hidden).toBe(1);
  });

  it("counts variants only from managed blanks", () => {
    expect(summarizeManaged(rows).variants).toBe(2);
  });

  it("never lets a decorated barcode raise a blank-inventory warning", () => {
    // "BC-A" is on managed blank `a` AND on decorated product `d`; "BC-B" is on
    // managed blank `b` AND on unmanaged blank `e`. Neither is a duplicate,
    // because only one side of each pair is inside the boundary.
    const s = summarizeManaged(rows);
    expect(s.duplicateBarcodes).toBe(0);
  });

  it("does raise a duplicate when two MANAGED blanks share a barcode", () => {
    const s = summarizeManaged([
      managed({ id: "x", variants: [variant(1, { shopify_variant_id: "vx", barcode: "SHARED" })] }),
      managed({ id: "y", variants: [variant(1, { shopify_variant_id: "vy", barcode: "SHARED" })] }),
    ]);
    expect(s.duplicateBarcodes).toBe(1);
  });

  it("counts missing barcodes only inside the boundary", () => {
    const s = summarizeManaged([
      managed({ id: "m", variants: [variant(1, { barcode: null })] }),
      decorated({ id: "d", variants: [variant(1, { barcode: null })] }),
    ]);
    expect(s.missingBarcodes).toBe(1);
  });

  it("the managed count is the denominator, not the blank count", () => {
    const s = summarizeManaged(rows);
    expect(s.managed).toBe(3);
    expect(s.total).toBe(5);
    // The distinction that was wrong before: health is out of 3, not 5.
    expect(s.available + s.soldOut + s.notLinked).toBe(s.managed);
  });
});

describe("the reference library keeps everything it had", () => {
  it("an unmanaged blank still reports its own record intact", () => {
    const ref = managed({
      id: "ref", isInventoryManaged: false, isMainRotation: false, isHidden: true,
    });
    expect(statusOfProduct(ref.isHidden, ref.variants, ref.shopifyProductId, false)).toBe("hidden");
    // Unhidden, it is Not Managed — still not Sold Out, still has its data.
    expect(statusOfProduct(false, ref.variants, ref.shopifyProductId, false)).toBe("not_managed");
    expect(ref.shopifyProductId).not.toBeNull();
    expect(ref.variants).toHaveLength(1);
  });
});
