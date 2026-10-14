// Reading the approved product library.
//
// The library on Drive is laid out the way the intake spec asks for:
//
//     PRODUCT / COLOR / VIEW / SUPPLIER_CODE_COLOR_VIEW_STATUS.png
//
//     7395 — OVERSIZED HEAVY HOODIE 12 OZ/
//       BLACK/
//         FRONT/           AXISM_7395_BLACK_FRONT_CLEAN.png
//         BACK_HOOD_UP/    AXISM_7395_BLACK_BACK_HOOD_UP_CLEAN.png
//         BACK_HOOD_DOWN/  AXISM_7395_BLACK_BACK_HOOD_DOWN_CLEAN.png
//
// The existing importer reads the FILE NAME, which is right for a vendor drop
// of loose files. It is the wrong thing to read here, and would get it wrong in
// two specific ways:
//
//   - "COTTON_COLLECTIVE_JET_BLACK_FRONT_CLEAN.png" has a two-word supplier, so
//     nothing that strips a leading style number finds the colour.
//   - "…_BACK_HOOD_UP_CLEAN.png" contains the word "back". A plain back-marker
//     test files hood-up and hood-down as the same view, so one silently
//     overwrites the other and half the photography disappears.
//
// So when a drop has the library's shape, the FOLDERS are authoritative: the
// colour is the colour folder, the view is the view folder. The filename is
// treated as corroboration, never as the source.
import { supabase } from "@/integrations/supabase/client";
import { colorSlug, type ColorRow } from "@/lib/ecosystem/blank-images";

/** Every view the library can contain. Order is display order. */
export const LIBRARY_VIEWS = [
  "front",
  "back",
  "back_hood_down",
  "back_hood_up",
  "side_45",
  "side_90",
] as const;

export type LibraryView = (typeof LIBRARY_VIEWS)[number];

export const VIEW_LABELS: Record<LibraryView, string> = {
  front: "Front",
  back: "Back",
  back_hood_down: "Back, hood down",
  back_hood_up: "Back, hood up",
  side_45: "45°",
  side_90: "Side",
};

// Longest first: BACK_HOOD_DOWN must win over BACK, or every hood shot
// collapses into the plain back slot.
//
// These run against a SEPARATOR-NORMALISED string, which matters more than it
// looks. In JavaScript `_` is a word character, so /\bfront\b/ does not match
// inside "BLACK_FRONT_CLEAN" — there is no word boundary between "_" and "f".
// Every filename in the library is underscore-delimited, so matching the raw
// token would have failed on all of them.
const VIEW_PATTERNS: { view: LibraryView; re: RegExp }[] = [
  { view: "back_hood_down", re: /\bhood down\b/ },
  { view: "back_hood_up", re: /\bhood up\b/ },
  { view: "side_45", re: /\bside 45\b|\b45 deg\b|\bdiagonal\b/ },
  { view: "side_90", re: /\bside 90\b|\bprofile\b|^side$/ },
  { view: "back", re: /\bback\b/ },
  { view: "front", re: /\bfront\b/ },
];

