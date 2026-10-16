// Product pictures that live in the Drive master library.
//
// A product can name one or more Drive folders as its picture source. The
// sync (supabase/functions/drive-sync-product-images) lists those folders and
// mirrors the showcase images into product_images as links, so the portal
// shows exactly what is in Drive: replace, add or remove a file in Drive and
// the client's dashboard follows on the next sync.
//
// Imported by BOTH the Deno edge function and the browser bundle (tests, V2),
// so it is plain TypeScript with no Deno or DOM APIs in it.
//
// Rules, each of which exists because the alternative is silently wrong:
//
//   Only showcase files are shown. A folder also holds PRINT files, layered
//   MASTER zips and LAYER pieces; those are production art, never a product
//   photo. A file is shown only when its name says PREVIEW, FLAT, MODEL,
//   LIFESTYLE or DETAIL (the library naming rules).
//
//   Identity is the Drive file id. A rename updates the row; a file that is
//   gone from Drive is removed from the portal.
//
//   Front/Back chosen in V2 wins. The file name only suggests a side for a
//   picture that has none yet.

export interface DriveSource {
  /** Drive folder id. */
  id: string;
  /** Operator's note, e.g. "Shared front" or "#11 — Option B". */
  label?: string | null;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
}

export interface ExistingDriveRow {
  id: string;
  storage_path: string | null;
  sort_order: number | null;
  is_primary: boolean | null;
  metadata: Record<string, unknown> | null;
}

export interface DesiredImage {
  fileId: string;
  folderId: string;
  name: string;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
  modified: string | null;
}

export interface DrivePlan {
  insert: Array<{ storage_path: string; file_name: string; sort_order: number; is_primary: boolean; metadata: Record<string, unknown> }>;
  update: Array<{ id: string; storage_path: string; file_name: string; sort_order: number; is_primary: boolean; metadata: Record<string, unknown> }>;
  remove: string[];
  shown: number;
}

export const DRIVE_SOURCE = "drive";
export const MAX_DRIVE_SOURCES = 12;

const SHOWCASE = /(^|[_\s-])(PREVIEW|FLAT|FLATLAY|MODEL|LIFESTYLE|DETAIL)([_\s.-]|$)/i;
const PRODUCTION = /(^|[_\s-])(PRINT|MASTER|LAYER|CONTACT|BOARD|NOTES)([_\s.-]|$)/i;

/** Pull a Drive folder id out of a pasted link or a bare id. Null when it is neither. */
export function parseDriveFolderId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) ?? s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}

