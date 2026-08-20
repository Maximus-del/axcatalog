// Import garment photography for blanks.
//
// The vendor drops arrive in two shapes and both should just work:
//
//   cleaned    AX-HOOD-03/greyheather.png,  greyheather-back.png
//   raw        7102-Grey-Heather b.png,     7102-Grey-Heather (Flat Lay).png
//
// So the parser strips a leading style number, recognises several ways of
// saying "this is the back", and compares colours on a squashed slug rather
// than exact text — "Grey Heather", "grey-heather" and "GreyHeather" are one
// colour, and a human naming files at 11pm should not have to know that.
import { supabase } from "@/integrations/supabase/client";

export const BLANKS_BUCKET = "blanks";

export type Surface = "front" | "back";

export interface ParsedFileName {
  colorSlug: string;
  surface: Surface;
  /** Style number found at the front of the name, if any. */
  stylePrefix: string | null;
}

/** "Grey Heather" / "grey-heather" / "GreyHeather" all collapse to "greyheather". */
export function colorSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Markers that mean "back view", longest first so " back" wins over " b".
const BACK_MARKERS = [/\bback\b/, /-back$/, /_back$/, /\sb$/, /-b$/];

// Stripped BEFORE the surface check, because they sit after the surface
// marker: "5102-Ecru b 2.png" is a back photo, and testing for a trailing
// " b" while the " 2" is still attached quietly files it as a colour called
// "ecrub".
const TRAILING_NOISE = [
  /\s*\(\d+\)$/,      // "(1)" from a download collision
  /\s+\d+$/,          // trailing " 2" on a duplicate export
  /\s*-\s*copy$/i,
];

// Noise that says nothing about colour or surface.
const NOISE = [
  /\(flat\s*lay\)/gi,
  /\(front\s*view\)/gi,
  /\bfront\s*view\b/gi,
  /\bflat\s*lay\b/gi,
  /\bfront\b/gi,
  /\bcopy\b/gi,
];

/**
 * Pull the colour and surface out of a filename.
 *
 * `knownStyleNumbers` lets a leading "7102-" be dropped only when it really is
 * this blank's style number — otherwise a colour that happens to start with
 * digits would lose its first word.
 */
export function parseFileName(fileName: string, knownStyleNumbers: string[] = []): ParsedFileName {
  let base = fileName.replace(/\.[^.]+$/, "").trim();

  let stylePrefix: string | null = null;
  for (const style of knownStyleNumbers.filter(Boolean)) {
    const re = new RegExp(`^${style.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s._-]+`, "i");
    if (re.test(base)) {
      stylePrefix = style;
      base = base.replace(re, "");
      break;
    }
  }
  // A bare leading number followed by a separator is a style code too.
  if (!stylePrefix) {
    const m = base.match(/^(\d{3,6})[\s._-]+/);
    if (m) {
      stylePrefix = m[1];
      base = base.slice(m[0].length);
    }
  }

  // Peel off "(1)" / " 2" first so the surface marker is at the end where the
  // patterns below expect it.
  let peeled = true;
  while (peeled) {
    peeled = false;
    for (const n of TRAILING_NOISE) {
      if (n.test(base)) {
        base = base.replace(n, "");
        peeled = true;
      }
    }
  }

  let surface: Surface = "front";
  for (const marker of BACK_MARKERS) {
    if (marker.test(base)) {
      surface = "back";
      base = base.replace(marker, " ");
      break;
    }
  }

  for (const n of NOISE) base = base.replace(n, " ");

  return { colorSlug: colorSlug(base), surface, stylePrefix };
}

export interface ColorRow {
  id: string;
  blank_id: string;
  color_name: string;
  image_url: string | null;
  image_url_back: string | null;
}

export interface MatchedFile {
  file: File;
  fileName: string;
  colorSlug: string;
  surface: Surface;
  color: ColorRow | null;
  /** Set when a photo is already on file for this colour and surface. */
  replaces: boolean;
}

export interface MatchReport {
  matched: MatchedFile[];
  unmatched: MatchedFile[];
  /** Colours on the blank that still have no file in this drop. */
  stillMissing: { color_name: string; surface: Surface }[];
}

/**
 * Line up a pile of files against a blank's colourways.
 *
 * Nothing is uploaded here — the operator sees exactly what will happen first,
 * including which existing photos would be replaced, because a bulk overwrite
 * of good imagery is not something to discover afterwards.
 */
