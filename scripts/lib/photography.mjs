// AX Blank Photography — the rules that turn a Drive folder tree into rows.
//
// SOURCE OF TRUTH: the "AX Blank Photography" Drive is authoritative for what a
// blank LOOKS like. It is deliberately NOT authoritative for which blanks exist
// or what is in stock — Shopify owns that, and pricing lives in its own sheet.
// So this module never invents a blank. A Drive style with no matching blank is
// reported, loudly, and skipped.
//
// Everything here is pure so the matching can be tested without a network or a
// database. The network and the writes live in ../sync-blank-photography.mjs.

/* ------------------------------------------------------------------ colours */

/**
 * Colour names have to survive a round trip between three systems that each
 * spell them differently: Drive folders (VINTAGE_WOOD_CAMO), the database
 * (Vintage Wood Camo) and supplier sheets (vintage wood camo).
 *
 * Note what is NOT done here: no spelling correction. The AXISM supplier spells
 * it "Sulpher Brown" and their README says so explicitly. Silently fixing that
 * to "Sulphur" would break the match against the database, which also stores
 * the supplier's spelling. The library is the authority on its own names.
 */
export function normalizeColor(name) {
  if (!name) return "";
  return String(name)
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Human-facing colour, derived from a Drive folder name. */
export function prettyColor(name) {
  return normalizeColor(name)
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* -------------------------------------------------------------------- views */

/**
 * Which surface a folder represents, and whether it is the one to show.
 *
 * Hoodies are shot three ways: FRONT, BACK_HOOD_DOWN and BACK_HOOD_UP. Hood-down
 * is the canonical back because it is the one where the print area is flat and
 * unobstructed — a hood-up shot hides the top third of exactly the area an
 * operator is placing artwork on. Hood-up is kept as a secondary image rather
 * than discarded; it is the better shot for a client-facing gallery.
 */
export function classifyView(folderName) {
  const key = normalizeColor(folderName).replace(/\s+/g, "_");
  if (key === "front") return { viewType: "front", variant: null, isPrimary: true };
  if (key === "back") return { viewType: "back", variant: null, isPrimary: true };
  if (key === "back_hood_down") return { viewType: "back", variant: "hood_down", isPrimary: true };
  if (key === "back_hood_up") return { viewType: "back", variant: "hood_up", isPrimary: false };
  if (key.startsWith("front")) return { viewType: "front", variant: key.slice(6) || null, isPrimary: false };
  if (key.startsWith("back")) return { viewType: "back", variant: key.slice(5) || null, isPrimary: false };
  return { viewType: null, variant: null, isPrimary: false };
}

/* ------------------------------------------------------------------- styles */

/**
 * Style folders are named two ways in the same library:
 *   "7010 — DRI EASE OVERSIZED TEE"   (AXISM: style number first)
 *   "SPECIAL HOODIE 14 OZ"            (Cotton Collective: name only)
 *
 * Both are parsed rather than one being declared correct, because the folders
 * are the supplier's own organisation and renaming them to suit the importer
 * would break the human workflow the library exists for.
 */
export function parseStyleFolder(title) {
  const raw = String(title ?? "").trim();
  const m = raw.match(/^([A-Za-z0-9][A-Za-z0-9.\-]*)\s*[—–-]\s*(.+)$/);
  if (m) return { styleNumber: m[1].trim(), name: m[2].trim(), raw };
  return { styleNumber: null, name: raw, raw };
}

/** Loose comparison key for style/blank names. */
export function nameKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    // "14oz" and "14 oz" are the same garment. The unit has to be stripped both
    // when it is attached to the number and when it stands alone.
    .replace(/(\d)\s*(oz|ounce|ounces)\b/g, "$1")
    .replace(/\b(oz|ounce|ounces)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match a Drive style folder to an existing blank.
 *
 * FOUR STRATEGIES, IN ORDER OF HOW MUCH THEY CAN BE TRUSTED.
 *
 * 1. A stored binding (`blanks.drive_product_folder_id`). Once a human has
 *    confirmed that this folder is that blank, it is never guessed again.
 * 2. Style number — the supplier's own identifier, the one thing both systems
 *    agree on.
 * 3. An exact normalised name.
 * 4. An unambiguous containment match.
 *
 * Names alone are NOT enough and this is not theoretical: Cotton Collective's
 * folder is "SPECIAL HOODIE 14 OZ" while the catalog calls the same garment
 * "Garment-Wash Hoodie 14oz". Nothing short of a human saying so can connect
 * those, which is exactly why strategy 1 exists and why an unmatched style is
 * reported rather than guessed. A wrong match attaches a hoodie's photography
 * to a tee, and nobody notices until a client sees it.
 */
export function matchBlank(styleFolder, blanks) {
  const { styleNumber, name, folderId } = styleFolder;

  if (folderId) {
    const bound = blanks.filter((b) => b.drive_product_folder_id === folderId);
    if (bound.length === 1) return { blank: bound[0], via: "stored_binding" };
  }

  if (styleNumber) {
    const byNumber = blanks.filter(
      (b) => b.style_number && b.style_number.toLowerCase() === styleNumber.toLowerCase(),
    );
    if (byNumber.length === 1) return { blank: byNumber[0], via: "style_number" };
    if (byNumber.length > 1) return { blank: null, via: "ambiguous_style_number" };
  }

  const key = nameKey(name);
  if (!key) return { blank: null, via: "no_name" };

  const exact = blanks.filter((b) => nameKey(b.name) === key);
  if (exact.length === 1) return { blank: exact[0], via: "name_exact" };
  if (exact.length > 1) return { blank: null, via: "ambiguous_name" };

  const contains = blanks.filter((b) => {
    const bk = nameKey(b.name);
    return bk.includes(key) || key.includes(bk);
  });
  if (contains.length === 1) return { blank: contains[0], via: "name_contains" };
  if (contains.length > 1) return { blank: null, via: "ambiguous_name_contains" };

  return { blank: null, via: "no_match" };
}

/* -------------------------------------------------------------------- URLs */

/**
 * A renderable URL for a public Drive file.
 *
 * This is Google's public thumbnail endpoint. It works because the library is
 * shared "anyone with the link", needs no key at render time, and costs nothing
 * to adopt — but it is undocumented and rate-limited, so it is a bridge rather
 * than a destination. Mirroring these into Supabase storage is the durable
 * version, and because every consumer resolves images through one module
 * (src/lib/v2/blank-image.ts), that swap changes this function and nothing else.
 */
export function driveThumbUrl(fileId, size = 1600) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}

/* -------------------------------------------------------------------- plan */

/**
 * Turn a walked Drive tree into the rows to write, plus everything that did not
 * match so a human can look at it.
 *
 * `entries` are flat: { styleFolder, colorFolder, viewFolder, file }.
 */
export function buildPlan(entries, blanks) {
  const images = [];
  const unmatchedStyles = new Map();
  const unmatchedColors = [];
  const skippedViews = [];

  const colorsByBlank = new Map();
  for (const b of blanks) {
    colorsByBlank.set(
      b.id,
      new Map((b.colors ?? []).map((c) => [normalizeColor(c.color_name), c])),
    );
  }

  for (const e of entries) {
    const parsed = { ...parseStyleFolder(e.styleFolder.title), folderId: e.styleFolder.id };
    const { blank, via } = matchBlank(parsed, blanks);
    if (!blank) {
      if (!unmatchedStyles.has(parsed.raw)) {
        unmatchedStyles.set(parsed.raw, { style: parsed.raw, folderId: e.styleFolder.id, reason: via });
      }
      continue;
    }

    const view = classifyView(e.viewFolder?.title ?? "");
    if (!view.viewType) {
      skippedViews.push({ blank: blank.name, folder: e.viewFolder?.title ?? "(none)" });
      continue;
    }

    const normalized = normalizeColor(e.colorFolder.title);
    const dbColor = colorsByBlank.get(blank.id)?.get(normalized) ?? null;
    if (!dbColor) {
      unmatchedColors.push({ blank: blank.name, color: prettyColor(e.colorFolder.title) });
    }

    images.push({
      blank_id: blank.id,
      blank_name: blank.name,
      color: dbColor ? dbColor.color_name : prettyColor(e.colorFolder.title),
      normalized_color: normalized,
      view_type: view.viewType,
      variant: view.variant,
      drive_file_id: e.file.id,
      drive_folder_id: e.viewFolder?.id ?? e.colorFolder.id,
      filename: e.file.title,
      mime_type: e.file.mimeType ?? null,
      drive_url: driveThumbUrl(e.file.id),
      modified_at: e.file.modifiedTime ?? null,
      is_primary: view.isPrimary,
      missing: false,
      matched_color: Boolean(dbColor),
      match_via: via,
    });
  }

  return {
    images,
    unmatchedStyles: [...unmatchedStyles.values()],
    unmatchedColors,
    skippedViews,
  };
}

/**
 * The derived `blank_colors` cache: one front and one back URL per colourway.
 *
 * blank_images is the record; these two columns are a convenience copy that the
 * app reads directly. Deriving them here rather than letting them drift is what
 * makes the Drive the source of truth in practice and not just on paper.
 */
export function planColorCache(images) {
  const best = new Map();
  for (const img of images) {
    if (!img.matched_color) continue;
    const key = `${img.blank_id}::${img.normalized_color}`;
    const slot = best.get(key) ?? { blank_id: img.blank_id, normalized_color: img.normalized_color, front: null, back: null };
    const field = img.view_type === "back" ? "back" : "front";
    // A primary view always wins; otherwise first one seen holds the slot.
    if (!slot[field] || (img.is_primary && !slot[`${field}_primary`])) {
      slot[field] = img.drive_url;
      slot[`${field}_primary`] = img.is_primary;
    }
    best.set(key, slot);
  }
  return [...best.values()];
}
