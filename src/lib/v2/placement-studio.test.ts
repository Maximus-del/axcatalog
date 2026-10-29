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

import { artRect, heightForArt, mockupFilename, moveBy, resizeBy } from "./placement-studio";

group("placement studio — artwork layer", () => {
  it("box height follows the art at the box's width", () => {
    expect(heightForArt(12, 0.75)).toBe(16);
    expect(heightForArt(10, 2)).toBe(5);
  });

  it("art is contained, centred and top-aligned inside the box", () => {
    const a = artRect({ x: 100, y: 200, w: 400, h: 400 }, 2);
    expect(a).toEqual({ x: 100, y: 200, w: 400, h: 200 });
    const tall = artRect({ x: 100, y: 200, w: 400, h: 400 }, 0.5);
    expect(tall).toEqual({ x: 200, y: 200, w: 200, h: 400 });
  });

  it("drag moves in inches, snaps to centre and stops at the collar", () => {
    const p = { topIn: 4, centerXIn: 0 };
    expect(moveBy(p, 60, 30, 30)).toEqual({ topIn: 5, centerXIn: 2 });
    expect(moveBy(p, 3, 0, 30).centerXIn).toBe(0);
    expect(moveBy(p, 0, -300, 30).topIn).toBe(0);
  });

  it("corner resize widens symmetrically and keeps the art's shape", () => {
    expect(resizeBy({ widthIn: 12, heightIn: 16 }, -30, 0, 30, 0.75)).toEqual({ widthIn: 10, heightIn: 13.375 });
    expect(resizeBy({ widthIn: 12, heightIn: 16 }, 300, 0, 30, null).widthIn).toBe(16);
    expect(resizeBy({ widthIn: 4, heightIn: 4 }, 0, 30, 30, null).heightIn).toBe(5);
  });

  it("names a rendered mockup", () => {
    expect(mockupFilename("Crimzyn Chin back.png", "AXISM 7010", "Smoke Gray", "back")).toBe("Crimzyn-Chin-back_AXISM-7010_Smoke-Gray_BACK.png");
  });
});

import { hasWhiteSheet, knockOutWhite } from "./placement-studio";

group("placement studio — white knock-out", () => {
  // 5x5 white sheet with a black ring around a white centre pixel.
  const make = () => {
    const w = 5, h = 5, d = new Uint8ClampedArray(w * h * 4).fill(255);
    for (const [x, y] of [[1,1],[2,1],[3,1],[1,2],[3,2],[1,3],[2,3],[3,3]]) { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
    return { d, w, h };
  };
  it("spots art on a white sheet", () => {
    const { d, w, h } = make();
    expect(hasWhiteSheet(d, w, h)).toBe(true);
    const t = new Uint8ClampedArray(16).fill(0);
    expect(hasWhiteSheet(t, 2, 2)).toBe(false);
  });
  it("clears only the white touching the edges, keeps white inside the design", () => {
    const { d, w, h } = make();
    expect(knockOutWhite(d, w, h)).toBe(16);
    expect(d[(0 * w + 0) * 4 + 3]).toBe(0);
    expect(d[(2 * w + 2) * 4 + 3]).toBe(255);
    expect(d[(1 * w + 1) * 4 + 3]).toBe(255);
  });
});

import { normalizeDeg, rotationWords } from "./placement-studio";

group("placement studio — rotation", () => {
  it("normalises angles and says which way", () => {
    expect(normalizeDeg(370)).toBe(10);
    expect(normalizeDeg(-190)).toBe(170);
    expect(normalizeDeg(181)).toBe(-179);
    expect(rotationWords(0)).toBe("");
    expect(rotationWords(12)).toBe("rotated 12° clockwise");
    expect(rotationWords(-7.5)).toBe("rotated 7.5° counter-clockwise");
  });
  it("puts the turn in the GPT line", () => {
    expect(describe({ name: "Full back", view: "back", widthIn: 12, heightIn: 14, topIn: 4, centerXIn: 0, rotationDeg: -5 }, "AXISM 7010")).toContain("centred, rotated 5° counter-clockwise.");
  });
});
