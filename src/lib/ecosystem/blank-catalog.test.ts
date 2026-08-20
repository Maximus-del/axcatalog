import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  facetsOf,
  groupByCategory,
  isActive,
  matchesFilters,
  mediaPercentOf,
  previewFor,
  priceCatalogBlank,
  primaryImageOf,
  type Assortment,
  type CatalogBlank,
  type CatalogColor,
} from "./blank-catalog";
import { DEFAULT_RULES } from "./pricing";

function color(name: string, front: string | null, back: string | null, available = true): CatalogColor {
  return { id: name, color_name: name, hex_code: null, image_url: front, image_url_back: back, available, sort_order: 0 };
}

function blank(over: Partial<CatalogBlank> = {}): CatalogBlank {
  return {
    id: "b1", sku: "AX-TEE-01", style_number: "7010", name: "Oversized Heavyweight Tee",
    brand: "AXISM", garment_type: "tee", fabric: null, fabric_specs: null, notes: null,
    url: null, availability_status: "active", internal_only: false, sellable_as_blank: true,
    moq: 3, blank_cost: 12, decoration_cost: 4, additional_cost: null, cost: null,
    price_athlete: null, price_corporate: null, price_standard: null,
    colors: [color("Black", "f", "b"), color("White", "f", null)],
    sizes: ["S", "M", "L"], assortments: ["athlete", "standard"],
    ...over,
  };
}

const priced = (over: Partial<CatalogBlank> = {}) => priceCatalogBlank(blank(over), DEFAULT_RULES);

describe("media coverage", () => {
  it("counts both surfaces of every available colourway", () => {
    expect(mediaPercentOf([color("A", "f", "b"), color("B", "f", "b")])).toBe(100);
    expect(mediaPercentOf([color("A", "f", "b"), color("B", "f", null)])).toBe(75);
    expect(mediaPercentOf([color("A", null, null)])).toBe(0);
  });

  it("ignores colourways that are not on offer, so a retired colour can't hold a blank at 90%", () => {
    expect(mediaPercentOf([color("A", "f", "b"), color("Retired", null, null, false)])).toBe(100);
  });

  it("does not divide by zero", () => {
    expect(mediaPercentOf([])).toBe(0);
    expect(mediaPercentOf([color("X", null, null, false)])).toBe(0);
  });

  it("prefers an available colourway for the card image", () => {
    expect(primaryImageOf([color("Retired", "old", null, false), color("Black", "new", null)])).toBe("new");
  });
});

describe("pricing derivation", () => {
  it("prices every tier from one true cost", () => {
    const p = priced();
    expect(p.trueCost).toBe(16);
    expect(p.prices.athlete).toBeLessThan(p.prices.standard!);
    expect(p.margins.standard).toBeGreaterThan(0);
  });

  it("leaves an uncosted blank unpriced rather than free", () => {
    const p = priced({ blank_cost: null, decoration_cost: null, additional_cost: null, cost: null });
    expect(p.trueCost).toBeNull();
    expect(p.prices.standard).toBeNull();
  });
});

describe("hand-entered prices override the rule", () => {
  // The old Pricing sheet writes price_athlete/corporate/standard directly.
  // If the catalogue ignored those columns it would show a different number
  // than the page that wrote them, for the same blank, on the same day.
  it("uses the typed price instead of the computed one", () => {
    const p = priced({ price_standard: 55 });
    expect(p.prices.standard).toBe(55);
    expect(p.overrides.standard).toBe(55);
    expect(p.hasOverride).toBe(true);
    // ...and the computed figure is still available to compare against.
    expect(p.computed.standard).not.toBe(55);
  });

  it("reports the margin that price actually achieves, not the rule's target", () => {
    const p = priced({ price_standard: 32 }); // cost 16 → exactly half
    expect(p.margins.standard).toBeCloseTo(0.5, 5);
    expect(DEFAULT_RULES.standard.margin).toBe(0.6);
  });

  it("overrides one tier without disturbing the others", () => {
    const p = priced({ price_athlete: 21 });
    expect(p.prices.athlete).toBe(21);
    expect(p.prices.standard).toBe(p.computed.standard);
    expect(p.overrides.standard).toBeNull();
  });

  it("treats a blank or zero price as no override at all", () => {
    for (const v of [null, 0, ""] as (number | string | null)[]) {
      const p = priced({ price_standard: v });
      expect(p.overrides.standard).toBeNull();
      expect(p.prices.standard).toBe(p.computed.standard);
    }
  });

  it("filters on the price actually charged", () => {
    const p = priced({ price_standard: 90 });
    expect(matchesFilters(p, { priceTier: "standard", maxPrice: 60 })).toBe(false);
    expect(matchesFilters(p, { priceTier: "standard", minPrice: 80 })).toBe(true);
  });
});

