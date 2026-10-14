import { describe, expect, it } from "vitest";
import {
  PLACEMENT_PRESETS,
  categoryForGarment,
  mergeZones,
  presetById,
  presetsFor,
  toPercent,
  type PrintZoneRow,
} from "./placements";

// The seven rows that are actually live in `print_zones`, verbatim — including
// the 0–1 fractional geometry that the presets do NOT use.
const LIVE: PrintZoneRow[] = [
  { garment_category: "apparel", surface: "front", zone_id: "left_chest", label: "Left chest", x: 0.261, y: 0.21, w: 0.117, h: 0.086 },
  { garment_category: "apparel", surface: "front", zone_id: "center_chest", label: "Center chest", x: 0.339, y: 0.201, w: 0.312, h: 0.258 },
  { garment_category: "apparel", surface: "back", zone_id: "high_back", label: "High back", x: 0.354, y: 0.156, w: 0.348, h: 0.087 },
  { garment_category: "apparel", surface: "back", zone_id: "center_back", label: "Center back", x: 0.346, y: 0.278, w: 0.364, h: 0.296 },
  { garment_category: "apparel", surface: "back", zone_id: "low_back", label: "Low back", x: 0.37, y: 0.591, w: 0.316, h: 0.139 },
  { garment_category: "apparel", surface: "back", zone_id: "full_16x20", label: "16x20 back", x: 0.33, y: 0.208, w: 0.396, h: 0.557 },
  { garment_category: "cap", surface: "front", zone_id: "cap_front", label: "Front panel", x: 0.365, y: 0.341, w: 0.3, h: 0.197 },
];

describe("toPercent", () => {
  it("scales fractional geometry into percentages", () => {
    expect(toPercent({ x: 0.261, y: 0.21, w: 0.117, h: 0.086 })).toEqual({
      x: 26.1,
      y: 21,
      w: 11.700000000000001,
      h: 8.6,
    });
  });

  it("leaves values that are already percentages alone", () => {
    expect(toPercent({ x: 58, y: 26, w: 16, h: 12 })).toEqual({ x: 58, y: 26, w: 16, h: 12 });
  });

  it("treats a box that is entirely <= 1 as fractional, since no real placement is 1% of a garment", () => {
    const out = toPercent({ x: 1, y: 1, w: 1, h: 1 });
    expect(out).toEqual({ x: 100, y: 100, w: 100, h: 100 });
  });
});

describe("mergeZones", () => {
  it("converts every live zone into percentage space", () => {
    // The regression this guards: live rows used to merge in unconverted, so
    // every placement box rendered collapsed in the garment's top-left corner.
    for (const zone of mergeZones(LIVE)) {
      const covers = zone.w > 1 && zone.h > 1;
      expect(covers, `${zone.zoneId} has a visible box`).toBe(true);
    }
  });

  it("takes geometry and label from the live row when one exists", () => {
    const merged = mergeZones(LIVE);
    const leftChest = merged.find((p) => p.zoneId === "left_chest");
    expect(leftChest).toMatchObject({ label: "Left chest", x: 26.1, y: 21 });
    // The preset said 58/26 — the database wins.
    expect(leftChest?.x).not.toBe(58);
  });

  it("keeps presets the database has no row for", () => {
    const merged = mergeZones(LIVE);
    const oversized = merged.find((p) => p.zoneId === "front_oversized");
    expect(oversized).toMatchObject({ x: 18, y: 24, w: 64, h: 46 });
  });

  it("adds zones the presets do not know about", () => {
    const merged = mergeZones([
      ...LIVE,
      { garment_category: "apparel", surface: "back", zone_id: "yoke", label: "Yoke", x: 0.4, y: 0.1, w: 0.2, h: 0.05 },
    ]);
    expect(merged.find((p) => p.zoneId === "yoke")).toMatchObject({
      label: "Yoke",
      surface: "back",
      garmentCategory: "apparel",
      x: 40,
    });
  });

  it("returns every preset when nothing is live", () => {
    expect(mergeZones([])).toEqual(PLACEMENT_PRESETS);
  });

  it("accepts the string numerics PostgREST returns for numeric columns", () => {
    const merged = mergeZones([
      { garment_category: "apparel", surface: "front", zone_id: "left_chest", label: "Left chest", x: "0.261", y: "0.210", w: "0.117", h: "0.086" },
    ]);
    expect(merged.find((p) => p.zoneId === "left_chest")).toMatchObject({ x: 26.1, y: 21 });
  });
});

describe("garment category routing", () => {
  it("sends caps to cap placements and everything else to apparel", () => {
    expect(categoryForGarment("cap")).toBe("cap");
    expect(categoryForGarment("hat")).toBe("cap");
    expect(categoryForGarment("tee")).toBe("apparel");
    expect(categoryForGarment(null)).toBe("apparel");
  });

  it("never offers a chest placement on a cap", () => {
    const capZones = presetsFor("cap").map((p) => p.zoneId);
    expect(capZones).toEqual(["cap_front"]);
  });

  it("offers front and back placements on apparel", () => {
    const surfaces = new Set(presetsFor("hoodie").map((p) => p.surface));
    expect(surfaces).toEqual(new Set(["front", "back"]));
  });
});

describe("presetById", () => {
  it("resolves a stored zone_id back to its preset", () => {
    expect(presetById("center_back")?.label).toBe("Standard");
  });

  it("returns null rather than throwing for an unknown or absent id", () => {
    expect(presetById("nope")).toBeNull();
    expect(presetById(null)).toBeNull();
  });
});
