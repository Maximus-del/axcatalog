// AX OS V2 — turning one mockup into a run of them.
//
// THE WORKFLOW THIS EXISTS FOR: artwork made today gets applied across a dozen
// blanks and colourways tomorrow. Doing that one mockup at a time is the same
// four clicks repeated twenty times, which is how a good idea quietly stops
// happening. So the review screen multiplies instead: choose the colourways and
// the other blanks, and every one is saved with the identical arrangement.
//
// Placement geometry is in percentages of the garment image box, which is
// exactly why it transfers — a chest hit sits on the chest whether the garment
// is a tee or a hoodie, and whether the photograph is 800px or 4000px.

import type { Blank } from "./types";

/** One mockup that will be created. */
export interface VariantTarget {
  blankId: string;
  blankName: string;
  colorName: string | null;
  /** False when this colourway has no photography of its own. */
  photographed: boolean;
}

/**
 * A ceiling on one batch.
 *
 * Not a technical limit — it is a "did you mean to do that" limit. Selecting
 * four blanks and fifteen colours is 60 mockups, which is almost always a
 * misunderstanding of the grid rather than an intention.
 */
export const MAX_VARIANTS = 24;

export interface ExpandInput {
  /** The blank and colour the operator actually built the mockup on. */
  baseBlank: Blank;
  baseColorName: string | null;
  /** Extra colourways of the base blank. */
  extraColorNames: string[];
  /** Other blanks entirely. Each contributes its own selected colours. */
  extraBlanks: Array<{ blank: Blank; colorNames: string[] }>;
}

/**
 * Every mockup a batch would create, base first.
 *
 * The base is always included and always first: the operator built it, and a
 * batch that silently dropped or reordered the thing they were looking at would
 * be disorienting.
 */
export function expandVariants(input: ExpandInput): VariantTarget[] {
  const { baseBlank, baseColorName, extraColorNames, extraBlanks } = input;
  const out: VariantTarget[] = [
    {
      blankId: baseBlank.id,
      blankName: baseBlank.name,
      colorName: baseColorName,
      photographed: hasPhoto(baseBlank, baseColorName),
    },
  ];

  for (const name of extraColorNames) {
    out.push({
      blankId: baseBlank.id,
      blankName: baseBlank.name,
      colorName: name,
      photographed: hasPhoto(baseBlank, name),
    });
  }

  for (const { blank, colorNames } of extraBlanks) {
    // A blank chosen with no colour still produces one mockup — the colourway
    // is a refinement, not a requirement, and a concept may exist without one.
    const names = colorNames.length > 0 ? colorNames : [null];
    for (const name of names) {
      out.push({
        blankId: blank.id,
        blankName: blank.name,
        colorName: name,
        photographed: hasPhoto(blank, name),
      });
    }
  }

  return dedupe(out);
}

function hasPhoto(blank: Blank, colorName: string | null): boolean {
  if (!colorName) return Boolean(blank.imageUrl);
  const c = blank.colors.find((x) => x.name === colorName);
  return Boolean(c?.imageUrl ?? blank.imageUrl);
}

/**
 * One mockup per (blank, colour).
 *
 * Reachable ordinarily: the operator ticks a colour in the "more colourways"
 * strip that is already the base colour. Creating two identical concepts from
 * one click would be a bug they then have to clean up by hand.
 */
export function dedupe(targets: VariantTarget[]): VariantTarget[] {
  const seen = new Set<string>();
  const out: VariantTarget[] = [];
  for (const t of targets) {
    const key = `${t.blankId}::${t.colorName ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Colourways with no photography of their own, so the operator is warned once. */
export function unphotographed(targets: VariantTarget[]): VariantTarget[] {
  return targets.filter((t) => !t.photographed);
}

/**
 * Per-variant name.
 *
 * When a batch is one item the operator's typed title is used verbatim; that is
 * the name they chose for the thing in front of them. Beyond one, each mockup
 * needs to be findable on its own, so the distinguishing facts are appended —
 * and only the ones that actually distinguish it.
 */
export function variantTitle(
  baseTitle: string,
  target: VariantTarget,
  opts: { multipleBlanks: boolean; total: number },
): string {
  const base = baseTitle.trim() || "Untitled mockup";
  if (opts.total <= 1) return base;

  const bits: string[] = [];
  if (opts.multipleBlanks) bits.push(target.blankName);
  if (target.colorName) bits.push(target.colorName);
  if (bits.length === 0) return base;

  // Don't repeat a fact the operator already typed into the title.
  const lower = base.toLowerCase();
  const additions = bits.filter((b) => !lower.includes(b.toLowerCase()));
  return additions.length > 0 ? `${base} · ${additions.join(" · ")}` : base;
}

export function overLimit(count: number): boolean {
  return count > MAX_VARIANTS;
}
