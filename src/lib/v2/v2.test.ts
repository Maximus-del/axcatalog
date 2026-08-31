import { describe, expect, it } from "vitest";
import { displayNameOf, initialsOf, matchesFilter, modulesFor, rankEntities } from "./entity";
import { cleanDesignTitle, isConfigurable, missingForProduct, stageOf, suggestTitle } from "./concepts";
import { audienceForRoles, hasAccess, marginFor, priceFor } from "./pricing";
import { categoryForGarment, mergeZones, presetsFor } from "./placements";
import type { Blank, Entity, ProductConcept } from "./types";

const entity = (over: Partial<Entity> = {}): Entity => ({
  id: "e1",
  organizationId: "o1",
  name: "Darnell Mooney",
  slug: "darnell-mooney",
  entityType: "person",
  roles: ["athlete"],
  status: "active",
  position: "WR",
  league: "nfl",
  avatarUrl: null,
  website: null,
  category: null,
  hasOwnOrg: true,
  orgName: "Darnell Mooney",
  isDemo: false,
  ...over,
});

const concept = (over: Partial<ProductConcept> = {}): ProductConcept => ({
  id: "c1",
  title: "Concept",
  entityId: "e1",
  collectionId: null,
  designId: null,
  blankId: null,
  productId: null,
  colorName: null,
  surface: null,
  zoneId: null,
  placementLabel: null,
  approvalState: "none",
  imageUrl: null,
  imageBucket: null,
  imagePath: null,
  notes: null,
  createdAt: "",
  ...over,
});

const blank = (over: Partial<Blank> = {}): Blank => ({
  id: "b1",
  name: "Garment-Wash Hoodie 14oz",
  brand: "Cotton Collective",
  styleNumber: "CCHOD475",
  sku: "AX-HOOD-05",
  garmentType: "hoodie",
  imageUrl: null,
  cost: 22.25,
  priceAthlete: 31.15,
  priceCorporate: 40.05,
  priceStandard: 48.95,
  availability: "available",
  colors: [],
  sizes: [],
  assortments: ["athlete", "client", "standard"],
  missingCost: false,
  missingPhoto: true,
  missingAssortment: false,
  ...over,
});

describe("entity naming", () => {
  it("prefers display_name over the generated full name", () => {
    expect(displayNameOf({ display_name: "Abbotsford Senior Secondary", first_name: "Abbotsford", last_name: "Senior" }))
      .toBe("Abbotsford Senior Secondary");
  });

  it("drops the '.' placeholder legacy org rows use as a last name", () => {
    expect(displayNameOf({ display_name: null, first_name: "Dashletics", last_name: "." })).toBe("Dashletics");
  });

  it("never returns an empty string", () => {
    expect(displayNameOf({})).toBe("Untitled entity");
  });

  it("derives initials from the first and last token", () => {
    expect(initialsOf("Darnell Mooney")).toBe("DM");
    expect(initialsOf("Abbotsford")).toBe("AB");
  });
});

describe("entity filtering", () => {
  it("matches a role facet", () => {
    expect(matchesFilter(entity(), { search: "", facet: "athlete", activity: "active" })).toBe(true);
    expect(matchesFilter(entity(), { search: "", facet: "client", activity: "active" })).toBe(false);
  });

  it("puts one dual-role record under both facets", () => {
    const dual = entity({ roles: ["athlete", "client"] });
    expect(matchesFilter(dual, { search: "", facet: "athlete", activity: "active" })).toBe(true);
    expect(matchesFilter(dual, { search: "", facet: "client", activity: "active" })).toBe(true);
  });

  it("matches an entity-type facet", () => {
    const school = entity({ entityType: "school", roles: ["client"] });
    expect(matchesFilter(school, { search: "", facet: "school", activity: "active" })).toBe(true);
    expect(matchesFilter(school, { search: "", facet: "organization", activity: "active" })).toBe(false);
  });

  it("requires every search token to hit", () => {
    expect(matchesFilter(entity(), { search: "mooney wr", facet: "all", activity: "all" })).toBe(true);
    expect(matchesFilter(entity(), { search: "mooney qb", facet: "all", activity: "all" })).toBe(false);
  });

  it("treats anything not active as inactive", () => {
    const archived = entity({ status: "archived" });
    expect(matchesFilter(archived, { search: "", facet: "all", activity: "active" })).toBe(false);
    expect(matchesFilter(archived, { search: "", facet: "all", activity: "inactive" })).toBe(true);
    expect(matchesFilter(archived, { search: "", facet: "all", activity: "all" })).toBe(true);
  });
});

