// The design-template matcher is the one piece of real math in the ecosystem —
// it decides what operators get recommended, in both directions. Locking its
// behaviour down so a refactor can't silently change rankings.
import { describe, it, expect } from "vitest";
import {
  matchVectors,
  rankAthletesForTemplate,
  recommendDesignTemplates,
  templateSignature,
  templatePreviewUrl,
  type AthleteLite,
  type DesignTemplate,
} from "./commerce";

const athlete = (id: string, name: string): AthleteLite => ({
  id,
  organization_id: "org",
  slug: id,
  full_name: name,
  first_name: name.split(" ")[0],
  last_name: name.split(" ")[1] ?? "",
  position: null,
  league: null,
  status: "active",
  image_url: null,
  is_demo: true,
});

const template = (id: string, name: string, attributes: Record<string, number>): DesignTemplate => ({
  id,
  name,
  style: name,
  description: null,
  compatible_product_types: ["athlete_merch"],
  tags: [],
  color_tendencies: [],
  sport_compatibility: [],
  attributes,
  preview_images: [],
});

describe("matchVectors", () => {
  it("scores identical vectors as a perfect match", () => {
    expect(matchVectors({ vintage: 1, bold: 0.5 }, { vintage: 1, bold: 0.5 }).score).toBeCloseTo(1, 6);
  });

  it("scores vectors with nothing in common as zero", () => {
    expect(matchVectors({ vintage: 1 }, { minimal: 1 }).score).toBe(0);
  });

  it("is scale-invariant — magnitude must not beat direction", () => {
    const a = matchVectors({ vintage: 0.2, bold: 0.1 }, { vintage: 1, bold: 0.5 });
    const b = matchVectors({ vintage: 1, bold: 0.5 }, { vintage: 1, bold: 0.5 });
    expect(a.score).toBeCloseTo(b.score, 6);
  });

  it("returns a neutral result for an empty profile rather than throwing", () => {
    expect(matchVectors({}, { vintage: 1 })).toEqual({ score: 0, reasons: [] });
    expect(matchVectors(null, { vintage: 1 })).toEqual({ score: 0, reasons: [] });
    expect(matchVectors({ vintage: 1 }, null).score).toBe(0);
  });

  it("orders reasons by contribution, not by profile order, and caps them at four", () => {
    const { reasons } = matchVectors(
      { minimal: 0.9, luxury: 0.5, vintage: 0.1, bold: 0.4, y2k: 0.3 },
      { minimal: 0.2, luxury: 0.9, vintage: 0.9, bold: 0.5, y2k: 0.4 },
    );
    // luxury .45 > vintage .09? no — bold .20 and minimal .18 sit between.
    expect(reasons).toEqual(["luxury", "bold", "minimal", "y2k"]);
    expect(reasons).toHaveLength(4);
  });

  it("ignores attributes that only one side has", () => {
    expect(matchVectors({ vintage: 1, unknown_attr: 5 }, { vintage: 1 }).reasons).toEqual(["vintage"]);
  });
});

describe("rankAthletesForTemplate", () => {
  const streetwear = template("t1", "Streetwear", { streetwear: 0.95, bold: 0.8, y2k: 0.5, minimal: 0.2 });

  it("ranks the athlete whose profile matches the style first", () => {
    const ranked = rankAthletesForTemplate(
      streetwear,
      [athlete("a", "Minimal Guy"), athlete("b", "Street Guy")],
      { a: { minimal: 0.9, luxury: 0.5 }, b: { streetwear: 0.9, bold: 0.8 } },
    );
    expect(ranked[0].athlete.id).toBe("b");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].reasons).toContain("streetwear");
  });

  it("flags athletes with no preference profile instead of dropping them", () => {
    const ranked = rankAthletesForTemplate(streetwear, [athlete("c", "No Profile")], {});
    expect(ranked[0].hasProfile).toBe(false);
    expect(ranked[0].score).toBe(0);
  });

  it("treats an empty stored profile as no profile", () => {
    const ranked = rankAthletesForTemplate(streetwear, [athlete("d", "Blank Profile")], { d: {} });
    expect(ranked[0].hasProfile).toBe(false);
  });
});

describe("recommendDesignTemplates", () => {
  const templates = [
    template("t1", "Minimal", { minimal: 0.95, luxury: 0.5 }),
    template("t2", "Streetwear", { streetwear: 0.95, bold: 0.8 }),
  ];

  it("agrees with the reverse ranking — both directions use the same math", () => {
    const profile = { streetwear: 0.9, bold: 0.8 };
    const forward = recommendDesignTemplates(profile, templates);
    const reverse = rankAthletesForTemplate(templates[1], [athlete("a", "Street Guy")], { a: profile });
    expect(forward[0].template.id).toBe("t2");
    expect(forward[0].score).toBeCloseTo(reverse[0].score, 6);
  });

  it("returns every template unranked when there is no profile yet", () => {
    const out = recommendDesignTemplates(undefined, templates);
    expect(out).toHaveLength(2);
    expect(out.every((t) => t.score === 0 && t.reasons.length === 0)).toBe(true);
  });
});

describe("templateSignature", () => {
  it("returns the strongest attributes in order, dropping zeroes", () => {
    expect(templateSignature({ bold: 0.8, vintage: 0.9, minimal: 0 }, 3)).toEqual([
      { key: "vintage", value: 0.9 },
      { key: "bold", value: 0.8 },
    ]);
  });

  it("respects the limit and handles missing attributes", () => {
    expect(templateSignature({ a: 1, b: 0.9, c: 0.8 }, 2)).toHaveLength(2);
    expect(templateSignature(null)).toEqual([]);
  });
});

describe("templatePreviewUrl", () => {
  it("reads whichever shape the preview was stored in", () => {
    expect(templatePreviewUrl({ preview_images: ["https://a/b.png"] })).toBe("https://a/b.png");
    expect(templatePreviewUrl({ preview_images: [{ url: "https://c/d.png" }] })).toBe("https://c/d.png");
    expect(templatePreviewUrl({ preview_images: [{ src: "https://e/f.png" }] })).toBe("https://e/f.png");
  });

  it("skips empty entries and falls back to null so the plate renders", () => {
    expect(templatePreviewUrl({ preview_images: [{ url: "" }, "  ", "https://g/h.png"] })).toBe("https://g/h.png");
    expect(templatePreviewUrl({ preview_images: [] })).toBeNull();
    expect(templatePreviewUrl({ preview_images: null })).toBeNull();
  });
});
