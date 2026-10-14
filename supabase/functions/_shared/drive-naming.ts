// Folder and file naming rules for the approved Drive library.
//
// This file is imported by BOTH the Deno edge function and the browser bundle,
// which is the point: an indexer that normalises names one way and a UI that
// matches them another way will disagree about which photo belongs to which
// colour, and nothing will look broken enough to notice. One definition, two
// runtimes — so it is plain TypeScript with no Deno or DOM APIs in it.

export const VIEW_TYPES = [
  "FRONT", "FRONT_ANGLE", "BACK", "BACK_HOOD_DOWN", "BACK_HOOD_UP",
  "BACK_POCKET", "SIDE", "LEFT_SIDE", "RIGHT_SIDE", "DETAIL",
] as const;

export type ViewType = (typeof VIEW_TYPES)[number];

/**
 * Flatten a name for comparison.
 *
 * The dash class covers U+2010 to U+2015. The library really does use an em
 * dash — "7601 — FULL ZIP UP HOOD 10 OZ" — and a comparison that treats it as
 * a word character matches nothing at all.
 */
export function normalizeName(value: string): string {
  return value
    .replace(/[‐-―]/g, " ")
    .replace(/[_\-.,/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Colours compare with all punctuation removed: "Vintage Black" = "VINTAGE_BLACK". */
export function normalizeColor(value: string): string {
  return normalizeName(value).replace(/[^A-Z0-9]/g, "");
}

/** The view a FOLDER names, or null. Folders are exact — no guessing here. */
export function viewTypeOf(folderName: string): ViewType | null {
  const n = normalizeName(folderName).replace(/\s+/g, "_");
  return (VIEW_TYPES as readonly string[]).includes(n) ? (n as ViewType) : null;
}

// Longest first. "BACK_HOOD_UP" contains "BACK", so testing for BACK earlier
// would file every hood shot as a plain back — the exact bug that loses half a
// hoodie's photography without raising an error.
const FILENAME_VIEWS: ViewType[] = [
  "BACK_HOOD_DOWN", "BACK_HOOD_UP", "FRONT_ANGLE", "BACK_POCKET",
  "LEFT_SIDE", "RIGHT_SIDE", "FRONT", "BACK", "SIDE", "DETAIL",
];

/** The view named inside a FILENAME, for images that sit loose in a colour folder. */
export function viewFromFilename(filename: string): ViewType | null {
  const n = normalizeName(filename.replace(/\.[a-z0-9]{2,4}$/i, "")).replace(/\s+/g, "_");
  for (const v of FILENAME_VIEWS) {
    if (n.includes(v)) return v;
  }
  return null;
}

/**
 * A leading style number, if the folder carries one.
 *
 * Up to six letters then digits, because real vendor codes run long —
 * CCHOD475, PRM4600QZ. The digits must follow the letters immediately, which
 * is what stops "HEAVY CREW 15 OZ" and "OVERSIZED BOX S-S TEE 7.5 OZ" from
 * yielding a weight as an identifier.
 */
export function styleNumberOf(productFolder: string): string | null {
  const m = normalizeName(productFolder).match(/^([A-Z]{0,6}\d{3,6}[A-Z]{0,2})\b/);
  return m ? m[1] : null;
}

/** The product name with any leading style number stripped off. */
export function productNameOf(productFolder: string): string {
  const norm = normalizeName(productFolder);
  const style = styleNumberOf(productFolder);
  return style ? norm.slice(style.length).trim() : norm;
}
