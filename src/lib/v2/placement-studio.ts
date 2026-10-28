// Placement Studio — where a print goes, in inches, on a real blank photo.
//
// The point is a reference GPT (or a printer) can follow exactly: "Center chest
// logo, 4 × 4 in, top edge 3 in below the collar, centred". So everything is
// stored in INCHES measured from the collar, never in pixels: the same preset
// lands in the same physical spot on any photo of that blank once the photo is
// calibrated (where the collar is, and how wide the chest is).
//
// Chase's house placements (Oct 27):
//   - Big title text across the chest — the staple (Strength Club, Provengers)
//   - Center chest logo 3.5 × 3.5 or 4 × 4
//   - Left chest: same size as the center chest, centred on the line where the
//     neck meets the shoulder (wearer's left = viewer's right)
//   - Small autograph at center chest: driven by width, much shorter than a logo
//   - Full back, never bigger than 16 × 20

export type View = "front" | "back";

export interface Preset {
  id?: string;
  name: string;
  view: View;
  widthIn: number;
  heightIn: number;
  /** Top edge, inches below the collar seam. */
  topIn: number;
  /** 0 = centred. Positive = viewer's right (the wearer's left chest). */
  centerXIn: number;
  notes?: string | null;
  builtIn?: boolean;
}

/** Where the photo's landmarks are, as fractions of the drawn image (0–1). */
export interface Calibration {
  /** Collar seam at the centre of the neckline. */
  collarX: number;
  collarY: number;
  /** Body edges at the chest (armpit level). */
  chestLeft: number;
  chestRight: number;
  /** Real chest width of the sample garment, flat, in inches. */
  chestWidthIn: number;
}

export const MAX_PRINT = { widthIn: 16, heightIn: 20 } as const;

/** Half the neck opening on an adult tee — where the neck meets the shoulder. */
export const NECK_SHOULDER_IN = 3.5;

export const BUILT_IN_PRESETS: Preset[] = [
  { name: "Big title text", view: "front", widthIn: 11, heightIn: 3.5, topIn: 3.5, centerXIn: 0, notes: "The staple — Strength Club / Provengers style.", builtIn: true },
  { name: "Center chest logo 4×4", view: "front", widthIn: 4, heightIn: 4, topIn: 3, centerXIn: 0, builtIn: true },
  { name: "Center chest logo 3.5×3.5", view: "front", widthIn: 3.5, heightIn: 3.5, topIn: 3, centerXIn: 0, builtIn: true },
  { name: "Left chest 3.5×3.5", view: "front", widthIn: 3.5, heightIn: 3.5, topIn: 3, centerXIn: NECK_SHOULDER_IN, notes: "Centred on the line where the neck meets the shoulder.", builtIn: true },
  { name: "Left chest 3×3", view: "front", widthIn: 3, heightIn: 3, topIn: 3, centerXIn: NECK_SHOULDER_IN, builtIn: true },
  { name: "Small autograph", view: "front", widthIn: 4.5, heightIn: 1.5, topIn: 3, centerXIn: 0, notes: "Width-driven; much shorter than a logo.", builtIn: true },
  { name: "Full back", view: "back", widthIn: 12, heightIn: 16, topIn: 4, centerXIn: 0, notes: "Never larger than 16 × 20.", builtIn: true },
  { name: "Upper back text", view: "back", widthIn: 11, heightIn: 3, topIn: 2.5, centerXIn: 0, builtIn: true },
];

/**
 * A starting calibration for a square, front-on flat-lay of an adult tee.
 * Close enough to start; the operator lines the guides up once per photo.
 */
export function defaultCalibration(view: View): Calibration {
  return view === "front"
    ? { collarX: 0.5, collarY: 0.2, chestLeft: 0.2, chestRight: 0.8, chestWidthIn: 22 }
    : { collarX: 0.5, collarY: 0.16, chestLeft: 0.2, chestRight: 0.8, chestWidthIn: 22 };
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Pixels per inch on a drawn image of width `imageW`. */
export function pxPerInch(c: Calibration, imageW: number): number {
  const span = Math.abs(c.chestRight - c.chestLeft) * imageW;
  return c.chestWidthIn > 0 ? span / c.chestWidthIn : 0;
}

export interface Rect { x: number; y: number; w: number; h: number }

/** The preset's box in image pixels (image drawn at imageW × imageH). */
export function presetRect(p: Pick<Preset, "widthIn" | "heightIn" | "topIn" | "centerXIn">, c: Calibration, imageW: number, imageH: number): Rect {
  const ppi = pxPerInch(c, imageW);
  const w = p.widthIn * ppi;
  const h = p.heightIn * ppi;
  const cx = c.collarX * imageW + p.centerXIn * ppi;
  return { x: cx - w / 2, y: c.collarY * imageH + p.topIn * ppi, w, h };
}

/** True when the box breaks the 16 × 20 production limit. */
export function oversize(p: Pick<Preset, "widthIn" | "heightIn">): boolean {
  return p.widthIn > MAX_PRINT.widthIn || p.heightIn > MAX_PRINT.heightIn;
}

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/** Where horizontally, in words. */
export function sideWords(centerXIn: number): string {
  if (Math.abs(centerXIn) < 0.05) return "centred";
  const side = centerXIn > 0 ? "wearer's left chest (viewer's right)" : "wearer's right chest (viewer's left)";
  return `${n(Math.abs(centerXIn))} in from centre on the ${side}`;
}

/** The one line handed to GPT / a printer alongside the PNG. */
export function describe(p: Pick<Preset, "name" | "view" | "widthIn" | "heightIn" | "topIn" | "centerXIn">, blank: string): string {
  return `${blank} · ${p.view.toUpperCase()} · ${p.name}: print area ${n(p.widthIn)} × ${n(p.heightIn)} in, top edge ${n(p.topIn)} in below the collar, ${sideWords(p.centerXIn)}. Keep the artwork inside the green box.`;
}

/** Saved row -> Preset. */
export function toPreset(r: Record<string, unknown>): Preset {
  return {
    id: String(r.id),
    name: String(r.name ?? "Preset"),
    view: r.view === "back" ? "back" : "front",
    widthIn: Number(r.width_in ?? 4),
    heightIn: Number(r.height_in ?? 4),
    topIn: Number(r.top_in ?? 3),
    centerXIn: Number(r.center_x_in ?? 0),
    notes: (r.notes as string | null) ?? null,
  };
}

/** A filename for the exported reference. */
export function referenceFilename(blank: string, p: Pick<Preset, "name" | "view">): string {
  const slug = (s: string) => s.replace(/[×x]/g, "x").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `PLACEMENT_${slug(blank)}_${p.view.toUpperCase()}_${slug(p.name)}.png`;
}
