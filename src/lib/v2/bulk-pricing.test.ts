import { describe, expect, it } from "vitest";
import {
  breakFor,
  nextBreakFor,
  quoteBulkOrder,
  totalUnits,
  type DiscountBreak,
} from "./bulk-pricing";

// The live ladder from volume_discount_breaks, deliberately shuffled — the
// arithmetic must not depend on rows arriving sorted.
const BREAKS: DiscountBreak[] = [
  { minQty: 100, discountPct: 15 },
  { minQty: 25, discountPct: 5 },
  { minQty: 250, discountPct: 20 },
  { minQty: 50, discountPct: 10 },
];

describe("breakFor", () => {
  it("gives no discount below the first break", () => {
    expect(breakFor(24, BREAKS)).toBeNull();
    expect(breakFor(0, BREAKS)).toBeNull();
  });

  it("applies a break exactly at its minimum", () => {
    expect(breakFor(25, BREAKS)).toEqual({ minQty: 25, discountPct: 5 });
    expect(breakFor(250, BREAKS)).toEqual({ minQty: 250, discountPct: 20 });
  });

  it("takes the highest qualifying break, not the first matching row", () => {
    expect(breakFor(120, BREAKS)).toEqual({ minQty: 100, discountPct: 15 });
    expect(breakFor(1000, BREAKS)).toEqual({ minQty: 250, discountPct: 20 });
  });

  it("is unaffected by an empty ladder", () => {
    expect(breakFor(500, [])).toBeNull();
  });
});

describe("nextBreakFor", () => {
  it("reports the gap an operator would quote", () => {
    expect(nextBreakFor(20, BREAKS)).toEqual({ minQty: 25, discountPct: 5, unitsAway: 5 });
    expect(nextBreakFor(99, BREAKS)).toEqual({ minQty: 100, discountPct: 15, unitsAway: 1 });
  });

  it("is null at the top of the ladder", () => {
    expect(nextBreakFor(250, BREAKS)).toBeNull();
    expect(nextBreakFor(9999, BREAKS)).toBeNull();
  });
});

describe("totalUnits", () => {
  it("sums the size grid", () => {
    expect(totalUnits([{ size: "M", quantity: 10 }, { size: "L", quantity: 15 }])).toBe(25);
  });

  it("ignores negatives, fractions and junk rather than producing a wrong total", () => {
    expect(
      totalUnits([
        { size: "S", quantity: -5 },
        { size: "M", quantity: 2.7 },
        { size: "L", quantity: Number.NaN },
      ]),
    ).toBe(2);
  });
});

describe("quoteBulkOrder", () => {
  const lines = (n: number) => [{ size: "M", quantity: n }];

  it("charges full price under the first break", () => {
    const q = quoteBulkOrder(lines(10), 30, BREAKS);
    expect(q).toMatchObject({
      units: 10,
      discountPct: 0,
      discountedUnitPrice: 30,
      subtotal: 300,
      savings: 0,
    });
  });

  it("applies the ladder", () => {
    expect(quoteBulkOrder(lines(50), 30, BREAKS)).toMatchObject({
      discountPct: 10,
      discountedUnitPrice: 27,
      retailEquivalent: 1500,
      subtotal: 1350,
      savings: 150,
    });
  });

  it("builds the total from the per-unit price shown on the quote", () => {
    // 33.33 at 15% is 28.3305 -> 28.33 per unit. The total must be 100 x 28.33,
    // not 100 x 33.33 x 0.85, or the arithmetic on the page will not add up.
    const q = quoteBulkOrder(lines(100), 33.33, BREAKS);
    expect(q.discountedUnitPrice).toBe(28.33);
    expect(q.subtotal).toBe(2833);
    expect(q.subtotal).toBe(q.discountedUnitPrice * q.units);
  });

  it("keeps savings consistent with the numbers it reports", () => {
    for (const n of [1, 25, 49, 50, 99, 100, 249, 250, 400]) {
      const q = quoteBulkOrder(lines(n), 42.5, BREAKS);
      expect(q.savings).toBeCloseTo(q.retailEquivalent - q.subtotal, 2);
    }
  });

  it("sums a mixed size grid", () => {
    const q = quoteBulkOrder(
      [
        { size: "S", quantity: 10 },
        { size: "M", quantity: 20 },
        { size: "L", quantity: 25 },
      ],
      20,
      BREAKS,
    );
    expect(q.units).toBe(55);
    expect(q.discountPct).toBe(10);
  });

  it("survives an empty order without producing NaN", () => {
    const q = quoteBulkOrder([], 30, BREAKS);
    expect(q).toMatchObject({ units: 0, subtotal: 0, savings: 0, retailEquivalent: 0 });
  });

  it("survives a missing price rather than quoting nonsense", () => {
    const q = quoteBulkOrder(lines(50), Number.NaN, BREAKS);
    expect(q.unitPrice).toBe(0);
    expect(q.subtotal).toBe(0);
  });

  it("still reports the next break so the operator can push the order up", () => {
    expect(quoteBulkOrder(lines(20), 30, BREAKS).nextBreak).toEqual({
      minQty: 25,
      discountPct: 5,
      unitsAway: 5,
    });
  });
});
