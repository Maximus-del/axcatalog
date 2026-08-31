// AX OS V2 — free placement geometry.
//
// Everything here is pure. Boxes are PERCENTAGES of the garment image box
// (0–100), the same units as PlacementPreset and the
// `product_print_placements.x_pct` family. Pixels never enter this module; the
// canvas converts at its edges. That keeps a saved placement meaningful at any
// preview size and identical between the operator's screen and the client's.
//
// THE INVARIANT WORTH STATING: artwork is never distorted. Print artwork
// stretched 4% on one axis looks fine on a screen and wrong on a garment, and
// by then it has been approved. Every resize path here is aspect-preserving by
// construction — there is no non-uniform scale to reach for, because there
// should not be one.

/**
 * The two movable alignment lines, as percentages of the garment box.
 *
 * They live here rather than in the canvas component so a module of constants
 * is not exported from a file of components (which breaks fast refresh), and
 * so the geometry that reads them and the component that draws them share one
 * definition.
 */
export interface Guides {
  /** Percentage across the garment box. */
  x: number;
  /** Percentage down the garment box. */
  y: number;
}

/**
 * Where the lines start: centred horizontally, chest height vertically.
 *
 * y = 34 is not the middle of the garment and is not meant to be — it is where
 * a chest print sits, which is where an operator wants a reference the moment
 * the canvas opens.
 */
export const DEFAULT_GUIDES: Guides = { x: 50, y: 34 };

/** Drag payload used to carry a design id from the shelf onto the canvas. */
export const DRAG_MIME = "application/x-ax-design-id";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedDesign {
  /** Local id for this placement, not the design id — one design can be placed twice. */
  id: string;
  designId: string;
  surface: "front" | "back";
  box: Box;
  rotation: number;
  /** The zone this was fitted to, when it was. Null once freely moved. */
  zoneId: string | null;
  zoneLabel: string | null;
}

/**
 * The one conversion from a stored placement box to CSS.
 *
 * Four components used to compute this inline — the editing canvas, the
 * colourway strip, the confirm preview and the mockup detail page — and a
 * fifth copy draws the same maths onto a 2D canvas in mockup-export.ts. Copies
 * of a formula do not stay equal; they drift the day one of them gets a
 * rounding fix, and the symptom is an export that does not match the preview
 * the client already approved.
 */
export function placementStyle(p: { box: Box; rotation: number }): {
  left: string;
  top: string;
  width: string;
  height: string;
  transform: string | undefined;
} {
  return {
    left: `${p.box.x}%`,
    top: `${p.box.y}%`,
    width: `${p.box.w}%`,
    height: `${p.box.h}%`,
    transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
  };
}

/** Smallest sensible artwork, as a percentage of the garment width. */
export const MIN_W = 3;
export const MAX_W = 100;
/** How much of a box must stay on the garment for it to remain graspable. */
export const MIN_VISIBLE = 2;

/**
 * Height that keeps artwork of aspect `artAspect` (w/h) undistorted inside a
 * canvas of aspect `canvasAspect` (w/h).
 *
 * The two percentages are taken against different axes, so equal percentages
 * are not equal pixels unless the canvas is square. This is the conversion that
 * keeps a circle a circle.
 */
export function heightFor(wPct: number, artAspect: number, canvasAspect = 1): number {
  if (!Number.isFinite(artAspect) || artAspect <= 0) return wPct;
  return (wPct * canvasAspect) / artAspect;
}

export function widthFor(hPct: number, artAspect: number, canvasAspect = 1): number {
  if (!Number.isFinite(artAspect) || artAspect <= 0) return hPct;
  return (hPct * artAspect) / canvasAspect;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n * 100) / 100;

export function roundBox(b: Box): Box {
  return { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) };
}

/**
 * Keep a box on the garment.
 *
 * Deliberately permissive about overhang: artwork running off the edge of the
 * photograph is a legitimate design (an all-over back print), so the rule is
 * that a graspable amount stays on — not that the whole box fits.
 */