describe("entity modules", () => {
  it("gives athletes their consumer surfaces", () => {
    expect(modulesFor(entity())).toContain("athlete_dashboard");
    expect(modulesFor(entity())).toContain("fan_profile");
  });

  it("gives schools a roster and still keeps commerce", () => {
    const mods = modulesFor(entity({ entityType: "school", roles: ["client"] }));
    expect(mods).toContain("roster");
    expect(mods).toContain("products");
    expect(mods).not.toContain("athlete_dashboard");
  });

  it("ranks entities with more creative work first", () => {
    const rows = [
      { id: "a", counts: { products: 1, collections: 0, concepts: 0 } },
      { id: "b", counts: { products: 0, collections: 2, concepts: 0 } },
    ];
    expect(rankEntities(rows)[0].id).toBe("b");
  });
});

describe("concept stage is derived, never stored", () => {
  it("starts as an idea with nothing but an image", () => {
    expect(stageOf(concept())).toBe("idea");
  });

  it("becomes specified once design, blank, colour and placement exist", () => {
    const c = concept({ designId: "d", blankId: "b", colorName: "Black", surface: "front" });
    expect(isConfigurable(c)).toBe(true);
    expect(stageOf(c)).toBe("specified");
  });

  it("reports exactly what is missing", () => {
    expect(missingForProduct(concept({ designId: "d", blankId: "b" }))).toEqual(["colour", "placement"]);
  });

  it("lets approval state outrank specification", () => {
    expect(stageOf(concept({ approvalState: "pending" }))).toBe("awaiting_approval");
    expect(stageOf(concept({ approvalState: "changes_requested" }))).toBe("changes_requested");
  });

  it("treats a linked product as the terminal stage", () => {
    expect(stageOf(concept({ productId: "p", approvalState: "pending" }))).toBe("productized");
  });
});

describe("concept titles", () => {
  it("discards generator filenames", () => {
    expect(cleanDesignTitle("ChatGPT Image Aug 16, 2026, 03 11 02 PM (1)")).toBeNull();
    expect(cleanDesignTitle("pasted 1786898102107 1")).toBeNull();
    expect(cleanDesignTitle("Mooney World Wordmark")).toBe("Mooney World Wordmark");
  });

  it("builds a readable title from whatever is known", () => {
    expect(suggestTitle({ entityName: "Darnell Mooney", blankName: "Hoodie", colorName: "Black" }))
      .toBe("Darnell Mooney · Hoodie · Black");
    expect(suggestTitle({ entityName: "Darnell Mooney", designTitle: "ChatGPT Image Aug 16" }))
      .toBe("Darnell Mooney");
  });
});

describe("access and price are separate questions", () => {
  it("prices the same blank differently per audience without duplicating it", () => {
    const b = blank();
    expect(priceFor(b, "athlete")).toBe(31.15);
    expect(priceFor(b, "client")).toBe(40.05);
    expect(priceFor(b, "standard")).toBe(48.95);
  });

  it("answers access from assortments, not from price", () => {
    const b = blank({ assortments: ["standard"] });
    expect(hasAccess(b, "standard")).toBe(true);
    expect(hasAccess(b, "athlete")).toBe(false);
    // …and the athlete price still exists. Access and price never collapse.
    expect(priceFor(b, "athlete")).toBe(31.15);
  });

  it("gives a multi-role entity the most favourable catalog", () => {
    expect(audienceForRoles(["client", "athlete"])).toBe("athlete");
    expect(audienceForRoles(["client", "partner"])).toBe("client");
    expect(audienceForRoles(["vendor"])).toBe("standard");
  });

  it("computes margin only when cost is known", () => {
    expect(marginFor(blank(), "athlete")).toBeCloseTo(0.2857, 3);
    expect(marginFor(blank({ cost: null }), "athlete")).toBeNull();
  });
});

describe("print placements", () => {
  it("offers cap placements for hats and apparel placements otherwise", () => {
    expect(categoryForGarment("hat")).toBe("cap");
    expect(categoryForGarment("hoodie")).toBe("apparel");
    expect(presetsFor("hat").every((p) => p.garmentCategory === "cap")).toBe(true);
    expect(presetsFor("tee").some((p) => p.zoneId === "left_chest")).toBe(true);
  });

  it("lets live print_zones rows win on geometry but keeps presets the DB lacks", () => {
    const merged = mergeZones([
      { garment_category: "apparel", surface: "front", zone_id: "left_chest", label: "Left chest", x: 60, y: 25, w: 14, h: 10 },
    ]);
    const lc = merged.find((p) => p.zoneId === "left_chest");
    expect(lc?.x).toBe(60);
    expect(merged.some((p) => p.zoneId === "front_oversized")).toBe(true);
  });
});
