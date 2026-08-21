import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  priceBlank,
  overrideFor,
  priceFrom,
  profitOf,
  realisedMargin,
  roundPrice,
  sellingPrice,
  trueCostOf,
  type PricingRule,
} from "./pricing";

const plain: PricingRule = { tier: "standard", margin: 0.5, round_to: 1, charm_offset: 0, min_price: null };

describe("trueCostOf", () => {
  it("adds up the itemised costs", () => {
    expect(trueCostOf({ blank_cost: 12, decoration_cost: 4, additional_cost: 1 })).toBe(17);
  });

  it("treats missing parts as zero once any part is set", () => {
    expect(trueCostOf({ blank_cost: 12, decoration_cost: null, additional_cost: null })).toBe(12);
  });

  it("falls back to the legacy single cost only when nothing is itemised", () => {
    expect(trueCostOf({ cost: 9 })).toBe(9);
    // Itemised wins, so importing a vendor sheet can't double-count.
    expect(trueCostOf({ blank_cost: 12, cost: 9 })).toBe(12);
  });

  it("accepts numeric strings, which is what Postgres returns", () => {
    expect(trueCostOf({ blank_cost: "12.50", decoration_cost: "2.50" })).toBe(15);
  });

  it("is null when nothing is known", () => {
    expect(trueCostOf({})).toBeNull();
    expect(trueCostOf({ cost: null })).toBeNull();
  });
});

describe("priceFrom", () => {
  it("uses margin on price, not markup on cost", () => {
    // $18 at 55% margin is $40 — a 55% *markup* would be $27.90.
    expect(priceFrom(18, { ...plain, margin: 0.55 })).toBe(40);
  });

  it("rounds up to the increment", () => {
    expect(priceFrom(10, { ...plain, margin: 0.5, round_to: 5 })).toBe(20);
    expect(priceFrom(11, { ...plain, margin: 0.5, round_to: 5 })).toBe(25);
  });

  it("applies a charm ending after rounding", () => {
    expect(priceFrom(20, { ...plain, margin: 0.5, round_to: 1, charm_offset: 0.01 })).toBe(39.99);
  });

  it("respects a floor price", () => {
    expect(priceFrom(2, { ...plain, margin: 0.5, min_price: 20 })).toBe(20);
  });

  it("returns null rather than inventing a price for an unknown cost", () => {
    expect(priceFrom(null, plain)).toBeNull();
  });

  it("refuses an impossible margin instead of dividing by zero", () => {
    expect(priceFrom(10, { ...plain, margin: 1 })).toBeNull();
  });
});

describe("roundPrice", () => {
  it("never rounds down, so margin is never quietly lost", () => {
    expect(roundPrice(20.01, { round_to: 1, charm_offset: 0 })).toBe(21);
  });

  it("cannot be pushed below zero by a charm offset", () => {
    expect(roundPrice(0, { round_to: 1, charm_offset: 5 })).toBe(0);
  });
});

describe("realised margin", () => {
  it("reports what rounding actually achieved, not what was asked for", () => {
    const r = priceFrom(18, { ...plain, margin: 0.55 });
    expect(r).toBe(40);
    expect(realisedMargin(r, 18)).toBeCloseTo(0.55, 2);
  });

  it("shows the floor eating the margin", () => {
    const price = priceFrom(2, { ...plain, margin: 0.5, min_price: 20 });
    expect(realisedMargin(price, 2)).toBeCloseTo(0.9, 2);
  });

  it("is null without both numbers", () => {
    expect(realisedMargin(null, 10)).toBeNull();
    expect(realisedMargin(10, null)).toBeNull();
    expect(profitOf(null, 1)).toBeNull();
  });
});

describe("priceBlank", () => {
  it("returns cost, price, profit and margin together", () => {
    const r = priceBlank({ blank_cost: 20 }, { ...plain, margin: 0.5 });
    expect(r).toEqual({ cost: 20, price: 40, profit: 20, margin: 0.5 });
  });

  it("stays null-safe for an uncosted blank", () => {
    expect(priceBlank({}, plain)).toEqual({ cost: null, price: null, profit: null, margin: null });
  });
});

describe("shipped defaults", () => {
  it("defines every tier with a sane margin", () => {
    for (const tier of ["standard", "athlete", "corporate"] as const) {
      const rule = DEFAULT_RULES[tier];
      expect(rule.tier).toBe(tier);
      expect(rule.margin).toBeGreaterThan(0);
      expect(rule.margin).toBeLessThan(0.95);
    }
  });

  it("prices an athlete's own store below the public one", () => {
    const cost = 18;
    expect(priceFrom(cost, DEFAULT_RULES.athlete)!).toBeLessThan(priceFrom(cost, DEFAULT_RULES.standard)!);
  });
});

describe("sellingPrice", () => {
  // One definition of "what do we charge", used by the catalogue, the drawer
  // and the design-application path alike. Before this each of them decided
  // for itself, and the pricing sheet's typed numbers were only honoured by
  // the pricing sheet.
  const cost = { blank_cost: 12, decoration_cost: 4 };

  it("falls back to the rule when nothing is typed", () => {
    expect(sellingPrice(cost, plain)).toBe(priceFrom(16, plain));
  });

  it("prefers the typed price for that tier", () => {
    expect(sellingPrice({ ...cost, price_standard: 49 }, plain)).toBe(49);
  });

  it("reads the column belonging to the rule's tier, not just any of them", () => {
    const withAthlete = { ...cost, price_athlete: 21 };
    expect(sellingPrice(withAthlete, plain)).toBe(priceFrom(16, plain));
    expect(sellingPrice(withAthlete, DEFAULT_RULES.athlete)).toBe(21);
  });

  it("does not read zero or empty as a free product", () => {
    expect(overrideFor({ price_standard: 0 }, "standard")).toBeNull();
    expect(overrideFor({ price_standard: "" }, "standard")).toBeNull();
    expect(overrideFor({ price_standard: -5 }, "standard")).toBeNull();
    expect(sellingPrice({ ...cost, price_standard: 0 }, plain)).toBe(priceFrom(16, plain));
  });

  it("accepts a numeric string, which is how Postgres numerics arrive", () => {
    expect(overrideFor({ price_standard: "42.50" }, "standard")).toBe(42.5);
  });

  it("honours a typed price even on a blank with no cost recorded", () => {
    expect(sellingPrice({ price_standard: 30 }, plain)).toBe(30);
  });
});
