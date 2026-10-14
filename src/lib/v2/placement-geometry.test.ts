import { describe, expect, it } from "vitest";
import {
  MIN_VISIBLE,
  MIN_W,
  applyAspect,
  boxAtPoint,
  centreOn,
  matchesAspect,
  clampBox,
  defaultBox,
  fitToZone,
  fromRows,
  heightFor,
  moveBox,
  nearestZone,
  resizeBox,
  toRows,
  usedSurfaces,
  widthFor,
  type Box,
  type PlacedDesign,
  type ZoneLike,
} from "./placement-geometry";

const box = (x: number, y: number, w: number, h: number): Box => ({ x, y, w, h });

/** Aspect ratio of a box as it would actually render, in pixels. */
const renderedAspect = (b: Box, canvasAspect = 1) => (b.w / b.h) * (1 / canvasAspect);

describe("aspect conversion", () => {
  it("is the identity on a square canvas for square art", () => {
    expect(heightFor(40, 1, 1)).toBe(40);
  });

  it("makes wide art shorter than it is wide", () => {
    expect(heightFor(40, 2, 1)).toBe(20);
  });

  it("makes tall art taller than it is wide", () => {
    expect(heightFor(40, 0.5, 1)).toBe(80);
  });

  it("accounts for a non-square canvas", () => {
    // On a 2:1 canvas, equal pixel dimensions need double the height percentage.
    expect(heightFor(40, 1, 2)).toBe(80);
  });

  it("round-trips through widthFor", () => {
    for (const a of [0.5, 1, 1.6, 3]) {
      expect(widthFor(heightFor(40, a), a)).toBeCloseTo(40, 6);
    }
  });

  it("degrades safely on a nonsense aspect rather than producing NaN", () => {
    expect(heightFor(40, 0)).toBe(40);
    expect(heightFor(40, Number.NaN)).toBe(40);
  });
});

describe("clampBox", () => {
  it("leaves a box that is already on the garment alone", () => {
    expect(clampBox(box(30, 30, 40, 40))).toEqual(box(30, 30, 40, 40));
  });

  it("keeps a graspable sliver on screen when dragged off the right edge", () => {
    const out = clampBox(box(500, 30, 40, 40));
    expect(out.x).toBe(100 - MIN_VISIBLE);
  });

  it("keeps a graspable sliver on screen when dragged off the left edge", () => {
    const out = clampBox(box(-500, 30, 40, 40));
    expect(out.x).toBe(MIN_VISIBLE - 40);
  });

  it("allows deliberate overhang for all-over prints", () => {
    // Bigger than the garment and hanging off both sides is a real design.
    const out = clampBox(box(-10, -10, 100, 100));
    expect(out.w).toBe(100);
    expect(out.x).toBeLessThan(0);
  });

  it("refuses to shrink artwork below the minimum", () => {
    expect(clampBox(box(30, 30, 0.1, 0.1)).w).toBe(MIN_W);
  });
});

describe("moveBox", () => {
  it("translates by the delta", () => {
    expect(moveBox(box(30, 30, 20, 20), 5, -10)).toEqual(box(35, 20, 20, 20));
  });

  it("never changes size", () => {
    const out = moveBox(box(30, 30, 20, 20), 900, 900);
    expect(out.w).toBe(20);
    expect(out.h).toBe(20);
  });
});

describe("resizeBox — the no-distortion guarantee", () => {
  const aspects = [0.4, 1, 1.75, 4];
  const handles = ["nw", "ne", "se", "sw"] as const;

  // Boxes are stored rounded to 2dp so the database holds clean percentages,
  // which caps how exactly the aspect can be held. 0.1% relative error on a
  // 12-inch print is 0.012in — an order of magnitude under press tolerance —
  // so that is the guarantee, asserted relatively rather than to a decimal
  // place that would silently depend on the box's magnitude.
  const ASPECT_TOLERANCE = 0.001;

  it.each(aspects)("preserves aspect %s from every handle, in both directions", (a) => {
    const start = { x: 30, y: 30, w: 20, h: heightFor(20, a) };
    for (const handle of handles) {
      for (const dx of [-15, -3, 3, 15]) {
        const out = resizeBox(start, handle, dx, 999, a);
        const relativeError = Math.abs(renderedAspect(out) - a) / a;
        expect(relativeError, `${handle} dx=${dx} aspect=${a}`).toBeLessThan(ASPECT_TOLERANCE);
      }
    }
  });

  it("does not accumulate aspect drift over a long drag", () => {
    // A real resize is dozens of small deltas, not one big one. Rounding at each
    // step must not compound into visible distortion.
    const a = 1.75;
    let b = { x: 30, y: 30, w: 20, h: heightFor(20, a) };
    for (let i = 0; i < 60; i++) b = resizeBox(b, "se", 0.4, 0, a);
    for (let i = 0; i < 60; i++) b = resizeBox(b, "nw", 0.4, 0, a);
    expect(Math.abs(renderedAspect(b) - a) / a).toBeLessThan(0.001);
  });

  it("ignores the vertical component of the drag entirely", () => {
    const start = { x: 30, y: 30, w: 20, h: 20 };
    const a = resizeBox(start, "se", 6, 0, 1);
    const b = resizeBox(start, "se", 6, 40, 1);
    expect(a).toEqual(b);
  });

  it("holds the opposite corner still when dragging se", () => {
    const start = { x: 30, y: 30, w: 20, h: 20 };
    const out = resizeBox(start, "se", 10, 10, 1);
    expect(out.x).toBe(30);
    expect(out.y).toBe(30);
    expect(out.w).toBe(30);
  });

  it("holds the opposite corner still when dragging nw", () => {
    const start = { x: 30, y: 30, w: 20, h: 20 };
    const out = resizeBox(start, "nw", -10, -10, 1);
    // The south-east corner was at 50/50 and must stay there.
    expect(out.x + out.w).toBeCloseTo(50, 4);
    expect(out.y + out.h).toBeCloseTo(50, 4);
  });

  it("cannot be dragged below the minimum width", () => {
    const out = resizeBox({ x: 30, y: 30, w: 20, h: 20 }, "se", -900, 0, 1);
    expect(out.w).toBe(MIN_W);
  });
});

