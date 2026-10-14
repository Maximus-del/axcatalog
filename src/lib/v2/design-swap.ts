// AX OS V2 — swapping the artwork without moving it.
//
// THE WORKFLOW THIS EXISTS FOR: the placement is the expensive part. Once a
// logo sits right on a hoodie — the right size, the right height, judged
// against the photograph — trying the OTHER logo in the same spot should be one
// click, not a second mockup built from scratch and eyeballed to match.
//
// So a swap changes `designId` and touches nothing else. Geometry is stored as
// percentages of the garment box, so the replacement lands exactly where the
// original was, on every colourway in the run, on both surfaces.
//
// Aspect ratio is deliberately NOT corrected here. Two designs of different
// shapes in the same box is a real difference the operator must see rather than
// have silently reflowed — a wordmark quietly letterboxed into a square box is
// a mockup that lies about what prints.

import type { PlacedDesign } from "./placement-geometry";

/** The distinct designs currently on a garment, in the order they were placed. */
export function designsInUse(placed: PlacedDesign[]): string[] {
  const seen: string[] = [];
  for (const p of placed) if (!seen.includes(p.designId)) seen.push(p.designId);
  return seen;
}

export interface SwapOptions {
  /**
   * Replace only this design. Undefined means every placement, which is what
   * the common case — one design on the garment — wants.
   */
  fromDesignId?: string | null;
  /** Limit the swap to one side. Undefined swaps front and back together. */
  surface?: "front" | "back";
}

/**
 * Put a different design in the same boxes.
 *
 * Returns the same array reference when nothing matched, so a swap that would
 * change nothing does not re-render the canvas or dirty the draft.
 */
export function swapDesign(placed: PlacedDesign[], toDesignId: string, options: SwapOptions = {}): PlacedDesign[] {
  const { fromDesignId, surface } = options;
  let changed = false;

  const next = placed.map((p) => {
    if (fromDesignId != null && p.designId !== fromDesignId) return p;
    if (surface && p.surface !== surface) return p;
    if (p.designId === toDesignId) return p;
    changed = true;
    return {
      ...p,
      designId: toDesignId,
      /*
        The zone is cleared, and that is not incidental.

        `zoneId` records that this box came from a print-zone PRESET. The box
        is unchanged, but it is no longer "the preset for that design" — it is
        wherever the previous design ended up. Keeping the label would claim a
        provenance the placement no longer has.
      */
      zoneId: null,
      zoneLabel: null,
    };
  });

  return changed ? next : placed;
}

/**
 * The design a swap should replace by default.
 *
 * One design on the garment: that one, no question asked. More than one: null,
 * and the caller must ask — silently swapping all three because the operator
 * clicked a thumbnail would destroy work that took longer to make than to lose.
 */
export function defaultSwapTarget(placed: PlacedDesign[]): string | null {
  const inUse = designsInUse(placed);
  return inUse.length === 1 ? inUse[0] : null;
}