/** Underscores, dots and dashes all mean "word gap" in these filenames. */
function normalizeToken(token: string): string {
  return token
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** The view a folder or filename is describing, or null if it says nothing. */
export function viewOf(token: string): LibraryView | null {
  const cleaned = normalizeToken(token);
  for (const { view, re } of VIEW_PATTERNS) {
    if (re.test(cleaned)) return view;
  }
  return null;
}

export interface LibraryEntry {
  file: File;
  /** Folder the colour came from, verbatim, for reporting. */
  colorFolder: string;
  colorSlug: string;
  view: LibraryView;
}

export interface LibraryPath {
  colorFolder: string;
  view: LibraryView;
}

/**
 * Read a relative path from a dropped folder.
 *
 * Accepts both depths, because what you drag decides how much path you get:
 *
 *     PRODUCT/COLOR/VIEW/file.png   dragging the product folder
 *     COLOR/VIEW/file.png           dragging one colour
 *
 * Returns null when the path is not library-shaped, so the caller can fall
 * back to the flat filename parser rather than guessing.
 */
export function parseLibraryPath(relativePath: string): LibraryPath | null {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const fileName = parts[parts.length - 1];
  const folders = parts.slice(0, -1);

  // Walk up from the file looking for a folder that names a view. The colour
  // is whatever sits immediately above it.
  for (let i = folders.length - 1; i >= 1; i--) {
    const view = viewOf(folders[i]);
    if (view) {
      const colorFolder = folders[i - 1];
      if (!colorFolder) return null;
      return { colorFolder, view };
    }
  }

  // No view folder: the view may be in the filename instead, with the colour
  // still one level up. "BLACK/AXISM_7395_BLACK_FRONT_CLEAN.png".
  const fromName = viewOf(fileName);
  if (fromName && folders.length >= 1) {
    return { colorFolder: folders[folders.length - 1], view: fromName };
  }
  return null;
}

export interface LibraryReport {
  /** Files whose colour folder matched an existing colourway. */
  matched: (LibraryEntry & { color: ColorRow })[];
  /** Colour folders present in the library with no colourway in the database. */
  newColors: { colorFolder: string; colorSlug: string; views: LibraryView[] }[];
  /** Files the library shape did not explain — caller should fall back. */
  unparsed: File[];
  /** Colourways in the database that the library has nothing for. */
  missingColors: ColorRow[];
}

function relPathOf(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return rel && rel.length > 0 ? rel : file.name;
}

/**
 * Sort a dropped library folder against the colourways we already hold.
 *
 * Nothing is uploaded or created here — this only says what IS, so the operator
 * sees new colours and gaps before anything is written.
 */
export function readLibraryDrop(files: File[], colors: ColorRow[]): LibraryReport {
  const bySlug = new Map(colors.map((c) => [colorSlug(c.color_name), c]));

  const matched: LibraryReport["matched"] = [];
  const unparsed: File[] = [];
  const newBySlug = new Map<string, { colorFolder: string; colorSlug: string; views: LibraryView[] }>();
  const seenColorSlugs = new Set<string>();

  for (const file of files) {
    const parsed = parseLibraryPath(relPathOf(file));
    if (!parsed) {
      unparsed.push(file);
      continue;
    }
    const slug = colorSlug(parsed.colorFolder);
    seenColorSlugs.add(slug);

    const entry: LibraryEntry = {
      file,
      colorFolder: parsed.colorFolder,
      colorSlug: slug,
      view: parsed.view,
    };

    const color = bySlug.get(slug);
    if (color) {
      matched.push({ ...entry, color });
    } else {
      const existing = newBySlug.get(slug);
      if (existing) {
        if (!existing.views.includes(parsed.view)) existing.views.push(parsed.view);
      } else {
        newBySlug.set(slug, { colorFolder: parsed.colorFolder, colorSlug: slug, views: [parsed.view] });
      }
    }
  }

  return {
    matched,
    newColors: [...newBySlug.values()].sort((a, b) => a.colorFolder.localeCompare(b.colorFolder)),
    unparsed,
    missingColors: colors.filter((c) => !seenColorSlugs.has(colorSlug(c.color_name))),
  };
}

/**
 * Where a library view can actually be stored today.
 *
 * `blank_colors` holds exactly two URLs, so only two of the six views have a
 * home. Hood-down wins the back slot over hood-up on purpose: it is the view
 * that has to occlude a back print, so it is the one the mockup compositor
 * needs. Everything else returns null and must be REPORTED rather than dropped
 * — silently discarding photography someone shot is worse than not importing it.
 */
export function storableField(view: LibraryView): "image_url" | "image_url_back" | null {
  if (view === "front") return "image_url";
  if (view === "back" || view === "back_hood_down") return "image_url_back";
  return null;
}

export interface StoragePlan {
  /** Uploads that can happen right now. */
  storable: (LibraryEntry & { color: ColorRow; field: "image_url" | "image_url_back" })[];
  /** Views with real files and nowhere to put them yet. */
  parked: { view: LibraryView; count: number }[];
}

/**
 * Split a matched set into what can be written and what cannot.
 *
 * When one colour has both a plain back and a hood-down, hood-down wins the
 * slot and the plain back is parked rather than racing it — otherwise which
 * photo survives depends on file iteration order, which is not a decision
 * anyone made.
 */
export function planStorage(matched: LibraryReport["matched"]): StoragePlan {
  const parked = new Map<LibraryView, number>();
  const claimed = new Map<string, LibraryView>();
  const storable: StoragePlan["storable"] = [];

  const park = (view: LibraryView) => parked.set(view, (parked.get(view) ?? 0) + 1);

  // Hood-down before plain back, so the preferred view claims the slot first.
  const order: LibraryView[] = ["front", "back_hood_down", "back", "back_hood_up", "side_45", "side_90"];
  const sorted = [...matched].sort((a, b) => order.indexOf(a.view) - order.indexOf(b.view));

  for (const m of sorted) {
    const field = storableField(m.view);
    if (!field) {
      park(m.view);
      continue;
    }
    const key = `${m.color.id}:${field}`;
    if (claimed.has(key)) {
      park(m.view);
      continue;
    }
    claimed.set(key, m.view);
    storable.push({ ...m, field });
  }

  return {
    storable,
    parked: [...parked.entries()]
      .map(([view, count]) => ({ view, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ---- Creating the colourways the library found -----------------------------

/** "VINTAGE_SUNFLOWER" → "Vintage Sunflower". */
export function prettyColorName(folder: string): string {
  return folder
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Add colourways the library has photographs for and the database does not.
 *
 * Kept explicit and opt-in: a colour folder appearing in a drop is good
 * evidence a colourway exists, but it is not proof — a typo'd folder would
 * otherwise quietly become a product option. The caller shows the list and the
 * count before this runs.
 */
export async function createColorways(
  blankId: string,
  folders: string[],
  startSortOrder: number,
): Promise<ColorRow[]> {
  if (folders.length === 0) return [];
  const rows = folders.map((folder, i) => ({
    blank_id: blankId,
    color_name: prettyColorName(folder),
    available: true,
    sort_order: startSortOrder + i,
  }));
  const { data, error } = await supabase
    .from("blank_colors")
    .insert(rows as never)
    .select("id, blank_id, color_name, image_url, image_url_back");
  if (error) throw error;
  return (data ?? []) as unknown as ColorRow[];
}
