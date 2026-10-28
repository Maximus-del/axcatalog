import { describe as group, expect, it } from "vitest";
import { BUILT_IN_PRESETS, NECK_SHOULDER_IN, defaultCalibration, describe, oversize, presetRect, pxPerInch, referenceFilename, sideWords, toPreset } from "./placement-studio";

group("placement studio", () => {
  const cal = { collarX: 0.5, collarY: 0.2, chestLeft: 0.2, chestRight: 0.8, chestWidthIn: 22 };

  it("pixels per inch comes from the chest width", () => {
    // 60% of 1100px = 660px across 22in -> 30 px/in
    expect(pxPerInch(cal, 1100)).toBeCloseTo(30);
  });

  it("a centred 4x4 sits on the collar line, 3in down", () => {
    const r = presetRect({ widthIn: 4, heightIn: 4, topIn: 3, centerXIn: 0 }, cal, 1100, 1100);
    expect(r.w).toBeCloseTo(120);
    expect(r.h).toBeCloseTo(120);
    expect(r.x + r.w / 2).toBeCloseTo(550);
    expect(r.y).toBeCloseTo(220 + 90);
  });

  it("left chest moves to the viewer's right by the neck-to-shoulder distance", () => {
    const r = presetRect({ widthIn: 3.5, heightIn: 3.5, topIn: 3, centerXIn: NECK_SHOULDER_IN }, cal, 1100, 1100);
    expect(r.x + r.w / 2).toBeCloseTo(550 + 3.5 * 30);
  });

  it("flags anything over 16 x 20", () => {
    expect(oversize({ widthIn: 16, heightIn: 20 })).toBe(false);
    expect(oversize({ widthIn: 16.5, heightIn: 10 })).toBe(true);
  });

  it("writes a line GPT can follow", () => {
    const line = describe({ name: "Center chest logo 4×4", view: "front", widthIn: 4, heightIn: 4, topIn: 3, centerXIn: 0 }, "AXISM 7010");
    expect(line).toBe("AXISM 7010 · FRONT · Center chest logo 4×4: print area 4 × 4 in, top edge 3 in below the collar, centred. Keep the artwork inside the green box.");
    expect(sideWords(3.5)).toContain("wearer's left chest");
    expect(sideWords(-2)).toContain("wearer's right chest");
  });

  it("ships the house presets, every one within the production limit", () => {
    expect(BUILT_IN_PRESETS.map((p) => p.name)).toEqual(expect.arrayContaining(["Big title text", "Center chest logo 4×4", "Left chest 3.5×3.5", "Small autograph", "Full back"]));
    for (const p of BUILT_IN_PRESETS) expect(oversize(p)).toBe(false);
  });

  it("maps a saved row and names the export", () => {
    const p = toPreset({ id: "1", name: "Big title", view: "back", width_in: "11", height_in: 3, top_in: 2, center_x_in: 0 });
    expect(p).toMatchObject({ view: "back", widthIn: 11, heightIn: 3, topIn: 2 });
    expect(referenceFilename("AXISM 7010", { name: "Center chest logo 4×4", view: "front" })).toBe("PLACEMENT_AXISM-7010_FRONT_Center-chest-logo-4x4.png");
    expect(defaultCalibration("back").collarY).toBeLessThan(defaultCalibration("front").collarY);
  });
});
