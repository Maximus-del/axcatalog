import { describe, expect, it } from "vitest";
import {
  auditColorways,
  backCoverage,
  colorwayIssues,
  hasBackPhoto,
  imageSourceOf,
  isTwoSided,
  resolveBlankImage,
} from "./blank-image";
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

describe("imageSourceOf", () => {
  it("recognises the two systems that actually serve images", () => {
    expect(imageSourceOf("https://drive.google.com/thumbnail?id=abc&sz=w1600")).toBe("drive");
    expect(imageSourceOf("https://x.supabase.co/storage/v1/object/public/blanks/a.png")).toBe("bucket");
  });

  it("is 'none' for nothing and 'other' for anything unrecognised", () => {
    expect(imageSourceOf(null)).toBe("none");
    expect(imageSourceOf("")).toBe("none");
    expect(imageSourceOf("https://cdn.example.com/a.png")).toBe("other");
  });
});

describe("colorwayIssues", () => {
  const c = (front: string | null, back: string | null): BlankColor => ({
    id: "c", name: "Aqua", hex: "#0af", imageUrl: front, imageUrlBack: back, available: true,
  });
  const DRIVE_A = "https://drive.google.com/thumbnail?id=a";
  const DRIVE_B = "https://drive.google.com/thumbnail?id=b";
  const BUCKET = "https://x.supabase.co/storage/v1/object/public/blanks/a.png";

  it("is clean when both surfaces come from the same system", () => {
    expect(colorwayIssues(c(DRIVE_A, DRIVE_B))).toEqual([]);
  });

  it("catches the mismatch that caused a wrong colour to ship", () => {
    // Front from the old bucket, back from the Drive: two independent mappings
    // of one garment, agreeing only by luck.
    expect(colorwayIssues(c(BUCKET, DRIVE_A))).toEqual(["mixed-sources"]);
  });

  it("reports each missing surface", () => {
    expect(colorwayIssues(c(null, DRIVE_A))).toEqual(["missing-front"]);
    expect(colorwayIssues(c(DRIVE_A, null))).toEqual(["missing-back"]);
    expect(colorwayIssues(c(null, null))).toEqual(["missing-front", "missing-back"]);
  });

  it("does not claim a source mismatch when a surface is simply absent", () => {
    expect(colorwayIssues(c(BUCKET, null))).toEqual(["missing-back"]);
  });
});

describe("auditColorways", () => {
  it("returns only colourways with something to look at, and ignores unavailable ones", () => {
    const b = blank({
      colors: [
        { id: "1", name: "Good", hex: null, imageUrl: "https://drive.google.com/thumbnail?id=a", imageUrlBack: "https://drive.google.com/thumbnail?id=b", available: true },
        { id: "2", name: "Mixed", hex: null, imageUrl: "https://x.supabase.co/storage/v1/object/public/blanks/a.png", imageUrlBack: "https://drive.google.com/thumbnail?id=c", available: true },
        { id: "3", name: "Retired", hex: null, imageUrl: null, imageUrlBack: null, available: false },
      ],
    });
    const out = auditColorways(b);
    expect(out.map((r) => r.color.name)).toEqual(["Mixed"]);
    expect(out[0].issues).toEqual(["mixed-sources"]);
  });
});
