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
