import { describe, expect, it } from "vitest";
import {
  MAX_VARIANTS,
  dedupe,
  expandVariants,
  overLimit,
  unphotographed,
  variantTitle,
  type VariantTarget,
} from "./variants";
import type { Blank, BlankColor } from "./types";

const color = (name: string, imageUrl: string | null = "u"): BlankColor => ({
  id: name,
  name,
  hex: "#000",
  imageUrl,
  imageUrlBack: null,
  available: true,
});

const blank = (id: string, name: string, colors: BlankColor[], imageUrl: string | null = "hero"): Blank => ({
  id,
  name,
  brand: "AXISM",
  styleNumber: "7010",
  sku: null,
  garmentType: "tee",
  imageUrl,
  cost: 10,
  priceAthlete: 14,
  priceCorporate: 18,
  priceStandard: 22,
  availability: "available",
  colors,
  sizes: ["M"],
  assortments: ["athlete"],
  missingCost: false,
  missingPhoto: false,
  missingAssortment: false,
});

const tee = blank("b1", "Dri Ease Tee", [color("Black"), color("Navy"), color("Ecru", null)]);
const hoodie = blank("b2", "Heavy Hoodie", [color("Black"), color("Bone")]);

describe("expandVariants", () => {
  it("always includes the base, first", () => {
    const out = expandVariants({ baseBlank: tee, baseColorName: "Black", extraColorNames: [], extraBlanks: [] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ blankId: "b1", colorName: "Black" });
  });

  it("adds extra colourways of the same blank", () => {
    const out = expandVariants({
      baseBlank: tee,
      baseColorName: "Black",
      extraColorNames: ["Navy", "Ecru"],
      extraBlanks: [],
    });
    expect(out.map((v) => v.colorName)).toEqual(["Black", "Navy", "Ecru"]);
    expect(out.every((v) => v.blankId === "b1")).toBe(true);
  });

  it("adds other blanks with their own colours", () => {
    const out = expandVariants({
      baseBlank: tee,
      baseColorName: "Black",
      extraColorNames: [],
      extraBlanks: [{ blank: hoodie, colorNames: ["Black", "Bone"] }],
    });
    expect(out.map((v) => `${v.blankName}/${v.colorName}`)).toEqual([
      "Dri Ease Tee/Black",
      "Heavy Hoodie/Black",
      "Heavy Hoodie/Bone",
    ]);
  });

  it("produces one mockup for a blank chosen without a colour", () => {
    const out = expandVariants({
      baseBlank: tee,
      baseColorName: "Black",
      extraColorNames: [],
      extraBlanks: [{ blank: hoodie, colorNames: [] }],
    });
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ blankId: "b2", colorName: null });
  });

  it("does not duplicate the base when its colour is ticked again", () => {
    const out = expandVariants({
      baseBlank: tee,
      baseColorName: "Black",
      extraColorNames: ["Black", "Navy"],
      extraBlanks: [],
    });
    expect(out.map((v) => v.colorName)).toEqual(["Black", "Navy"]);
  });

  it("flags colourways with no photography", () => {
    const out = expandVariants({
      baseBlank: tee,
      baseColorName: "Black",
      extraColorNames: ["Ecru"],
      extraBlanks: [],
    });
    // Ecru has no image of its own but the blank has a hero shot, so it still
    // renders — just not in the right colour.
    expect(out.find((v) => v.colorName === "Ecru")?.photographed).toBe(true);
  });

  it("marks a variant unphotographed when the blank has no hero shot either", () => {
    const bare = blank("b3", "Bare", [color("Slate", null)], null);
    const out = expandVariants({ baseBlank: bare, baseColorName: "Slate", extraColorNames: [], extraBlanks: [] });
    expect(out[0].photographed).toBe(false);
    expect(unphotographed(out)).toHaveLength(1);
  });

  it("multiplies blanks by colours without a combinatorial surprise", () => {
    // Two extra blanks with two colours each, plus base and one extra colour.
    const out = expandVariants({
      baseBlank: tee,
      baseColorName: "Black",
      extraColorNames: ["Navy"],
      extraBlanks: [
        { blank: hoodie, colorNames: ["Black", "Bone"] },
        { blank: blank("b4", "Crop", [color("Pink")]), colorNames: ["Pink"] },
      ],
    });
    expect(out).toHaveLength(5);
  });
});

describe("dedupe", () => {
  const t = (blankId: string, colorName: string | null): VariantTarget => ({
    blankId, blankName: blankId, colorName, photographed: true,
  });

  it("treats blank+colour as the identity", () => {
    expect(dedupe([t("b1", "Black"), t("b1", "Black"), t("b1", "Navy"), t("b2", "Black")])).toHaveLength(3);
  });

  it("does not conflate a null colour with a named one", () => {
    expect(dedupe([t("b1", null), t("b1", "Black")])).toHaveLength(2);
  });

  it("keeps first-seen order", () => {
    expect(dedupe([t("b2", "Navy"), t("b1", "Black"), t("b2", "Navy")]).map((v) => v.blankId)).toEqual(["b2", "b1"]);
  });
});

describe("variantTitle", () => {
  const target: VariantTarget = { blankId: "b1", blankName: "Dri Ease Tee", colorName: "Navy", photographed: true };

  it("uses the operator's title verbatim for a single mockup", () => {
    expect(variantTitle("Mooney World", target, { multipleBlanks: false, total: 1 })).toBe("Mooney World");
  });

  it("appends the colour when a run shares one blank", () => {
    expect(variantTitle("Mooney World", target, { multipleBlanks: false, total: 3 })).toBe("Mooney World · Navy");
  });

  it("appends blank and colour when the run spans blanks", () => {
    expect(variantTitle("Mooney World", target, { multipleBlanks: true, total: 3 })).toBe(
      "Mooney World · Dri Ease Tee · Navy",
    );
  });

  it("does not repeat a fact the operator already typed", () => {
    expect(variantTitle("Mooney World Navy", target, { multipleBlanks: false, total: 3 })).toBe("Mooney World Navy");
  });

  it("is case-insensitive about that", () => {
    expect(variantTitle("mooney world navy", target, { multipleBlanks: false, total: 3 })).toBe("mooney world navy");
  });

  it("falls back rather than producing an empty name", () => {
    expect(variantTitle("   ", { ...target, colorName: null }, { multipleBlanks: false, total: 2 })).toBe(
      "Untitled mockup",
    );
  });
});

describe("overLimit", () => {
  it("permits a batch at the ceiling", () => {
    expect(overLimit(MAX_VARIANTS)).toBe(false);
  });

  it("catches one past it", () => {
    expect(overLimit(MAX_VARIANTS + 1)).toBe(true);
  });
});
