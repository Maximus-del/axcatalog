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

/** A flat colour chip for a colourway with no photography of its own. */
export function swatchFor(color: BlankColor | null | undefined): string {
  return color?.hex ?? "hsl(var(--ax-line))";
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