/** Is this file a product picture (as opposed to production art or notes)? */
export function isShowcaseFile(file: Pick<DriveFile, "name" | "mimeType">): boolean {
  if (!/^image\//i.test(file.mimeType)) return false;
  const stem = file.name.replace(/\.[a-z0-9]+$/i, "");
  return SHOWCASE.test(stem) && !PRODUCTION.test(stem);
}

/** The side a file name suggests: PREVIEW-FRONT → front, PREVIEW-BACK → back. */
export function sideFromName(name: string): "front" | "back" | null {
  const n = name.toUpperCase();
  if (/(^|[_\s-])BACK([_\s.-]|$)/.test(n)) return "back";
  if (/(^|[_\s-])FRONT([_\s.-]|$)/.test(n)) return "front";
  return null;
}

/** Fronts first, then backs, then flats and the rest — within one folder. */
function rank(name: string): number {
  const side = sideFromName(name);
  if (side === "front") return 0;
  if (side === "back") return 1;
  if (/FLAT/i.test(name)) return 2;
  return 3;
}

/**
 * The web-sized picture for a Drive file. Drive resizes it (the originals are
 * 4000px, 12MB PNGs). `v` changes when the file is replaced in Drive, so a
 * browser holding the old picture fetches the new one.
 */
export function driveImageUrl(fileId: string, modified: string | null): string {
  const v = modified ? Math.floor(Date.parse(modified) / 1000) : 0;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600${v ? `&v=${v}` : ""}`;
}

/** Folders in the order the operator listed them; files in each by rank then name. */
export function desiredImages(sources: DriveSource[], filesByFolder: Record<string, DriveFile[]>): DesiredImage[] {
  const seen = new Set<string>();
  const out: DesiredImage[] = [];
  for (const src of sources) {
    const files = (filesByFolder[src.id] ?? [])
      .filter(isShowcaseFile)
      .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
    for (const f of files) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({
        fileId: f.id,
        folderId: src.id,
        name: f.name,
        url: driveImageUrl(f.id, f.modifiedTime),
        sortOrder: out.length,
        isPrimary: false,
        modified: f.modifiedTime,
      });
    }
  }
  const primary = out.find((d) => sideFromName(d.name) === "front") ?? out[0];
  if (primary) primary.isPrimary = true;
  return out;
}

/** Work out the inserts, updates and removals that make product_images match Drive. */
export function planDriveSync(
  sources: DriveSource[],
  filesByFolder: Record<string, DriveFile[]>,
  existing: ExistingDriveRow[],
): DrivePlan {
  const desired = desiredImages(sources, filesByFolder);
  const drive = existing.filter((r) => (r.metadata ?? {}).source === DRIVE_SOURCE);
  const byFile = new Map<string, ExistingDriveRow>();
  for (const r of drive) {
    const fid = String((r.metadata ?? {}).drive_file_id ?? "");
    if (fid && !byFile.has(fid)) byFile.set(fid, r);
  }
  const wanted = new Set(desired.map((d) => d.fileId));

  // Sides already chosen (in V2 or by an earlier sync) on pictures that stay.
  const claimed = new Set<string>();
  for (const d of desired) {
    const v = (byFile.get(d.fileId)?.metadata ?? {}).portal_view;
    if (v === "front" || v === "back") claimed.add(v);
  }

  const plan: DrivePlan = { insert: [], update: [], remove: [], shown: desired.length };
  for (const d of desired) {
    const row = byFile.get(d.fileId);
    const base = {
      ...(row?.metadata ?? {}),
      source: DRIVE_SOURCE,
      drive_file_id: d.fileId,
      drive_folder_id: d.folderId,
      drive_name: d.name,
      drive_modified: d.modified,
    } as Record<string, unknown>;
    if (base.portal_view !== "front" && base.portal_view !== "back") {
      delete base.portal_view;
      const side = sideFromName(d.name);
      if (side && !claimed.has(side)) {
        base.portal_view = side;
        claimed.add(side);
      }
    }
    const fields = { storage_path: d.url, file_name: d.name, sort_order: d.sortOrder, is_primary: d.isPrimary, metadata: base };
    if (!row) {
      plan.insert.push(fields);
      continue;
    }
    const m = row.metadata ?? {};
    const changed =
      row.storage_path !== d.url ||
      (row.sort_order ?? 0) !== d.sortOrder ||
      !!row.is_primary !== d.isPrimary ||
      m.drive_name !== d.name ||
      m.drive_folder_id !== d.folderId ||
      m.portal_view !== base.portal_view;
    if (changed) plan.update.push({ id: row.id, ...fields });
  }
  for (const r of drive) {
    const fid = String((r.metadata ?? {}).drive_file_id ?? "");
    if (!wanted.has(fid) || byFile.get(fid) !== r) plan.remove.push(r.id);
  }
  return plan;
}

/** True when an image row came from the Drive library. */
export function isDriveImage(metadata: Record<string, unknown> | null | undefined): boolean {
  return (metadata ?? {}).source === DRIVE_SOURCE;
}

/**
 * When a product has Drive pictures, those are its pictures: Shopify photos
 * and older uploads are kept but not shown. Otherwise everything shows.
 */
export function preferDrive<T extends { metadata?: Record<string, unknown> | null }>(images: T[]): T[] {
  const drive = images.filter((i) => isDriveImage(i.metadata));
  return drive.length ? drive : images;
}
