// Matching Folder 03 to Shopify products.
//
// The approved library is
//
//     03_APPROVED — CLEAN MOCKUPS / MANUFACTURER / PRODUCT / COLOR / VIEW / file
//
// and the job is to say, for a given Shopify product and colour, which Drive
// file to show. Two rules shape everything here.
//
// The first: NEVER GUESS. A wrong image is worse than a missing one, because a
// missing image announces itself and a wrong one quietly misrepresents a
// product to a customer. So when more than one product folder is a plausible
// match the result is `image_match_required` and a person decides.
//
// The second: identity lives in Drive IDs, not names. Folder and file names get
// renamed, re-cased and re-punctuated constantly; the IDs do not. Names are
// used to FIND a match the first time and never again once one is confirmed.
export const VIEW_TYPES = [
  "FRONT",
  "FRONT_ANGLE",
  "BACK",
  "BACK_HOOD_DOWN",
  "BACK_HOOD_UP",
  "BACK_POCKET",
  "SIDE",
  "LEFT_SIDE",
  "RIGHT_SIDE",
  "DETAIL",
] as const;

export type ViewType = (typeof VIEW_TYPES)[number];

/**
 * Which image represents a product or colour in a list.
 *
 * FRONT, then FRONT_ANGLE, then whatever else that colour has — so a colour
 * with only a detail shot still shows something rather than a placeholder.
 */
export const PREVIEW_PRIORITY: ViewType[] = ["FRONT", "FRONT_ANGLE"];

/**
 * Normalise a folder or product name for comparison.
 *
 * Upper-cased, punctuation flattened to single spaces, em/en dashes included —
 * the library uses "7601 — FULL ZIP UP HOOD 10 OZ" with an em dash, and a
 * comparison that treats that as a word character never matches anything.
 */
