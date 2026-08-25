import { describe, expect, it } from "vitest";
import {
  availabilityStatusOf,
  barcodeReport,
  byColor,
  byLocation,
  crossProductDuplicates,
  shouldApplyWebhook,
  statusOfProduct,
  syncAge,
  totalAvailable,
  variantAvailable,
  type VariantLike,
} from "./blank-inventory";

const MAIN = { shopify_location_id: "loc1", location_name: "Main Warehouse" };
const POPUP = { shopify_location_id: "loc2", location_name: "Pop-up" };

function v(
  color: string | null,
  size: string | null,
  qty: number | { loc: typeof MAIN; qty: number }[],
  over: Partial<VariantLike> = {},
): VariantLike {
  const levels = typeof qty === "number"
    ? [{ ...MAIN, available_quantity: qty }]
    : qty.map((x) => ({ ...x.loc, available_quantity: x.qty }));
  return {
    shopify_variant_id: `${color ?? "-"}/${size ?? "-"}`,
    color, size, sku: `SKU-${color}-${size}`, barcode: `BC${color}${size}`,
    levels,
    ...over,
  };
}

// The fourteen cases from the spec, in order.

describe("1–4: the three states", () => {
  it("1. inventory and not hidden → available", () => {
    expect(statusOfProduct(false, [v("Black", "M", 5)])).toBe("available");
  });

  it("2. zero inventory and not hidden → sold out", () => {
    expect(statusOfProduct(false, [v("Black", "M", 0)])).toBe("sold_out");
  });

  it("3. inventory but hidden → hidden", () => {
    expect(statusOfProduct(true, [v("Black", "M", 400)])).toBe("hidden");
  });

  it("4. zero inventory and hidden → hidden", () => {
    expect(statusOfProduct(true, [v("Black", "M", 0)])).toBe("hidden");
  });

  it("never reports the vague catch-all", () => {
    for (const hidden of [true, false]) {
      for (const qty of [-5, 0, 1, 999]) {
        expect(["available", "sold_out", "hidden"]).toContain(
          availabilityStatusOf({ isHidden: hidden, totalAvailable: qty }),
        );
      }
    }
  });

  it("treats an oversold negative total as sold out, not as stock", () => {
    // Shopify reports negatives after an oversell. Greater-than-zero is the
    // test, not non-zero.
    expect(statusOfProduct(false, [v("Black", "M", -3)])).toBe("sold_out");
  });

  it("does not hide a product just because it sold out", () => {
    // Hiding is a decision someone makes; selling through is not.
    expect(statusOfProduct(false, [v("Black", "M", 0)])).not.toBe("hidden");
  });

  it("a product with no variants at all is sold out, not available", () => {
    expect(statusOfProduct(false, [])).toBe("sold_out");
  });
});

describe("5–6: partial availability", () => {
  const variants = [
    v("Black", "S", 4), v("Black", "M", 0), v("Black", "L", 2),
    v("Sand", "S", 0), v("Sand", "M", 0),
  ];

  it("5. one colour sold out while another has stock", () => {
    const cols = byColor(variants);
    const black = cols.find((c) => c.color === "Black")!;
    const sand = cols.find((c) => c.color === "Sand")!;
    expect(black.soldOut).toBe(false);
    expect(sand.soldOut).toBe(true);
    // The product overall is still available — one live colour is enough.
    expect(statusOfProduct(false, variants)).toBe("available");
  });

  it("6. one size sold out while others remain", () => {
    const black = byColor(variants).find((c) => c.color === "Black")!;
    expect(black.sizesInStock).toEqual(["S", "L"]);
    expect(black.sizesSoldOut).toEqual(["M"]);
  });

  it("sums a colour across its sizes", () => {
    expect(byColor(variants).find((c) => c.color === "Black")!.available).toBe(6);
  });
});

describe("7–8: barcode integrity", () => {
  it("7. flags a variant with no barcode", () => {
    const r = barcodeReport([
      v("Black", "S", 1),
      v("Black", "M", 1, { barcode: null }),
      v("Black", "L", 1, { barcode: "   " }),
    ]);
    expect(r.missing).toHaveLength(2);
    expect(r.complete).toBe(false);
  });

  it("8. flags two variants sharing a barcode and picks neither", () => {
    const a = v("Black", "S", 1, { barcode: "SAME" });
    const b = v("Black", "M", 1, { barcode: "SAME" });
    const r = barcodeReport([a, b, v("Sand", "S", 1)]);
    expect(r.duplicates).toHaveLength(1);
    expect(r.duplicates[0].barcode).toBe("SAME");
    expect(r.duplicates[0].variants).toHaveLength(2);
    // Neither duplicate counts as OK — choosing a winner would attach stock
    // movements to whichever happened to sort first.
    expect(r.ok.map((x) => x.shopify_variant_id)).toEqual(["Sand/S"]);
  });

  it("reports clean when every variant has its own barcode", () => {
    expect(barcodeReport([v("Black", "S", 1), v("Sand", "S", 1)]).complete).toBe(true);
  });

  it("catches a barcode duplicated across two different products", () => {
    const dups = crossProductDuplicates([
      { id: "p1", variants: [v("Black", "S", 1, { barcode: "SHARED" })] },
      { id: "p2", variants: [v("Sand", "M", 1, { barcode: "SHARED" })] },
    ]);
    expect(dups).toHaveLength(1);
    expect(dups[0].hits.map((h) => h.productId)).toEqual(["p1", "p2"]);
  });

  it("does not treat two missing barcodes as duplicates of each other", () => {
    const r = barcodeReport([
      v("Black", "S", 1, { barcode: null }),
      v("Sand", "S", 1, { barcode: null }),
    ]);
    expect(r.duplicates).toHaveLength(0);
    expect(r.missing).toHaveLength(2);
  });
});

