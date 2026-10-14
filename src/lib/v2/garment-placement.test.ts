import { describe, expect, it } from "vitest";
import { defaultsFor, startGuides, startGuidesBoth, startPoint } from "./garment-placement";

const LIVE_TYPES = ["tee", "long_sleeve", "hoodie", "zip_hoodie", "crewneck", "tank", "polo", "shorts", "sweatpants", "hat"];

describe("every garment AX stocks has a starting point", () => {
  for (const type of LIVE_TYPES) {
    it(type, () => {
      const d = defaultsFor(type);
      expect(d.width).toBeGreaterThan(0);
      expect(d.note).not.toHaveLength(0);
      for (const surface of ["front", "back"] as const) {
        const p = startPoint(type, surface);
        // A start point that is off the garment is worse than no default.
        expect(p.x).toBeGreaterThan(5);
        expect(p.x).toBeLessThan(95);
        expect(p.y).toBeGreaterThan(5);
        expect(p.y).toBeLessThan(95);
      }
    });
  }
});

describe("garments whose front is interrupted do not start centred", () => {
  it("a zip hoodie starts on the chest, not across the zip", () => {
    expect(startPoint("zip_hoodie", "front").x).toBeGreaterThan(55);
    expect(defaultsFor("zip_hoodie").width).toBeLessThan(defaultsFor("hoodie").width);
  });

  it("a polo starts on the chest, not across the placket", () => {
    expect(startPoint("polo", "front").x).toBeGreaterThan(55);
  });

  it("but a pullover hoodie does start centred", () => {
    expect(startPoint("hoodie", "front").x).toBe(50);
  });
});

describe("bottoms are not tops", () => {
  it("start on a leg and small", () => {
    for (const type of ["shorts", "sweatpants"]) {
      expect(defaultsFor(type).width).toBeLessThanOrEqual(12);
      expect(startPoint(type, "front").x).not.toBe(50);
    }
  });

  it("put the front and back prints on opposite legs, as the photographs show them", () => {
    expect(startPoint("shorts", "front").x).toBeLessThan(50);
    expect(startPoint("shorts", "back").x).toBeGreaterThan(50);
  });
});

describe("a hoodie is not a tee", () => {
  it("starts higher and smaller — the pocket and hood take the space", () => {
    expect(defaultsFor("hoodie").width).toBeLessThan(defaultsFor("tee").width);
    expect(startPoint("hoodie", "front").y).toBeLessThan(startPoint("tee", "front").y);
  });
});

describe("an unknown garment falls back and says so", () => {
  it("uses the plain-top baseline", () => {
    expect(defaultsFor(null).front).toEqual(defaultsFor("tee").front);
    expect(defaultsFor(undefined).note).toMatch(/no garment type recorded/i);
    expect(defaultsFor("something-new").note).toMatch(/no garment type recorded/i);
  });
});

describe("guides", () => {
  it("start where the artwork starts, so 'centre on lines' is a no-op on a fresh placement", () => {
    for (const type of LIVE_TYPES) {
      for (const surface of ["front", "back"] as const) {
        expect(startGuides(type, surface)).toEqual(startPoint(type, surface));
      }
    }
  });

  it("seeds both surfaces at once", () => {
    expect(startGuidesBoth("shorts")).toEqual({ front: { x: 33, y: 48 }, back: { x: 67, y: 44 } });
  });

  it("is case-insensitive about the garment type", () => {
    expect(defaultsFor("HOODIE")).toEqual(defaultsFor("hoodie"));
  });
});
