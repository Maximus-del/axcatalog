import { describe, expect, it } from "vitest";
import { backCoverage, hasBackPhoto, isTwoSided, resolveBlankImage } from "./blank-image";
import type { Blank, BlankColor } from "./types";

const color = (name: string, front: string | null, back: string | null, available = true): BlankColor => ({
  id: name, name, hex: "#111", imageUrl: front, imageUrlBack: back, available,
});

const blank = (over: Partial<Blank> = {}): Blank => ({
  id: "b1", name: "Hoodie", brand: "CC", styleNumber: "CCHOD475", sku: null,
  garmentType: "hoodie", imageUrl: "hero", cost: 1, priceAthlete: 2, priceCorporate: 3,
  priceStandard: 4, availability: "available",
  colors: [color("Aqua", "f-aqua", "b-aqua"), color("Sand", "f-sand", null)],
  sizes: [], assortments: [], missingCost: false, missingPhoto: false, missingAssortment: false,
  ...over,
});

describe("resolveBlankImage — the bug this guards", () => {
  it("uses the real back photograph when one exists", () => {
    const out = resolveBlankImage({ blank: blank(), colorName: "Aqua", surface: "back" });
    expect(out).toEqual({ url: "b-aqua", source: "colorway-back", approximate: false });
  });

  it("never silently passes the front off as the back", () => {
    // Sand has no back shot. Falling back is allowed; pretending is not.
    const out = resolveBlankImage({ blank: blank(), colorName: "Sand", surface: "back" });
    expect(out.url).toBe("f-sand");
    expect(out.approximate).toBe(true);
  });

  it("marks the catalogue hero as approximate once a colour is chosen", () => {
    const b = blank({ colors: [color("Ghost", null, null)] });
    const out = resolveBlankImage({ blank: b, colorName: "Ghost", surface: "front" });
    expect(out).toEqual({ url: "hero", source: "blank", approximate: true });
  });

  it("is not approximate when the colourway's own front is used", () => {
    expect(resolveBlankImage({ blank: blank(), colorName: "Aqua", surface: "front" }).approximate).toBe(false);
  });

  it("reports nothing rather than throwing with no blank", () => {
    expect(resolveBlankImage({ blank: null })).toEqual({ url: null, source: "none", approximate: false });
  });
});

describe("isTwoSided", () => {
  it("treats tops as two-sided", () => {
    for (const t of ["tee", "hoodie", "crewneck", "long_sleeve", "tank", "polo", "zip_hoodie"]) {
      expect(isTwoSided(t), t).toBe(true);
    }
  });

  it("does not push a back surface on bottoms or headwear", () => {
    for (const t of ["sweatpants", "shorts", "hat", "other", null, undefined]) {
      expect(isTwoSided(t), String(t)).toBe(false);
    }
  });
});

describe("hasBackPhoto", () => {
  it("is per-colourway when a colour is given", () => {
    expect(hasBackPhoto(blank(), "Aqua")).toBe(true);
    expect(hasBackPhoto(blank(), "Sand")).toBe(false);
  });

  it("falls back to whether the blank has any back photography at all", () => {
    expect(hasBackPhoto(blank())).toBe(true);
    expect(hasBackPhoto(blank({ colors: [color("Sand", "f", null)] }))).toBe(false);
  });

  it("is false with no blank", () => {
    expect(hasBackPhoto(null, "Aqua")).toBe(false);
  });
});

describe("backCoverage", () => {
  it("counts only available colourways", () => {
    const b = blank({ colors: [color("Aqua", "f", "b"), color("Old", "f", "b", false)] });
    expect(backCoverage(b)).toEqual({ withBack: 1, total: 1 });
  });
});