export function clampBox(b: Box): Box {
  const w = clamp(b.w, MIN_W, MAX_W);
  const h = Math.max(b.h, 0.5);
  return roundBox({
    x: clamp(b.x, MIN_VISIBLE - w, 100 - MIN_VISIBLE),
    y: clamp(b.y, MIN_VISIBLE - h, 100 - MIN_VISIBLE),
    w,
    h,
  });
}

export function moveBox(b: Box, dxPct: number, dyPct: number): Box {
  return clampBox({ ...b, x: b.x + dxPct, y: b.y + dyPct });
}

export type Handle = "nw" | "ne" | "se" | "sw";

/**
 * Aspect-preserving corner resize.
 *
 * The dragged corner moves and the opposite corner stays put, which is what
 * makes a resize feel anchored rather than sliding. Width drives and height is
 * derived, so the aspect cannot drift whichever way the pointer travels.
 */
export function resizeBox(
  b: Box,
  handle: Handle,
  dxPct: number,
  _dyPct: number,
  artAspect: number,
  canvasAspect = 1,
): Box {
  const anchorX = handle === "nw" || handle === "sw" ? b.x + b.w : b.x;
  const anchorY = handle === "nw" || handle === "ne" ? b.y + b.h : b.y;

  const widthDelta = handle === "ne" || handle === "se" ? dxPct : -dxPct;
  const nextW = clamp(b.w + widthDelta, MIN_W, MAX_W);
  const nextH = heightFor(nextW, artAspect, canvasAspect);

  const x = handle === "nw" || handle === "sw" ? anchorX - nextW : anchorX;
  const y = handle === "nw" || handle === "ne" ? anchorY - nextH : anchorY;

  return clampBox({ x, y, w: nextW, h: nextH });
}

/* ------------------------------------------------------------------- zones */

export interface ZoneLike {
  zoneId: string;
  label: string;
  surface: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Drop artwork into a print zone: centred, as large as fits, undistorted.
 *
 * A zone is a physical printable rectangle, so artwork must fit INSIDE it on
 * both axes rather than fill it by cropping. Whichever axis binds decides the
 * size; the artwork is centred in the slack of the other.
 */
export function fitToZone(zone: ZoneLike, artAspect: number, canvasAspect = 1): Box {
  const byWidth = zone.w;
  const byHeight = widthFor(zone.h, artAspect, canvasAspect);
  const w = clamp(Math.min(byWidth, byHeight), MIN_W, MAX_W);
  const h = heightFor(w, artAspect, canvasAspect);
  return roundBox({
    x: zone.x + (zone.w - w) / 2,
    y: zone.y + (zone.h - h) / 2,
    w,
    h,
  });
}

function centre(b: { x: number; y: number; w: number; h: number }) {
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 };
}

/**
 * The zone a freely-placed box sits closest to, within `tolerance`.
 *
 * This TELLS the operator "that's basically left chest"; it never moves
 * anything on its own. Silently snapping artwork someone positioned by hand is
 * the fastest way to make a direct-manipulation canvas feel hostile.
 */
export function nearestZone(box: Box, zones: ZoneLike[], tolerance = 12): ZoneLike | null {
  const { cx, cy } = centre(box);
  let best: { zone: ZoneLike; d: number } | null = null;
  for (const z of zones) {
    const c = centre(z);
    const d = Math.hypot(c.cx - cx, c.cy - cy);
    if (!best || d < best.d) best = { zone: z, d };
  }
  return best && best.d <= tolerance ? best.zone : null;
}

/**
 * Re-fit a box to a newly measured artwork aspect, keeping its centre and width.
 *
 * Aspect is only knowable once the image has decoded, and artwork is routinely
 * placed before that — a click-to-place from the shelf, or a drop of a design
 * that has never rendered on the canvas. Those placements are built on an
 * assumed square, so the SAVED w_pct/h_pct described a box the artwork does not
 * fill. The preview hid it (object-contain letterboxes inside the box) but the
 * stored geometry was wrong, and the production spec is computed from it.
 *
 * Correcting is safe at any time because every resize path is aspect-preserving:
 * a box's proportions always equal the aspect that was assumed when it was
 * built, so a mismatch is always a stale assumption and never operator intent.
 */