describe("access and price stay independent", () => {
  // The distinction the whole model rests on.
  it("restricts access without touching price", () => {
    const premium = priced({ assortments: ["athlete", "client"] });
    // Not available to subscribers...
    expect(matchesFilters(premium, { assortments: ["subscriber"] })).toBe(false);
    // ...but still has a standard-tier price.
    expect(premium.prices.standard).not.toBeNull();
  });

  it("lets a blank in every assortment still differ by tier", () => {
    const everywhere = priced({ assortments: ["athlete", "client", "subscriber", "standard"] });
    expect(everywhere.prices.athlete).not.toBe(everywhere.prices.standard);
  });
});

describe("filtering", () => {
  it("searches name, sku, style number and brand", () => {
    for (const q of ["oversized", "AX-TEE-01", "7010", "axism"]) {
      expect(matchesFilters(priced(), { search: q })).toBe(true);
    }
    expect(matchesFilters(priced(), { search: "hoodie" })).toBe(false);
  });

  it("matches a blank in ANY of the selected assortments", () => {
    expect(matchesFilters(priced(), { assortments: ["client", "standard"] })).toBe(true);
    expect(matchesFilters(priced(), { assortments: ["client"] })).toBe(false);
  });

  it("filters on photography completeness", () => {
    expect(matchesFilters(priced(), { media: "missing" })).toBe(true);
    expect(matchesFilters(priced(), { media: "complete" })).toBe(false);
    const done = priced({ colors: [color("Black", "f", "b")] });
    expect(matchesFilters(done, { media: "complete" })).toBe(true);
  });

  it("answers the workflow questions from the spec", () => {
    const hoodie = priced({ garment_type: "hoodie", assortments: ["athlete"] });
    // "hoodies available to Athletes"
    expect(matchesFilters(hoodie, { categories: ["hoodie"], assortments: ["athlete"] })).toBe(true);
    // "Athlete Catalog blanks missing photography"
    expect(matchesFilters(hoodie, { assortments: ["athlete"], media: "missing" })).toBe(true);
    // "premium blanks NOT in the Standard Catalog" — absence is expressed by
    // filtering to what IS in standard and inverting at the call site.
    expect(matchesFilters(hoodie, { assortments: ["standard"] })).toBe(false);
  });

  it("excludes an unpriced blank from a price range rather than treating it as free", () => {
    const unpriced = priced({ blank_cost: null, decoration_cost: null, additional_cost: null, cost: null });
    expect(matchesFilters(unpriced, { maxPrice: 30 })).toBe(false);
  });

  it("applies the price range at the chosen tier", () => {
    const p = priced();
    const std = p.prices.standard!;
    expect(matchesFilters(p, { priceTier: "standard", maxPrice: std })).toBe(true);
    expect(matchesFilters(p, { priceTier: "standard", maxPrice: std - 1 })).toBe(false);
    // Athlete price is lower, so the same ceiling admits it.
    expect(matchesFilters(p, { priceTier: "athlete", maxPrice: std - 1 })).toBe(true);
  });

  it("passes everything when no filter is set", () => {
    expect(matchesFilters(priced(), {})).toBe(true);
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ search: "x", media: "missing" })).toBe(2);
    expect(activeFilterCount({ search: "   " })).toBe(0);
  });
});

describe("isActive", () => {
  it("treats an unset status as still on offer", () => {
    expect(isActive(blank({ availability_status: null }))).toBe(true);
    expect(isActive(blank({ availability_status: "active" }))).toBe(true);
    expect(isActive(blank({ availability_status: "discontinued" }))).toBe(false);
  });
});

describe("facets and grouping", () => {
  it("lists the values actually present", () => {
    const f = facetsOf([blank(), blank({ id: "b2", garment_type: "hoodie", brand: "Independent" })]);
    expect(f.categories).toEqual(["hoodie", "tee"]);
    expect(f.brands).toEqual(["AXISM", "Independent"]);
  });

  it("groups for the assortment page sections", () => {
    const g = groupByCategory([blank(), blank({ id: "b2", garment_type: "hoodie" })]);
    expect(g.map((x) => x.category)).toEqual(["hoodie", "tee"]);
  });
});

describe("previewFor", () => {
  const athlete: Assortment = {
    id: "a1", key: "athlete", name: "Athlete Catalog", description: null,
    default_price_tier: "athlete", sort_order: 1, is_active: true,
  };

  it("shows only what that audience can reach, at their tier", () => {
    const inCat = priced({ assortments: ["athlete"] });
    const outCat = priced({ id: "b2", assortments: ["client"] });
    const p = previewFor(athlete, [inCat, outCat]);
    expect(p.tier).toBe("athlete");
    expect(p.blanks.map((b) => b.id)).toEqual(["b1"]);
  });

  it("hides a discontinued blank even while it is still a member", () => {
    // Membership and availability disagreeing is a real state; the preview
    // should show what the audience would ACTUALLY see.
    const retired = priced({ assortments: ["athlete"], availability_status: "discontinued" });
    expect(previewFor(athlete, [retired]).blanks).toHaveLength(0);
  });

  it("falls back to standard pricing for an access-only assortment", () => {
    const camp: Assortment = { ...athlete, key: "camp", default_price_tier: null };
    expect(previewFor(camp, []).tier).toBe("standard");
  });
});