describe("fitToZone", () => {
  const wideZone: ZoneLike = { zoneId: "high_back", label: "High back", surface: "back", x: 35.4, y: 15.6, w: 34.8, h: 8.7 };
  const squarish: ZoneLike = { zoneId: "center_chest", label: "Center chest", surface: "front", x: 33.9, y: 20.1, w: 31.2, h: 25.8 };

  it("fits inside the zone on both axes, never cropping", () => {
    for (const zone of [wideZone, squarish]) {
      for (const a of [0.5, 1, 2.5]) {
        const out = fitToZone(zone, a);
        expect(out.w).toBeLessThanOrEqual(zone.w + 0.01);
        expect(out.h).toBeLessThanOrEqual(zone.h + 0.01);
      }
    }
  });

  it("centres the artwork in the zone", () => {
    const out = fitToZone(squarish, 1);
    expect(out.x + out.w / 2).toBeCloseTo(squarish.x + squarish.w / 2, 4);
    expect(out.y + out.h / 2).toBeCloseTo(squarish.y + squarish.h / 2, 4);
  });

  it("lets height bind for a short wide zone and tall art", () => {
    // High back is 34.8 x 8.7. Square art must be capped by the 8.7 height.
    const out = fitToZone(wideZone, 1);
    expect(out.w).toBeCloseTo(8.7, 1);
  });

  it("lets width bind when the art is wider than the zone shape", () => {
    const out = fitToZone(squarish, 4);
    expect(out.w).toBeCloseTo(squarish.w, 1);
  });

  it("keeps the artwork undistorted", () => {
    for (const a of [0.6, 1, 3]) {
      expect(renderedAspect(fitToZone(squarish, a))).toBeCloseTo(a, 4);
    }
  });
});

describe("nearestZone", () => {
  const zones: ZoneLike[] = [
    { zoneId: "left_chest", label: "Left chest", surface: "front", x: 26.1, y: 21, w: 11.7, h: 8.6 },
    { zoneId: "center_chest", label: "Center chest", surface: "front", x: 33.9, y: 20.1, w: 31.2, h: 25.8 },
  ];

  it("recognises a box sitting on a zone", () => {
    const onLeftChest = fitToZone(zones[0], 1);
    expect(nearestZone(onLeftChest, zones)?.zoneId).toBe("left_chest");
  });

  it("returns null when the artwork is nowhere near a zone", () => {
    expect(nearestZone(box(80, 80, 10, 10), zones)).toBeNull();
  });

  it("never moves the box — it only reports", () => {
    const b = box(30, 30, 10, 10);
    const copy = { ...b };
    nearestZone(b, zones);
    expect(b).toEqual(copy);
  });
});

describe("drop positioning", () => {
  it("centres a dropped design on the drop point", () => {
    const out = boxAtPoint(50, 40, 1);
    expect(out.x + out.w / 2).toBeCloseTo(50, 4);
    expect(out.y + out.h / 2).toBeCloseTo(40, 4);
  });

  it("clamps a drop near the edge back onto the garment", () => {
    const out = boxAtPoint(99, 99, 1);
    expect(out.x).toBeLessThanOrEqual(100 - MIN_VISIBLE);
  });

  it("gives a sensible default with no drop point", () => {
    const out = defaultBox(1);
    expect(out.x + out.w / 2).toBeCloseTo(50, 4);
  });
});