export function applyAspect(b: Box, artAspect: number, canvasAspect = 1): Box {
  const h = heightFor(b.w, artAspect, canvasAspect);
  return clampBox({ x: b.x, y: b.y + (b.h - h) / 2, w: b.w, h });
}

/** Whether a box's proportions already match the measured artwork. */
export function matchesAspect(b: Box, artAspect: number, canvasAspect = 1, tolerance = 0.02): boolean {
  if (!Number.isFinite(artAspect) || artAspect <= 0 || b.h <= 0) return true;
  return Math.abs(b.w / b.h - artAspect / canvasAspect) <= tolerance;
}

/**
 * Centre a box on a point — the alignment lines' intersection, in practice.
 *
 * The guides were references and nothing more, which meant "centre this on the
 * shirt" was still done by eye and still came out 1% off. Pass only the axis
 * you mean: centring vertically when you only wanted horizontal is exactly the
 * kind of help nobody asks for.
 */
export function centreOn(b: Box, at: { x?: number; y?: number }): Box {
  return clampBox({
    ...b,
    x: at.x == null ? b.x : at.x - b.w / 2,
    y: at.y == null ? b.y : at.y - b.h / 2,
  });
}

/** Where a design lands when dropped with no particular spot in mind. */
export function defaultBox(artAspect: number, canvasAspect = 1): Box {
  const w = 34;
  const h = heightFor(w, artAspect, canvasAspect);
  return roundBox({ x: 50 - w / 2, y: 34 - h / 2, w, h });
}

/** Drop point → a box centred on it, for dragging artwork onto a specific spot. */
export function boxAtPoint(xPct: number, yPct: number, artAspect: number, canvasAspect = 1): Box {
  const w = 34;
  const h = heightFor(w, artAspect, canvasAspect);
  return clampBox({ x: xPct - w / 2, y: yPct - h / 2, w, h });
}

/* ------------------------------------------------------------ persistence */

export interface PlacementRow {
  design_id: string;
  surface: string;
  zone_id: string | null;
  zone_label: string | null;
  x_pct: number | string;
  y_pct: number | string;
  w_pct: number | string;
  h_pct: number | string;
  rotation_deg: number | string | null;
  sort_order: number;
}

export function toRows(placed: PlacedDesign[]): PlacementRow[] {
  return placed.map((p, i) => ({
    design_id: p.designId,
    surface: p.surface,
    zone_id: p.zoneId,
    zone_label: p.zoneLabel,
    x_pct: p.box.x,
    y_pct: p.box.y,
    w_pct: p.box.w,
    h_pct: p.box.h,
    rotation_deg: p.rotation,
    sort_order: i,
  }));
}

export function fromRows(rows: PlacementRow[]): PlacedDesign[] {
  return [...rows]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r, i) => ({
      id: `${r.design_id}-${r.surface}-${i}`,
      designId: r.design_id,
      surface: r.surface === "back" ? ("back" as const) : ("front" as const),
      box: roundBox({ x: Number(r.x_pct), y: Number(r.y_pct), w: Number(r.w_pct), h: Number(r.h_pct) }),
      rotation: Number(r.rotation_deg) || 0,
      zoneId: r.zone_id,
      zoneLabel: r.zone_label,
    }));
}

/**
 * Which surfaces this mockup actually uses.
 *
 * Drives what gets saved and what a client is shown: a front-only design makes
 * a front-only mockup rather than an empty back view nobody asked for.
 */
export function usedSurfaces(placed: PlacedDesign[]): Array<"front" | "back"> {
  const out: Array<"front" | "back"> = [];
  if (placed.some((p) => p.surface === "front")) out.push("front");
  if (placed.some((p) => p.surface === "back")) out.push("back");
  return out;
}
