// The sync-pending safeguard.
//
// The property: the dashboard never says Sold Out from an absence of data.
// "Zero because Shopify told us zero" and "zero because we never asked" have
// the same shape in the cache and opposite meanings in the warehouse.
import { describe, expect, it } from "vitest";
import {
  availabilityStatusOf, countsTowardInventory, STATUS_LABELS,
  type AvailabilityStatus, type InventorySyncState,
} from "./blank-inventory";

const linked = {
  isHidden: false,
  isInventoryManaged: true,
  shopifyProductId: "gid://shopify/Product/7010",
};

describe("the exact order the spec requires", () => {
  const cases: [string, Parameters<typeof availabilityStatusOf>[0], AvailabilityStatus][] = [
    ["1. hidden wins over everything",
      { ...linked, isHidden: true, syncState: "success", totalAvailable: 119 }, "hidden"],
    ["2. unmanaged before the link check",
      { ...linked, isInventoryManaged: false, shopifyProductId: null, totalAvailable: 0 }, "not_managed"],
    ["3. managed but unlinked",
      { ...linked, shopifyProductId: null, totalAvailable: 0 }, "not_linked"],
    ["4. linked but never synced",
      { ...linked, syncState: "never", totalAvailable: 0 }, "sync_pending"],
    ["5. synced with stock",
      { ...linked, syncState: "success", hasConfirmedInventory: true, totalAvailable: 119 }, "available"],
    ["6. synced with none",
      { ...linked, syncState: "success", hasConfirmedInventory: true, totalAvailable: 0 }, "sold_out"],
  ];

  for (const [label, input, want] of cases) {
    it(label, () => expect(availabilityStatusOf(input)).toBe(want));
  }
});

describe("never Sold Out from an absence of data", () => {
  it("a freshly linked blank with zero rows is Sync Pending, not Sold Out", () => {
    // The exact AXISM 7010 trap: approve + link, before reconciliation runs.
    const s = availabilityStatusOf({ ...linked, syncState: "never", totalAvailable: 0 });
    expect(s).toBe("sync_pending");
    expect(s).not.toBe("sold_out");
  });

  it("a sync in progress is Sync Pending, not Sold Out", () => {
    expect(availabilityStatusOf({ ...linked, syncState: "in_progress", totalAvailable: 0 }))
      .toBe("sync_pending");
  });

  it("a first sync that failed is Inventory Unknown, not Sold Out", () => {
    const s = availabilityStatusOf({
      ...linked, syncState: "failed", hasConfirmedInventory: false, totalAvailable: 0,
    });
    expect(s).toBe("sync_error");
    expect(s).not.toBe("sold_out");
  });

  it("only a COMPLETED sync can ever produce Sold Out", () => {
    const states: InventorySyncState[] = ["never", "in_progress", "failed"];
    for (const syncState of states) {
      expect(availabilityStatusOf({
        ...linked, syncState, hasConfirmedInventory: false, totalAvailable: 0,
      })).not.toBe("sold_out");
    }
    expect(availabilityStatusOf({
      ...linked, syncState: "success", hasConfirmedInventory: true, totalAvailable: 0,
    })).toBe("sold_out");
  });

  it("defaults to sync_pending when the state is simply absent — fails closed", () => {
    expect(availabilityStatusOf({ ...linked, totalAvailable: 0 })).toBe("sync_pending");
    expect(availabilityStatusOf({ ...linked, totalAvailable: 119 })).toBe("sync_pending");
  });
});

describe("a later failure preserves the last confirmed figure", () => {
  it("keeps showing Available after a refresh fails", () => {
    // Synced successfully once (119 units), latest refresh failed. The figure
    // is stale, not wrong — erasing it would be strictly worse.
    expect(availabilityStatusOf({
      ...linked, syncState: "failed", hasConfirmedInventory: true, totalAvailable: 119,
    })).toBe("available");
  });

  it("keeps showing Sold Out after a refresh fails on a confirmed zero", () => {
    expect(availabilityStatusOf({
      ...linked, syncState: "failed", hasConfirmedInventory: true, totalAvailable: 0,
    })).toBe("sold_out");
  });

  it("distinguishes a first failure from a later one", () => {
    const first = availabilityStatusOf({
      ...linked, syncState: "failed", hasConfirmedInventory: false, totalAvailable: 0,
    });
    const later = availabilityStatusOf({
      ...linked, syncState: "failed", hasConfirmedInventory: true, totalAvailable: 0,
    });
    expect(first).toBe("sync_error");
    expect(later).toBe("sold_out");
    expect(first).not.toBe(later);
  });
});

describe("row counts are not proof of a sync", () => {
  it("variants present but never synced is still Sync Pending", () => {
    // A previous partial import could leave rows. Rows are not an answer.
    expect(availabilityStatusOf({
      ...linked, syncState: "never", totalAvailable: 42,
    })).toBe("sync_pending");
  });

  it("a successful sync returning zero variants is a legitimate Sold Out", () => {
    expect(availabilityStatusOf({
      ...linked, syncState: "success", hasConfirmedInventory: true, totalAvailable: 0,
    })).toBe("sold_out");
  });
});

describe("the unknown states stay out of inventory totals", () => {
  it("only available and sold_out are a real claim", () => {
    const all: AvailabilityStatus[] = [
      "available", "sold_out", "hidden", "not_linked", "not_managed",
      "sync_pending", "sync_error",
    ];
    expect(all.filter(countsTowardInventory)).toEqual(["available", "sold_out"]);
  });

  it("labels every state", () => {
    expect(STATUS_LABELS.sync_pending).toBe("Sync Pending");
    expect(STATUS_LABELS.sync_error).toBe("Inventory Unknown");
    expect(Object.keys(STATUS_LABELS).sort()).toEqual([
      "available", "hidden", "not_linked", "not_managed",
      "sold_out", "sync_error", "sync_pending",
    ]);
  });
});