describe("persistence round trip", () => {
  const placed: PlacedDesign[] = [
    { id: "a", designId: "d1", surface: "front", box: box(30, 30, 20, 20), rotation: 0, zoneId: "center_chest", zoneLabel: "Center chest" },
    { id: "b", designId: "d2", surface: "back", box: box(28, 26, 44, 34), rotation: 15, zoneId: null, zoneLabel: null },
  ];

  it("survives a round trip through the database shape", () => {
    const back = fromRows(toRows(placed));
    expect(back.map((p) => [p.designId, p.surface, p.box, p.rotation, p.zoneId])).toEqual(
      placed.map((p) => [p.designId, p.surface, p.box, p.rotation, p.zoneId]),
    );
  });

  it("assigns sort_order by array position so stacking survives", () => {
    expect(toRows(placed).map((r) => r.sort_order)).toEqual([0, 1]);
  });

  it("restores order from sort_order rather than row order", () => {
    const rows = toRows(placed).reverse();
    expect(fromRows(rows).map((p) => p.designId)).toEqual(["d1", "d2"]);
  });

  it("accepts the string numerics PostgREST returns", () => {
    const restored = fromRows([
      { design_id: "d1", surface: "front", zone_id: null, zone_label: null, x_pct: "30.5", y_pct: "20", w_pct: "40", h_pct: "40", rotation_deg: null, sort_order: 0 },
    ]);
    expect(restored[0].box).toEqual(box(30.5, 20, 40, 40));
    expect(restored[0].rotation).toBe(0);
  });

  it("treats an unrecognised surface as front rather than dropping the placement", () => {
    const restored = fromRows([
      { design_id: "d1", surface: "sleeve", zone_id: null, zone_label: null, x_pct: 1, y_pct: 1, w_pct: 10, h_pct: 10, rotation_deg: 0, sort_order: 0 },
    ]);
    expect(restored[0].surface).toBe("front");
  });
});

describe("usedSurfaces", () => {
  const p = (surface: "front" | "back"): PlacedDesign => ({
    id: surface, designId: "d", surface, box: box(0, 0, 10, 10), rotation: 0, zoneId: null, zoneLabel: null,
  });

  it("reports front only for a front-only mockup", () => {
    expect(usedSurfaces([p("front")])).toEqual(["front"]);
  });

  it("reports back only when the art is only on the back", () => {
    expect(usedSurfaces([p("back")])).toEqual(["back"]);
  });

  it("reports both, front first", () => {
    expect(usedSurfaces([p("back"), p("front")])).toEqual(["front", "back"]);
  });

  it("reports nothing for an empty mockup", () => {
    expect(usedSurfaces([])).toEqual([]);
  });
});

describe("applyAspect — correcting a box built on an assumed square", () => {
  it("keeps width and centre, and fixes height", () => {
    const box = { x: 33, y: 20, w: 34, h: 34 };
    const out = applyAspect(box, 2);
    expect(out.w).toBe(34);
    expect(out.h).toBe(17);
    // centre stays where the operator put it
    expect(out.y + out.h / 2).toBeCloseTo(box.y + box.h / 2, 5);
    expect(out.x).toBe(33);
  });

  it("is idempotent — a corrected box does not drift on a second pass", () => {
    const once = applyAspect({ x: 10, y: 10, w: 40, h: 40 }, 1.5);
    expect(applyAspect(once, 1.5)).toEqual(once);
  });

  it("leaves a box alone when it already matches", () => {
    const box = applyAspect({ x: 10, y: 10, w: 30, h: 30 }, 0.75);
    expect(matchesAspect(box, 0.75)).toBe(true);
  });
});

describe("matchesAspect", () => {
  it("spots the square-by-default bug", () => {
    expect(matchesAspect({ x: 0, y: 0, w: 34, h: 34 }, 1.78)).toBe(false);
  });

  it("tolerates rounding", () => {
    expect(matchesAspect({ x: 0, y: 0, w: 34, h: 22.67 }, 1.5)).toBe(true);
  });

  it("says yes to nonsense rather than corrupting a box", () => {
    expect(matchesAspect({ x: 0, y: 0, w: 34, h: 34 }, 0)).toBe(true);
    expect(matchesAspect({ x: 0, y: 0, w: 34, h: 0 }, 1.5)).toBe(true);
  });
});

describe("centreOn — what the alignment lines are for", () => {
  it("centres on both axes", () => {
    const out = centreOn({ x: 0, y: 0, w: 20, h: 10 }, { x: 50, y: 34 });
    expect(out.x + out.w / 2).toBeCloseTo(50, 5);
    expect(out.y + out.h / 2).toBeCloseTo(34, 5);
  });

  it("touches only the axis it is given", () => {
    const out = centreOn({ x: 7, y: 9, w: 20, h: 10 }, { x: 50 });
    expect(out.x + out.w / 2).toBeCloseTo(50, 5);
    expect(out.y).toBe(9);
  });
});
