// Drive 06 (CONTENT ASSETS) -> the content review queue. Pure planning only:
// the edge function lists Drive and writes; everything that decides WHO a
// picture is for and WHAT it is called lives here, so it is unit-tested
// (src/lib/v2/content-intake.test.ts) and shared with the dashboard.
//
// Routing, as Chase set it (2026-10-21):
//   a top folder named for a client (PROACTIVE, DARNELL MOONEY…) -> that client
//   anything else (WEBSITE CONTENT, WORLD TOUR, campaign library…) -> AX's own
// 99_METADATA-ARCHIVE and _ARCHIVE folders are history and never ingested.
// Every picture arrives as "pending": nothing reaches a client before review.

export interface IndexAsset {
  drive_file_id: string;
  owner?: string | null;
  campaign?: string | null;
  category?: string | null;
  creative_type?: string | null;
  format?: string | null;
  discount_percent?: number | null;
  color?: string | null;
  file_name?: string | null;
}

export interface IntakeFile {
  id: string;
  name: string;
  mimeType: string;
  /** Folder names from the 06 root down to the file's folder, e.g. ["PROACTIVE", "PSP-…", "01_PROMOTIONAL", "01_DISCOUNT"]. */
  path: string[];
}

export interface Owner {
  athleteId: string;
  /** Folder names that mean this client, upper-case. */
  folders: string[];
}

export interface IntakeRow {
  sourceKey: string;
  athleteId: string | null;
  bucket: string;
  type: "photo" | "video";
  title: string;
  body: string | null;
  heroUrl: string;
  category: string;
  format: string | null;
  media: Record<string, unknown>;
}

export const ARCHIVE_FOLDER = /^(99_|_?ARCHIVE)/i;
export const INDEX_FILE = /^AX-SOCIAL-ASSET-INDEX_v(\d+)\.json$/i;

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

/** Which client a top folder belongs to, or null for AX's own. */
export function ownerOf(topFolder: string, owners: Owner[]): string | null {
  const name = norm(topFolder);
  return owners.find((o) => o.folders.some((f) => norm(f) === name))?.athleteId ?? null;
}

/** AX-side bin name from the top folder: "WEBSITE CONTENT — COLLECTIONS & SERVICES — 2026-09" -> "website". */
export function axBin(topFolder: string): string {
  const n = norm(topFolder);
  if (n.startsWith("WEBSITE")) return "website";
  if (n.includes("WORLD TOUR")) return "world-tour";
  if (n.includes("CAMPAIGN LIBRARY")) return "campaign-library";
  return "ax";
}

/** Content category from where the file sits (01_DISCOUNT, 03_GHOST-MANNEQUINS, 03_MODEL-SHOOTS…). */
export function categoryFromPath(path: string[]): string | null {
  for (const raw of [...path].reverse()) {
    const p = raw.toUpperCase();
    if (p.includes("DISCOUNT")) return "discount";
    if (p.includes("GIVEAWAY")) return "giveaway";
    if (p.includes("REPOST")) return "repost";
    if (p.includes("FLAT")) return "flatlay";
    if (p.includes("GHOST")) return "ghost";
    if (p.includes("MODEL")) return "model";
  }
  return null;
}

/** "03-steven-shareef-wide-hero.png" -> "Steven Shareef wide hero". */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/^\d+[-_ ]+/, "").replace(/[-_]+/g, " ").trim();
  if (!base) return name;
  const lower = base === base.toUpperCase() ? base.toLowerCase() : base;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

const LABEL: Record<string, string> = {
  EDITORIAL: "Editorial",
  REPOST: "Repost",
  GIVEAWAY: "Giveaway",
  "ATELIER-LEVITATION": "Atelier, floating",
  "ATELIER-SCULPTURE": "Atelier, sculpture",
  "ATELIER-FLATLAY": "Atelier, flat lay",
};

/** "PSP-STRENGTHCLUB_ECRU_2026-10" -> "Strength Club"; "MW-FOOTBALLTOUR_NYG17_BLACK_2026-10" -> "Football Tour #17". */
export function lineName(campaign: string): string {
  const [code, second] = campaign.split("_");
  const design = code.replace(/^[A-Z]+-/, "");
  const words = design
    .replace(/STRENGTHCLUB/, "STRENGTH CLUB")
    .replace(/UNIVERSITYHERITAGE/, "UNIVERSITY HERITAGE")
    .replace(/FOOTBALLTOUR/, "FOOTBALL TOUR")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bWrld\b/, "WRLD");
  const num = second?.match(/^[A-Z]{2,4}(\d{1,2})$/)?.[1];
  return num ? `${words} #${num}` : words;
}

export function titleFromIndex(a: IndexAsset): string | null {
  if (!a.campaign) return null;
  const ct = (a.creative_type ?? "").toUpperCase();
  const what = ct.startsWith("SAVE") && a.discount_percent
    ? `Save ${a.discount_percent}%`
    : LABEL[ct] ?? (a.category === "model" ? "Model shot" : "Product shot");
  const fmt = (a.format ?? "").toUpperCase().includes("FEED") ? "Feed post" : "Story";
  const color = a.color ? ` · ${a.color}` : "";
  return `${lineName(a.campaign)}${color} — ${what} (${fmt})`;
}

export const TEMPLATE_NOTE = "Ready-made template. Tell AX before you post it so the code or giveaway is switched on.";

export const driveThumb = (id: string) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;

export function isMedia(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

/** One file -> the row the queue gets. Null when the file is not something to review. */
export function planRow(file: IntakeFile, owners: Owner[], index: Map<string, IndexAsset>): IntakeRow | null {
  if (!isMedia(file.mimeType) || file.path.some((p) => ARCHIVE_FOLDER.test(p))) return null;
  const top = file.path[0] ?? "";
  const athleteId = ownerOf(top, owners);
  const meta = index.get(file.id);
  const category = meta?.category ?? categoryFromPath(file.path) ?? (athleteId ? "content" : axBin(top));
  return {
    sourceKey: `drive:${file.id}`,
    athleteId,
    bucket: athleteId ? "client" : axBin(top),
    type: file.mimeType.startsWith("video/") ? "video" : "photo",
    title: (meta && titleFromIndex(meta)) ?? titleFromFileName(file.name),
    body: category === "discount" || category === "giveaway" ? TEMPLATE_NOTE : null,
    heroUrl: driveThumb(file.id),
    category,
    format: meta?.format ?? null,
    media: {
      source: "drive-06",
      drive_file_id: file.id,
      file_name: file.name,
      folder: file.path.join(" / "),
      campaign: meta?.campaign ?? null,
      creative_type: meta?.creative_type ?? null,
    },
  };
}

/** The newest AX-SOCIAL-ASSET-INDEX_vNN.json among the root files, or null. */
export function newestIndex<T extends { name: string }>(files: T[]): T | null {
  let best: T | null = null;
  let bestV = -1;
  for (const f of files) {
    const v = Number(f.name.match(INDEX_FILE)?.[1] ?? -1);
    if (v > bestV) { best = f; bestV = v; }
  }
  return best;
}