describe("locations", () => {
  it("sums one variant across locations", () => {
    expect(variantAvailable(v("Black", "M", [{ loc: MAIN, qty: 3 }, { loc: POPUP, qty: 4 }]))).toBe(7);
  });

  it("reports each location separately as well as the total", () => {
    const variants = [
      v("Black", "S", [{ loc: MAIN, qty: 2 }, { loc: POPUP, qty: 1 }]),
      v("Black", "M", [{ loc: MAIN, qty: 5 }]),
    ];
    expect(totalAvailable(variants)).toBe(8);
    expect(byLocation(variants)).toEqual([
      { shopify_location_id: "loc1", location_name: "Main Warehouse", available: 7 },
      { shopify_location_id: "loc2", location_name: "Pop-up", available: 1 },
    ]);
  });

  it("counts a variant with no levels as zero rather than as unknown", () => {
    expect(variantAvailable({ ...v("Black", "M", 0), levels: [] })).toBe(0);
  });
});

describe("13: a failed sync must not erase the last good data", () => {
  const now = Date.UTC(2026, 7, 21, 12, 0, 0);
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();

  it("keeps the cached figure and labels how old it is", () => {
    expect(syncAge(at(0), now).label).toBe("just now");
    expect(syncAge(at(3), now).label).toBe("3h ago");
    expect(syncAge(at(50), now).label).toBe("2d ago");
  });

  it("marks anything over an hour as stale so the number is not read as live", () => {
    expect(syncAge(at(0.5), now).stale).toBe(false);
    expect(syncAge(at(2), now).stale).toBe(true);
  });

  it("says so plainly when a sync has never run", () => {
    expect(syncAge(null, now)).toEqual({ minutes: null, stale: true, label: "never synced" });
    expect(syncAge("not-a-date", now).label).toBe("never synced");
  });
});

describe("12: a webhook delivered more than once", () => {
  const seen = new Set(["wh_1"]);

  it("applies the first delivery and ignores the repeat", () => {
    expect(shouldApplyWebhook({
      webhookId: "wh_2", seenWebhookIds: seen, eventAt: null, lastAppliedAt: null,
    }).apply).toBe(true);

    expect(shouldApplyWebhook({
      webhookId: "wh_1", seenWebhookIds: seen, eventAt: null, lastAppliedAt: null,
    })).toEqual({ apply: false, reason: "duplicate" });
  });

  it("drops an event older than what has already been applied", () => {
    // Shopify does not guarantee ordering. Replaying an older quantity over a
    // newer one would make the dashboard silently regress.
    expect(shouldApplyWebhook({
      webhookId: "wh_3",
      seenWebhookIds: seen,
      eventAt: "2026-08-21T10:00:00Z",
      lastAppliedAt: "2026-08-21T11:00:00Z",
    })).toEqual({ apply: false, reason: "out_of_order" });
  });

  it("applies a newer event", () => {
    expect(shouldApplyWebhook({
      webhookId: "wh_4",
      seenWebhookIds: seen,
      eventAt: "2026-08-21T12:00:00Z",
      lastAppliedAt: "2026-08-21T11:00:00Z",
    }).apply).toBe(true);
  });

  it("errs toward applying when the delivery carries no timestamp", () => {
    // Losing an update is worse than applying one twice: reconciliation fixes
    // a double-apply, but nothing recovers a dropped event.
    const r = shouldApplyWebhook({
      webhookId: null, seenWebhookIds: seen, eventAt: null, lastAppliedAt: "2026-08-21T11:00:00Z",
    });
    expect(r.apply).toBe(true);
    expect(r.reason).toBe("unidentified");
  });
});

describe("14: hiding and restoring never touches inventory", () => {
  it("returns to exactly the state it had before", () => {
    const variants = [v("Black", "S", 4), v("Black", "M", 0)];
    const before = statusOfProduct(false, variants);
    expect(before).toBe("available");

    expect(statusOfProduct(true, variants)).toBe("hidden");

    // Same variants, unhidden: the status is derived, so nothing had to be
    // stored or restored for this to come back correct.
    expect(statusOfProduct(false, variants)).toBe(before);
    expect(totalAvailable(variants)).toBe(4);
  });
});