export function normalizeName(value: string): string {
  return value
    .replace(/[‐-―]/g, " ")   // hyphen/en/em dashes
    .replace(/[_\-.,/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Colour names compare with spacing and punctuation removed entirely. */
export function normalizeColor(value: string): string {
  return normalizeName(value).replace(/[^A-Z0-9]/g, "");
}

/**
 * The style number at the head of a product folder, if there is one.
 *
 * "7601 — FULL ZIP UP HOOD 10 OZ" → "7601". Only a LEADING run of digits
 * counts: "OVERSIZED BOX S-S TEE 7.5 OZ" must not yield "7.5", and a weight
 * buried mid-name is not an identifier.
 */
export function styleNumberOf(productFolder: string): string | null {
  // Up to six letters, because real vendor codes run long — CCHOD475 and
  // PRM4600QZ both have five-letter prefixes. Digits must follow immediately,
  // which is what keeps "HEAVY CREW 15 OZ" from yielding a style number.
  const m = normalizeName(productFolder).match(/^([A-Z]{0,6}\d{3,6}[A-Z]{0,2})\b/);
  return m ? m[1] : null;
}

/** The product name with its leading style number removed. */
export function productNameOf(productFolder: string): string {
  const norm = normalizeName(productFolder);
  const style = styleNumberOf(productFolder);
  return style ? norm.slice(style.length).trim() : norm;
}

export function viewTypeOf(folderName: string): ViewType | null {
  const norm = normalizeName(folderName).replace(/\s+/g, "_");
  return (VIEW_TYPES as readonly string[]).includes(norm) ? (norm as ViewType) : null;
}

// ---- The index ------------------------------------------------------------

export interface DriveImage {
  manufacturer: string;
  productFolder: string;
  productFolderId: string;
  color: string;
  colorFolderId: string;
  viewFolderId: string | null;
  viewType: ViewType;
  fileId: string;
  filename: string;
  mimeType: string;
  driveUrl: string;
  modifiedAt: string;
}

export interface DriveProductFolder {
  manufacturer: string;
  normalizedManufacturer: string;
  productFolder: string;
  productFolderId: string;
  styleNumber: string | null;
  normalizedName: string;
}

/** Distinct product folders present in an index. */
export function productFoldersIn(images: DriveImage[]): DriveProductFolder[] {
  const seen = new Map<string, DriveProductFolder>();
  for (const img of images) {
    if (seen.has(img.productFolderId)) continue;
    seen.set(img.productFolderId, {
      manufacturer: img.manufacturer,
      normalizedManufacturer: normalizeName(img.manufacturer),
      productFolder: img.productFolder,
      productFolderId: img.productFolderId,
      styleNumber: styleNumberOf(img.productFolder),
      normalizedName: productNameOf(img.productFolder),
    });
  }
  return [...seen.values()];
}

// ---- Matching -------------------------------------------------------------

export type MatchStatus = "confirmed" | "matched" | "image_match_required" | "no_match";

export interface MatchResult {
  status: MatchStatus;
  folderId: string | null;
  /** How the match was reached, for the audit trail. */
  via: "manual" | "style_number" | "product_name" | null;
  /** Populated only when the result is ambiguous. */
  candidates: DriveProductFolder[];
}

export interface ProductToMatch {
  manufacturer: string | null;
  styleNumber: string | null;
  title: string;
  /** A previously confirmed folder id. Wins over everything. */
  confirmedFolderId?: string | null;
}

/**
 * Find the Drive folder for one product.
 *
 * Order is manufacturer+style, then manufacturer+name, then a manual mapping —
 * except that a manual mapping, once it exists, short-circuits the whole thing.
 * Automatic matching must never overwrite a decision a person already made, so
 * the confirmed id is checked before any name is even normalised.
 */
export function matchProduct(
  product: ProductToMatch,
  folders: DriveProductFolder[],
): MatchResult {
  if (product.confirmedFolderId) {
    return { status: "confirmed", folderId: product.confirmedFolderId, via: "manual", candidates: [] };
  }

  const mfr = normalizeName(product.manufacturer ?? "");
  if (!mfr) return { status: "no_match", folderId: null, via: null, candidates: [] };

  const sameMaker = folders.filter((f) => f.normalizedManufacturer === mfr);
  if (sameMaker.length === 0) {
    return { status: "no_match", folderId: null, via: null, candidates: [] };
  }

  // 1. Manufacturer + style number.
  const style = product.styleNumber ? normalizeName(product.styleNumber) : null;
  if (style) {
    const hits = sameMaker.filter((f) => f.styleNumber === style);
    if (hits.length === 1) {
      return { status: "matched", folderId: hits[0].productFolderId, via: "style_number", candidates: [] };
    }
    if (hits.length > 1) {
      // Two folders claiming one style number is a library problem, not
      // something to resolve by picking the first.
      return { status: "image_match_required", folderId: null, via: null, candidates: hits };
    }
  }

  // 2. Manufacturer + normalised product name.
  const title = normalizeName(product.title);
  const exact = sameMaker.filter((f) => f.normalizedName === title);
  if (exact.length === 1) {
    return { status: "matched", folderId: exact[0].productFolderId, via: "product_name", candidates: [] };
  }
  if (exact.length > 1) {
    return { status: "image_match_required", folderId: null, via: null, candidates: exact };
  }

  // A containment match is suggestive but not proof, so it never auto-confirms
  // — one hit or several, a person looks.
  const loose = sameMaker.filter(
    (f) => f.normalizedName.includes(title) || title.includes(f.normalizedName),
  );
  if (loose.length > 0) {
    return { status: "image_match_required", folderId: null, via: null, candidates: loose };
  }

  return { status: "no_match", folderId: null, via: null, candidates: [] };
}

// ---- Choosing images ------------------------------------------------------

/** Every approved view for one colour of one product folder. */
export function viewsFor(
  images: DriveImage[],
  productFolderId: string,
  color: string,
): DriveImage[] {
  const want = normalizeColor(color);
  return images.filter(
    (i) => i.productFolderId === productFolderId && normalizeColor(i.color) === want,
  );
}

/**
 * The single image to show for a colour.
 *
 * Returns null rather than reaching for another colour's photo when this one
 * has nothing — case 9 in the spec. A product can legitimately have images for
 * some colours and not others, and borrowing across colours would show a
 * customer the wrong garment in the wrong colour.
 */
export function previewImage(
  images: DriveImage[],
  productFolderId: string,
  color: string,
): DriveImage | null {
  const mine = viewsFor(images, productFolderId, color);
  if (mine.length === 0) return null;
  for (const view of PREVIEW_PRIORITY) {
    const hit = mine.find((i) => i.viewType === view);
    if (hit) return hit;
  }
  return [...mine].sort((a, b) => a.filename.localeCompare(b.filename))[0];
}

/** Colours in this product folder that have no approved image at all. */
export function coloursMissingImages(
  images: DriveImage[],
  productFolderId: string,
  colors: string[],
): string[] {
  return colors.filter((c) => viewsFor(images, productFolderId, c).length === 0);
}

// ---- Reconciling a rescan -------------------------------------------------

export interface StoredImage {
  drive_file_id: string;
  filename: string;
  modified_at: string;
  missing?: boolean;
}

export interface RescanPlan {
  /** Files not previously stored. */
  added: DriveImage[];
  /** Same file id, changed filename or timestamp — update in place. */
  updated: { fileId: string; from: StoredImage; to: DriveImage }[];
  /** Stored files the rescan did not see. Marked missing, never deleted. */
  missing: StoredImage[];
  /** Seen again and unchanged. */
  unchanged: number;
}

/**
 * What a rescan should write.
 *
 * Keyed on Drive file id throughout, which is what makes case 11 work: rename a
 * file in Drive and the id is unchanged, so this reports an UPDATE rather than
 * a delete plus an insert — the mapping, and anything referencing it, survives.
 *
 * Files that have gone are marked missing rather than removed, so a product
 * shows "image missing" instead of silently falling back to some other picture.
 */
export function planRescan(seen: DriveImage[], stored: StoredImage[]): RescanPlan {
  const storedById = new Map(stored.map((s) => [s.drive_file_id, s]));
  const seenIds = new Set(seen.map((s) => s.fileId));

  const added: DriveImage[] = [];
  const updated: RescanPlan["updated"] = [];
  let unchanged = 0;

  for (const img of seen) {
    const prev = storedById.get(img.fileId);
    if (!prev) { added.push(img); continue; }
    if (prev.filename !== img.filename || prev.modified_at !== img.modifiedAt || prev.missing) {
      updated.push({ fileId: img.fileId, from: prev, to: img });
    } else {
      unchanged += 1;
    }
  }

  return {
    added,
    updated,
    missing: stored.filter((s) => !seenIds.has(s.drive_file_id) && !s.missing),
    unchanged,
  };
}

// ---- Image coverage state -------------------------------------------------

export type ImageCoverage =
  | "complete"
  | "partial"
  | "missing_image"
  | "image_match_required"
  | "drive_connection_required";

export const COVERAGE_LABELS: Record<ImageCoverage, string> = {
  complete: "Complete",
  partial: "Partial Coverage",
  missing_image: "Missing Image",
  image_match_required: "Image Match Required",
  drive_connection_required: "Drive Connection Required",
};

/**
 * How well photographed a blank is, as one word.
 *
 * The order of the checks is the point. "Drive isn't connected" outranks
 * everything, because with no credentials we know nothing about coverage and
 * reporting "Missing Image" would blame the library for our own configuration.
 * "Needs a human to pick a folder" outranks coverage for the same reason: we
 * cannot count images in a folder we have not agreed on.
 *
 * Only then does it become a counting question, and a blank that is partly shot
 * is called partial rather than complete — one colour with no photograph is a
 * customer seeing a blank tile, whatever the other forty say.
 */
export function coverageOf(input: {
  driveConnected: boolean;
  matchStatus: MatchStatus | "unmatched";
  /** Colours the blank offers. */
  colors: string[];
  /** Approved images already indexed for this blank. */
  images: { normalizedColor: string | null; missing?: boolean }[];
}): ImageCoverage {
  if (!input.driveConnected) return "drive_connection_required";
  if (input.matchStatus === "image_match_required") return "image_match_required";

  const live = input.images.filter((i) => !i.missing);
  if (input.colors.length === 0) return live.length > 0 ? "complete" : "missing_image";

  const have = new Set(live.map((i) => i.normalizedColor ?? ""));
  const covered = input.colors.filter((c) => have.has(normalizeColor(c))).length;

  if (covered === 0) return "missing_image";
  return covered === input.colors.length ? "complete" : "partial";
}

/** Which of the expected views a colour is still missing. */
export function missingViews(
  images: DriveImage[],
  productFolderId: string,
  color: string,
  expected: ViewType[],
): ViewType[] {
  const have = new Set(viewsFor(images, productFolderId, color).map((i) => i.viewType));
  return expected.filter((v) => !have.has(v));
}

/** The views a garment type is expected to have. */
export function expectedViews(garmentType: string | null): ViewType[] {
  const t = (garmentType ?? "").toLowerCase();
  if (t.includes("hood")) return ["FRONT", "BACK_HOOD_DOWN", "BACK_HOOD_UP"];
  if (t === "hat" || t === "beanie") return ["FRONT", "FRONT_ANGLE", "SIDE"];
  if (t === "sweatpants" || t === "shorts") return ["FRONT", "BACK", "SIDE"];
  return ["FRONT", "BACK"];
}
