// AX OS V2 — resolving the photograph for a blank.
//
// ONE PLACE, DELIBERATELY.
//
// Blank photography is mid-migration. Today the app reads `blank_colors.image_url`
// and `blanks.image_url` (public `blanks` bucket). The declared source of truth
// going forward is the AX Blank Photography Drive, which is organised
// SUPPLIER / STYLE — NAME / *_COMPLETE_CLEAN / Colour / Front|Back and carries a
// real front AND back shot per colourway — something the current bucket does not
// have at all.
//
// That migration is blocked on a question this module cannot answer: which
// blanks are actually real. Chase's true on-hand inventory is the set drafted
// into Shopify, and the 48 rows in `blanks` predate it. Mapping Drive imagery
// onto blanks that may not survive that reconciliation would be work thrown
// away, and Cotton Collective's filenames carry no style number, so the mapping
// has to be made against a settled list rather than guessed.
//
// So every consumer goes through resolveBlankImage() and nothing else reads
// image_url directly. When the Drive mapping lands it is a change to this file
// and no other.

import type { Blank, BlankColor } from "./types";

export type Surface = "front" | "back";

export interface BlankImageRequest {
  blank: Blank | null;
  /** Colour name as stored on the concept, not a BlankColor id. */
  colorName?: string | null;
  surface?: Surface;
}

export interface BlankImage {
  url: string | null;
  /** Where this came from, so the UI can be honest about what it is showing. */
  source: "colorway" | "colorway-back" | "blank" | "none";
  /** True when the image shown is not actually of the requested colourway. */
  approximate: boolean;
}

export function resolveBlankImage({ blank, colorName, surface = "front" }: BlankImageRequest): BlankImage {
  if (!blank) return { url: null, source: "none", approximate: false };

  const color = colorName ? (blank.colors.find((c) => c.name === colorName) ?? null) : null;

  if (color) {
    // The back shot exists for only a handful of colourways today; the Drive
    // library has one for every colour, which is why this branch is here now.
    if (surface === "back" && color.imageUrlBack) {
      return { url: color.imageUrlBack, source: "colorway-back", approximate: false };
    }
    if (color.imageUrl) {
      // Showing the front while the operator is placing on the back is a real
      // approximation, and the UI says so rather than pretending.
      return { url: color.imageUrl, source: "colorway", approximate: surface === "back" };
    }
  }

  if (blank.imageUrl) {
    // The blank's catalogue shot is whatever colour it was photographed in, so
    // once a colour is chosen this is an approximation by definition.
    return { url: blank.imageUrl, source: "blank", approximate: Boolean(colorName) };
  }

  return { url: null, source: "none", approximate: false };
}

/* ------------------------------------------------------------ the audit */

export type ImageSource = "drive" | "bucket" | "other" | "none";

/**
 * Where a photograph actually comes from.
 *
 * This exists because of a real failure: fronts were serving from the Supabase
 * `blanks` bucket while backs came from the Drive, two independent mappings of
 * the same garment with nothing keeping them in agreement. The result was a
 * colourway whose front and back were different colours, which is invisible
 * until a client is looking at it.
 */
export function imageSourceOf(url: string | null | undefined): ImageSource {
  if (!url) return "none";
  if (url.includes("drive.google")) return "drive";
  if (url.includes("/storage/v1/object/")) return "bucket";
  return "other";
}

export type ColorwayIssue = "missing-front" | "missing-back" | "mixed-sources";

/**
 * What is wrong with a colourway's photography, if anything.
 *
 * `mixed-sources` is the interesting one and the reason this function exists:
 * two surfaces drawn from two different systems are not verifiably the same
 * garment. They may look fine. They are still worth flagging, because the only
 * thing making them agree is luck.
 */
export function colorwayIssues(color: BlankColor): ColorwayIssue[] {
  const front = imageSourceOf(color.imageUrl);
  const back = imageSourceOf(color.imageUrlBack);
  const issues: ColorwayIssue[] = [];
  if (front === "none") issues.push("missing-front");
  if (back === "none") issues.push("missing-back");
  if (front !== "none" && back !== "none" && front !== back) issues.push("mixed-sources");
  return issues;
}

export const ISSUE_LABEL: Record<ColorwayIssue, string> = {
  "missing-front": "No front photo",
  "missing-back": "No back photo",
  "mixed-sources": "Front and back come from different systems — not verifiably the same garment",
};

/** Colourways with something worth looking at, for the catalog audit. */
export function auditColorways(blank: Blank): Array<{ color: BlankColor; issues: ColorwayIssue[] }> {
  return blank.colors
    .filter((c) => c.available)
    .map((color) => ({ color, issues: colorwayIssues(color) }))
    .filter((r) => r.issues.length > 0);
}

/** A flat colour chip for a colourway with no photography of its own. */
export function swatchFor(color: BlankColor | null | undefined): string {
  return color?.hex ?? "hsl(var(--ax-line))";
}

/**
 * Garment types where the back is a real surface an operator will print on.
 *
 * Chase's rule, and it matches the photography: a top always has a front and a
 * back. Bottoms and headwear have a back in the geometric sense, but nobody is
 * placing a chest logo on the back of a pair of sweatpants, so the back surface
 * is offered without being pushed.
 */
const TWO_SIDED = new Set([
  "tee",
  "long_sleeve",
  "hoodie",
  "zip_hoodie",
  "crewneck",
  "tank",
  "polo",
  "jersey",
]);

export function isTwoSided(garmentType: string | null | undefined): boolean {
  return TWO_SIDED.has((garmentType ?? "").toLowerCase());
}

/**
 * Whether this blank can actually show a back for a given colourway.
 *
 * Distinct from isTwoSided(): one is about the garment, the other about the
 * photography. A hoodie is always two-sided; whether AX has shot its back is a
 * separate fact, and the canvas needs to state which of the two is missing
 * rather than showing the front and hoping nobody notices.
 */
export function hasBackPhoto(blank: Blank | null, colorName?: string | null): boolean {
  if (!blank) return false;
  if (colorName) {
    const c = blank.colors.find((x) => x.name === colorName);
    if (c) return Boolean(c.imageUrlBack);
  }
  return blank.colors.some((c) => Boolean(c.imageUrlBack));
}

/** Back-photography coverage across a blank's available colourways. */
export function backCoverage(blank: Blank): { withBack: number; total: number } {
  const available = blank.colors.filter((c) => c.available);
  return {
    withBack: available.filter((c) => Boolean(c.imageUrlBack)).length,
    total: available.length,
  };
}

/**
 * How much of a blank's colour range is actually photographed.
 *
 * Surfaced in the picker because "24 colours" and "24 colours you can show a
 * client" are different numbers, and the operator should know which one they
 * are looking at before they build a mockup on it.
 */
export function photoCoverage(blank: Blank): { withPhoto: number; total: number } {
  const available = blank.colors.filter((c) => c.available);
  return {
    withPhoto: available.filter((c) => Boolean(c.imageUrl)).length,
    total: available.length,
  };
}