export function matchFilesToColors(
  files: File[],
  colors: ColorRow[],
  styleNumbers: string[] = [],
): MatchReport {
  const bySlug = new Map(colors.map((c) => [colorSlug(c.color_name), c]));

  const matched: MatchedFile[] = [];
  const unmatched: MatchedFile[] = [];

  for (const file of files) {
    const parsed = parseFileName(file.name, styleNumbers);
    const color = bySlug.get(parsed.colorSlug) ?? null;
    const entry: MatchedFile = {
      file,
      fileName: file.name,
      colorSlug: parsed.colorSlug,
      surface: parsed.surface,
      color,
      replaces: !!color && !!(parsed.surface === "back" ? color.image_url_back : color.image_url),
    };
    (color ? matched : unmatched).push(entry);
  }

  const covered = new Set(matched.map((m) => `${m.color!.id}:${m.surface}`));
  const stillMissing: MatchReport["stillMissing"] = [];
  for (const c of colors) {
    if (!c.image_url && !covered.has(`${c.id}:front`)) stillMissing.push({ color_name: c.color_name, surface: "front" });
    if (!c.image_url_back && !covered.has(`${c.id}:back`)) stillMissing.push({ color_name: c.color_name, surface: "back" });
  }

  return { matched, unmatched, stillMissing };
}

/** Only images, and only ones a browser will actually render. */
export function isImportableImage(file: File): boolean {
  return /^image\/(png|jpeg|webp)$/.test(file.type);
}

/**
 * The SKU folder a dropped file came from, e.g. "AX-HOOD-03/black.png".
 * Directory uploads carry this; a flat multi-select does not.
 */
export function skuFromPath(file: File): string | null {
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  // Last segment is the file; walk back for something shaped like a SKU.
  for (let i = parts.length - 2; i >= 0; i--) {
    if (/^AX-[A-Z]+-\d+$/i.test(parts[i])) return parts[i].toUpperCase();
  }
  return null;
}

/** Group a directory drop by the SKU folder each file sat in. */
export function groupBySku(files: File[]): Map<string | null, File[]> {
  const groups = new Map<string | null, File[]>();
  for (const file of files) {
    const sku = skuFromPath(file);
    const list = groups.get(sku) ?? [];
    list.push(file);
    groups.set(sku, list);
  }
  return groups;
}

export interface ImportOutcome {
  imported: number;
  failed: { fileName: string; error: string }[];
}

/**
 * Upload one photo and point its colourway at it.
 *
 * The single source of truth for where a blank photo lives — both the bulk
 * import and the one-slot-at-a-time editor go through here, so the two can't
 * drift into writing different paths.
 */
export async function uploadColorPhoto(input: {
  sku: string;
  colorId: string;
  colorSlug: string;
  surface: Surface;
  file: File;
}): Promise<string> {
  const ext = input.file.name.split(".").pop()?.toLowerCase() || "png";
  // Deterministic path: re-importing a colour overwrites its own file rather
  // than littering the bucket with orphans.
  const path = `${input.sku}/${input.colorSlug}${input.surface === "back" ? "-back" : ""}.${ext}`;
  const up = await supabase.storage
    .from(BLANKS_BUCKET)
    .upload(path, input.file, { upsert: true, contentType: input.file.type || "image/png" });
  if (up.error) throw up.error;

  const publicUrl = supabase.storage.from(BLANKS_BUCKET).getPublicUrl(path).data.publicUrl;
  // Cache-bust: the path is stable on purpose, so a replaced photo would keep
  // showing the old bytes without this.
  const versioned = `${publicUrl}?v=${Date.now()}`;
  const field = input.surface === "back" ? "image_url_back" : "image_url";
  const { error } = await supabase
    .from("blank_colors" as never)
    .update({ [field]: versioned } as never)
    .eq("id", input.colorId);
  if (error) throw error;
  return versioned;
}

export interface SlotRef {
  colorId: string;
  surface: Surface;
}

export interface ColorPatch {
  colorId: string;
  image_url?: string | null;
  image_url_back?: string | null;
}

function urlAt(colors: ColorRow[], ref: SlotRef): string | null {
  const c = colors.find((x) => x.id === ref.colorId);
  if (!c) return null;
  return ref.surface === "back" ? c.image_url_back : c.image_url;
}

function field(surface: Surface): "image_url" | "image_url_back" {
  return surface === "back" ? "image_url_back" : "image_url";
}

/**
 * Work out the row updates for dragging a photo from one slot to another.
 *
 * Swaps when the target is occupied and moves when it's empty, which is the
 * behaviour that matches the two real mistakes: a front and back the matcher
 * got the wrong way round, and a photo filed under the wrong colourway.
 *
 * Returns patches rather than writing, so the interesting case — both slots on
 * the SAME row, where two naive updates would clobber each other — is provable
 * without a database.
 */
