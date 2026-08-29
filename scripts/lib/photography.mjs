// AX V2 CATALOG — the rules that turn the Drive into a catalog.
//
// The Drive is not a source of pictures for an existing catalog. It IS the
// catalog: Chase re-did the physical range, photographed it, and organised the
// result. So a style folder is a blank, a colour folder is a colourway, and
// their folder names are their names.
//
// NOTHING HERE LOOKS AT THE V1 `blanks` TABLE. There is no matching, no fuzzy
// name comparison and no reconciliation, because those were solving a problem
// that no longer exists — the two catalogs are different generations, not two
// spellings of one thing.
//
// Shopify owns cost, price and quantity. Those columns stay null here rather
// than being inferred, because a wrong price is worse than a missing one.
//
// Everything is pure; the network and the writes live in the sync script.

/* ------------------------------------------------------------------ naming */

/**
 * Drive folder name → a name a person would write.
 *
 * The folder is the record ("VINTAGE_WOOD_CAMO"), and it is stored verbatim as
 * `name`. This is only the presentation of it. Supplier spellings survive on
 * purpose — AXISM's own README documents "Sulpher Brown", so correcting it here
 * would put AX's catalog out of step with the supplier's.
 */
export function prettyName(raw) {
  const words = String(raw ?? "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean);

  // Weights and sizes read better upper-case: "14 OZ", not "14 Oz".
  const UNITS = new Set(["oz", "ozs"]);
  return words
    .map((w) => (UNITS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/** Stable comparison key, used only for de-duplicating within one sync run. */
export function keyOf(name) {
  return String(name ?? "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Style folders are named two ways, and both are the supplier's own choice:
 *   "7010 — DRI EASE OVERSIZED TEE"   AXISM, style code first
 *   "SPECIAL HOODIE 14 OZ"            Cotton Collective, name only
 *
 * A missing style code stays null. Inventing one would create an identifier
 * that matches nothing in Shopify and looks authoritative.
 */
export function parseStyleFolder(title) {
  const raw = String(title ?? "").trim();
  const m = raw.match(/^([A-Za-z0-9][A-Za-z0-9.\-]*)\s*[—–-]\s*(.+)$/);
  if (m) return { styleCode: m[1].trim(), name: m[2].trim(), raw };
  return { styleCode: null, name: raw, raw };
}

/* ------------------------------------------------------------------- views */

/**
 * Which surface a folder represents, and whether it is the one to show.
 *
 * Hood-down is the canonical back: hood-up hides the top third of exactly the
 * area artwork gets placed on. Hood-up is kept as a secondary image rather than
 * discarded — it is the better shot for a client-facing gallery.
 */
export function classifyView(folderName) {
  const key = keyOf(folderName).replace(/\s+/g, "_");
  if (key === "front") return { viewType: "front", variant: null, isPrimary: true };
  if (key === "back") return { viewType: "back", variant: null, isPrimary: true };
  if (key === "back_hood_down") return { viewType: "back", variant: "hood_down", isPrimary: true };
  if (key === "back_hood_up") return { viewType: "back", variant: "hood_up", isPrimary: false };
  if (key.startsWith("front")) return { viewType: "front", variant: key.slice(6) || null, isPrimary: false };
  if (key.startsWith("back")) return { viewType: "back", variant: key.slice(5) || null, isPrimary: false };
  return { viewType: null, variant: null, isPrimary: false };
}

/* ----------------------------------------------------------- garment types */

const GARMENT_RULES = [
  [/\bzip\b.*\bhood/i, "zip_hoodie"],
  [/\bhood/i, "hoodie"],
  [/\bcrew/i, "crewneck"],
  [/\b(l-?s|long[ _-]?sleeve)\b/i, "long_sleeve"],
  [/\bpolo\b/i, "polo"],
  [/\btank\b/i, "tank"],
  [/\bshort\b/i, "shorts"],
  [/\b(pant|jogger|sweatpant)/i, "sweatpants"],
  [/\b(cap|hat|snapback|trucker)\b/i, "hat"],
  [/\btee\b|\bt[ _-]?shirt\b/i, "tee"],
];

/**
 * Best guess at the garment type from the style name.
 *
 * It matters because placement zones differ — a cap gets cap placements, a top
 * gets chest and back. A guess is better than nothing here because the cost of
 * being wrong is one wrong list of placement presets, visible immediately and
 * editable. Returns null rather than defaulting to "tee" when nothing matches,
 * so an unrecognised garment is obvious instead of silently mislabelled.
 */
export function inferGarmentType(name) {
  for (const [re, type] of GARMENT_RULES) if (re.test(name ?? "")) return type;
  return null;
}

/* -------------------------------------------------------------------- URLs */

/**
 * A renderable URL for a public Drive file.
 *
 * Google's public thumbnail endpoint: no key needed at render time because the
 * library is shared "anyone with the link". Undocumented and rate-limited, so
 * it is a bridge rather than a destination — mirroring into Supabase storage is
 * the durable version, and it changes this function and nothing else.
 */
export function driveThumbUrl(fileId, size = 1600) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}

/* ----------------------------------------------------------------- catalog */

/**
 * Build the whole catalog from a flat walk of the Drive.
 *
 * `entries` are { supplier, styleFolder, colorFolder, viewFolder, file }.
 * Identity is the Drive folder id throughout, never the name — folders get
 * renamed, and a rename should update a blank rather than create a second one.
 */
export function buildCatalog(entries) {
  const blanks = new Map();
  const colors = new Map();
  const images = [];
  const skippedViews = [];

  for (const e of entries) {
    const parsed = parseStyleFolder(e.styleFolder.title);

    if (!blanks.has(e.styleFolder.id)) {
      blanks.set(e.styleFolder.id, {
        drive_folder_id: e.styleFolder.id,
        drive_folder_url: `https://drive.google.com/drive/folders/${e.styleFolder.id}`,
        supplier: prettyName(e.supplier.title),
        name: parsed.name,
        style_code: parsed.styleCode,
        garment_type: inferGarmentType(parsed.raw),
      });
    }

    const colorKey = `${e.styleFolder.id}::${keyOf(e.colorFolder.title)}`;
    if (!colors.has(colorKey)) {
      colors.set(colorKey, {
        key: colorKey,
        blank_drive_folder_id: e.styleFolder.id,
        name: e.colorFolder.title,
        display_name: prettyName(e.colorFolder.title),
        drive_folder_id: e.colorFolder.id,
        sort_order: colors.size,
      });
    }

    const view = classifyView(e.viewFolder?.title ?? "");
    if (!view.viewType) {
      skippedViews.push({ style: parsed.raw, folder: e.viewFolder?.title ?? "(none)" });
      continue;
    }

    images.push({
      blank_drive_folder_id: e.styleFolder.id,
      color_key: colorKey,
      view_type: view.viewType,
      variant: view.variant,
      is_primary: view.isPrimary,
      drive_file_id: e.file.id,
      drive_folder_id: e.viewFolder?.id ?? e.colorFolder.id,
      drive_url: driveThumbUrl(e.file.id),
      filename: e.file.title,
      mime_type: e.file.mimeType ?? null,
      modified_at: e.file.modifiedTime ?? null,
    });
  }

  // Colour order follows the Drive's own alphabetical listing rather than
  // discovery order, so the picker is stable between runs.
  const colorList = [...colors.values()].sort((a, b) =>
    a.blank_drive_folder_id === b.blank_drive_folder_id
      ? a.display_name.localeCompare(b.display_name)
      : a.blank_drive_folder_id.localeCompare(b.blank_drive_folder_id),
  );
  let n = 0;
  let currentBlank = null;
  for (const c of colorList) {
    if (c.blank_drive_folder_id !== currentBlank) {
      currentBlank = c.blank_drive_folder_id;
      n = 0;
    }
    c.sort_order = n++;
  }

  return { blanks: [...blanks.values()], colors: colorList, images, skippedViews };
}

/** Colourways with no photograph at all — worth knowing, not worth blocking on. */
export function colorsWithoutImages(catalog) {
  const withImages = new Set(catalog.images.map((i) => i.color_key));
  return catalog.colors.filter((c) => !withImages.has(c.key));
}
