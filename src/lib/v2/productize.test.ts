import { describe, expect, it } from "vitest";
import { buildProductDraft, canCreate, draftGaps, draftSlug, draftToProductRow } from "./productize";
import type { Blank, Design, Entity, ProductConcept } from "./types";

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
  id: "abcdef123456",
  title: "Darnell Mooney · Hoodie · Black",
  entityId: "e1",
  collectionId: null,
  designId: "d1",
  blankId: "b1",
  productId: null,
  colorName: "Black",
  surface: "front",
  zoneId: "center_chest",
  placementLabel: "Center",
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
  colors: [
    { id: "c1", name: "Black", hex: "#000", imageUrl: null, imageUrlBack: null, available: true },
    { id: "c2", name: "Bone", hex: "#eee", imageUrl: null, imageUrlBack: null, available: true },
    { id: "c3", name: "Retired", hex: null, imageUrl: null, imageUrlBack: null, available: false },
  ],
  sizes: ["S", "M", "L", "XL"],
  assortments: ["athlete"],
  missingCost: false,
  missingPhoto: true,
  missingAssortment: false,
  ...over,
});

const design = (over: Partial<Design> = {}): Design => ({
  id: "d1",
  title: "Mooney World Wordmark",
  status: "active",
  entityId: "e1",
  fileBucket: "design-files",
  filePath: "d1.png",
  fileType: "export",
  productionReady: true,
  createdAt: "",
  ...over,
});

const base = { entity: entity(), concept: concept(), blank: blank(), design: design(), audience: "athlete" as const };

describe("product draft", () => {
  it("names the product from the design plus the garment", () => {
    expect(buildProductDraft(base).title).toBe("Mooney World Wordmark Garment-Wash Hoodie 14oz");
  });

  it("does not repeat the garment when the design name already contains it", () => {
    const d = design({ title: "Garment-Wash Hoodie 14oz" });
    expect(buildProductDraft({ ...base, design: d }).title).toBe("Garment-Wash Hoodie 14oz");
  });

  it("falls back past generator filenames to the collection, then the entity", () => {
    const d = design({ title: "ChatGPT Image Aug 16, 2026" });
    expect(buildProductDraft({ ...base, design: d, collectionName: "Mooney World" }).title).toBe(
      "Mooney World Garment-Wash Hoodie 14oz",
    );
    // With no usable design, collection or concept name left, the entity carries it.
    expect(buildProductDraft({ ...base, design: d, concept: concept({ title: "pasted 1786898102107" }) }).title).toBe(
      "Darnell Mooney Garment-Wash Hoodie 14oz",
    );
  });

  it("prefers a concept the operator named over the entity name", () => {
    const d = design({ title: "ChatGPT Image Aug 16, 2026" });
    expect(buildProductDraft({ ...base, design: d, concept: concept({ title: "Falcons Away Tee" }) }).title).toBe(
      "Falcons Away Tee Garment-Wash Hoodie 14oz",
    );
  });

  it("takes the price from the entity's own tier", () => {
    expect(buildProductDraft(base).price).toBe(31.15);
    expect(buildProductDraft({ ...base, audience: "client" }).price).toBe(40.05);
  });

  it("defaults to the concept's single colourway", () => {
    expect(buildProductDraft(base).colors).toEqual(["Black"]);
  });

  it("can offer every available colour, skipping unavailable ones", () => {
    expect(buildProductDraft({ ...base, allColors: true }).colors).toEqual(["Black", "Bone"]);
  });

  it("inherits the blank's sizes", () => {
    expect(buildProductDraft(base).sizes).toEqual(["S", "M", "L", "XL"]);
  });

  it("carries the concept id so lineage can be written back", () => {
    expect(buildProductDraft(base).conceptId).toBe("abcdef123456");
  });

  it("describes the garment and placement", () => {
    const d = buildProductDraft(base).description;
    expect(d).toContain("Mooney World Wordmark for Darnell Mooney.");
    expect(d).toContain("Cotton Collective CCHOD475");
    expect(d).toContain("Front center placement.");
  });
});

describe("slug", () => {
  it("is unique per concept so two products can share a name", () => {
    expect(draftSlug("Mooney World Hoodie", "abcdef123456")).toBe("mooney-world-hoodie-abcdef");
  });

  it("survives a title with no usable characters", () => {
    expect(draftSlug("!!!", "abcdef123456")).toBe("product-abcdef");
  });
});

describe("readiness", () => {
  it("is creatable when the blank supplied everything", () => {
    expect(canCreate(buildProductDraft(base))).toBe(true);
    expect(draftGaps(buildProductDraft(base))).toEqual([]);
  });

  it("names exactly what is missing when there is no blank", () => {
    const draft = buildProductDraft({ ...base, blank: null, concept: concept({ blankId: null, colorName: null }) });
    expect(draftGaps(draft)).toEqual(["a blank", "a price", "at least one colour", "at least one size"]);
    expect(canCreate(draft)).toBe(false);
  });
});

describe("row shape", () => {
  it("creates a draft product, never a published one", () => {
    const row = draftToProductRow(buildProductDraft(base), "o1");
    expect(row.status).toBe("draft");
    expect(row.approval_state).toBe("none");
    expect(row.product_type).toBe("athlete_merch");
  });

  it("keeps colours and sizes in metadata, since product_variants requires a Shopify id", () => {
    const row = draftToProductRow(buildProductDraft(base), "o1");
    expect(row.metadata.colors).toEqual(["Black"]);
    expect(row.metadata.sizes).toEqual(["S", "M", "L", "XL"]);
    expect(row.metadata.created_from).toMatchObject({ source: "admin-v2", concept_id: "abcdef123456" });
  });
});