export function planPhotoMove(colors: ColorRow[], from: SlotRef, to: SlotRef): ColorPatch[] {
  if (from.colorId === to.colorId && from.surface === to.surface) return [];

  const moving = urlAt(colors, from);
  if (!moving) return [];
  const displaced = urlAt(colors, to);

  if (from.colorId === to.colorId) {
    // One row, both fields — must be a single patch or the second write wins.
    return [{
      colorId: from.colorId,
      [field(to.surface)]: moving,
      [field(from.surface)]: displaced,
    } as ColorPatch];
  }

  return [
    { colorId: to.colorId, [field(to.surface)]: moving } as ColorPatch,
    { colorId: from.colorId, [field(from.surface)]: displaced } as ColorPatch,
  ];
}

export async function applyColorPatches(patches: ColorPatch[]): Promise<void> {
  for (const patch of patches) {
    const { colorId, ...fields } = patch;
    const { error } = await supabase
      .from("blank_colors" as never)
      .update(fields as never)
      .eq("id", colorId);
    if (error) throw error;
  }
}

export async function clearColorPhoto(colorId: string, surface: Surface): Promise<void> {
  const field = surface === "back" ? "image_url_back" : "image_url";
  const { error } = await supabase
    .from("blank_colors" as never)
    .update({ [field]: null } as never)
    .eq("id", colorId);
  if (error) throw error;
}

export async function importMatchedFiles(
  sku: string,
  matched: MatchedFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportOutcome> {
  const failed: ImportOutcome["failed"] = [];
  let imported = 0;

  for (const [i, m] of matched.entries()) {
    onProgress?.(i, matched.length);
    if (!m.color) continue;
    try {
      await uploadColorPhoto({
        sku,
        colorId: m.color.id,
        colorSlug: m.colorSlug,
        surface: m.surface,
        file: m.file,
      });
      imported += 1;
    } catch (e) {
      failed.push({ fileName: m.fileName, error: e instanceof Error ? e.message : "Failed" });
    }
  }

  onProgress?.(matched.length, matched.length);
  return { imported, failed };
}

// ---- Coverage -------------------------------------------------------------

export interface BlankCoverage {
  id: string;
  sku: string | null;
  style_number: string | null;
  name: string;
  garment_type: string | null;
  /** Vendor product page — where the colourway names and photos come from. */
  url: string | null;
  colorways: number;
  haveFront: number;
  haveBack: number;
}

/**
 * Tidy a pasted link.
 *
 * People paste "ottocap.com/31-069" as often as a full URL, and a bare domain
 * saved verbatim produces a link that resolves against our own site. Returns
 * null for anything that isn't a plausible web address rather than storing
 * junk that looks clickable.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    // A hostname with no dot is a typo, not a site.
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** "https://www.ottocap.com/products/31-069" → "ottocap.com" */
export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export async function saveBlankUrl(blankId: string, url: string | null): Promise<void> {
  const { error } = await supabase
    .from("blanks" as never)
    .update({ url } as never)
    .eq("id", blankId);
  if (error) throw error;
}

export function coveragePercent(c: BlankCoverage): number {
  const needed = c.colorways * 2;
  if (needed === 0) return 0;
  return Math.round(((c.haveFront + c.haveBack) / needed) * 100);
}

export async function loadCoverage(): Promise<BlankCoverage[]> {
  const { data, error } = await supabase
    .from("blanks")
    .select("id, sku, style_number, name, garment_type, url, blank_colors(id, image_url, image_url_back)")
    .order("sku");
  if (error) throw error;

  return ((data ?? []) as unknown as (Omit<BlankCoverage, "colorways" | "haveFront" | "haveBack"> & {
    blank_colors: { id: string; image_url: string | null; image_url_back: string | null }[];
  })[]).map((b) => {
    const colors = b.blank_colors ?? [];
    return {
      id: b.id,
      sku: b.sku,
      style_number: b.style_number,
      name: b.name,
      garment_type: b.garment_type,
      url: b.url,
      colorways: colors.length,
      haveFront: colors.filter((c) => c.image_url).length,
      haveBack: colors.filter((c) => c.image_url_back).length,
    };
  });
}

export async function loadColorsFor(blankId: string): Promise<ColorRow[]> {
  const { data, error } = await supabase
    .from("blank_colors" as never)
    .select("id, blank_id, color_name, image_url, image_url_back")
    .eq("blank_id", blankId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as ColorRow[];
}
