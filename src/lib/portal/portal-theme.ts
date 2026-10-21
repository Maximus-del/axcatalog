// THE PORTAL'S LOOK, AS DATA.
//
// Chase controls how each client's portal looks; the client only sees it. So
// the look cannot live in a component — it lives on the entity, in
// `athletes.metadata.portal_theme`, and the portal turns it into the same CSS
// variables the whole UI already paints with (`--accent`, `--dark`, …).
//
// That is the point of doing it this way round: anything built later — by
// hand, or by Lovable from a prompt — that uses the existing tokens
// (`bg-accent`, `hsl(var(--dark))`, `text-[hsl(var(--portal-title))]`) is
// themeable per client for free. Anything that hard-codes a hex is not.
//
// No migration: `metadata` is already a JSON blob, operators can write it and
// a client can read their own row (policy "client reads own athlete"). The
// other keys in metadata (modules, avatar_url, template_id, notif_defaults)
// are left exactly as they were — see mergePortalTheme().

export interface PortalTitleCard {
  /** Small caps line above the headline, e.g. "Season 7". */
  eyebrow: string;
  /** The big line. Empty means no title card is shown. */
  headline: string;
  /** One line under it. */
  subline: string;
}

export interface PortalTheme {
  /** Buttons, highlights, the revenue figure, focus rings. Hex. */
  accent: string;
  /** The header band and deep sections (`--dark`). Hex. */
  header: string;
  /** Page background (`--background`). Hex. */
  background: string;
  /** The client's name in the header and the title card headline. Hex. */
  title: string;
  titleCard: PortalTitleCard;
  /**
   * Which portal shell this client gets. "classic" is the original portal;
   * "world" is the cinematic locker-room shell (Mooney World) built on the
   * same data. Switched per client from V2, so one client can move to the new
   * look without changing anyone else's portal.
   */
  layout: PortalLayoutKind;
  /** The world's name in the sidebar logo, e.g. "Mooney World". Empty → the client's last name + " World". */
  brand: string;
  /** How the world shell dresses itself for THIS client. Defaults are Mooney's, so an unset theme changes nothing. */
  world: PortalWorld;
}

export type PortalLayoutKind = "classic" | "world";

/** The home room's shortcuts, in the order they show. Each is a fixed action; only the choice and order are data. */
export type QuickPlayKey = "order" | "design" | "request" | "projects" | "content" | "code" | "drops";

export const QUICK_PLAYS: { key: QuickPlayKey; label: string }[] = [
  { key: "order", label: "Order gear" },
  { key: "design", label: "Start a design" },
  { key: "request", label: "Request a design" },
  { key: "projects", label: "Review projects" },
  { key: "content", label: "Download content" },
  { key: "code", label: "Get my code" },
  { key: "drops", label: "View drops" },
];

/**
 * The world shell, per client. Mooney World is a locker room with lockers;
 * Proactive is a gym with plaques on pedestals. Same shell, same data — what
 * changes is written here, so the next client is a form, not a fork.
 */
export interface PortalWorld {
  /** The home room's name — nav label and page title. "Locker Room", "Gym HQ". */
  roomName: string;
  /** Home headline. {name} → the client's name, {room} → roomName. */
  headline: string;
  /** Optional words after the headline, in the accent colour ("THE GYM"). */
  headlineAccent: string;
  tagline: string;
  /** Sidebar mark. Empty → the moon icon. https:// or a /public path. */
  logoUrl: string;
  /** The room photo behind the home page. Empty → the locker room. */
  heroUrl: string;
  /** Second brand colour, used sparingly (glows, the active underline). Empty → none. */
  accent2: string;
  /** "locker": art stands in the locker bays. "pedestal": plaques on lit pedestals. */
  stage: "locker" | "pedestal";
  showStats: boolean;
  quickPlays: QuickPlayKey[];
}

export const DEFAULT_WORLD: PortalWorld = {
  roomName: "Locker Room",
  headline: "Welcome to your {room}, {name}.",
  headlineAccent: "",
  tagline: "Same game. Bigger moves.",
  logoUrl: "",
  heroUrl: "",
  accent2: "",
  stage: "locker",
  showStats: true,
  quickPlays: ["order", "design", "code", "content"],
};

/** What the portal looked like before themes existed — so "no theme" changes nothing. */
export const DEFAULT_PORTAL_THEME: PortalTheme = {
  accent: "#2ecc71",
  header: "#0d0d0d",
  background: "#1a1a1a",
  title: "#ffffff",
  titleCard: { eyebrow: "", headline: "", subline: "" },
  layout: "classic",
  brand: "",
  world: DEFAULT_WORLD,
};

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const MAX_TEXT = 80;

/** "#abc" → "#aabbcc", lowercased. null when it is not a colour. */
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!HEX.test(v)) return null;
  const body = v.slice(1).toLowerCase();
  return body.length === 3 ? `#${body.split("").map((c) => c + c).join("")}` : `#${body}`;
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

/**
 * Whatever is stored, a usable theme comes back.
 *
 * metadata is free-form JSON that operators, V1 and Lovable all write to, so
 * this never trusts its shape: a field that is missing or not a valid colour
 * falls back to the default for that field alone, rather than discarding the
 * whole theme. Text is collapsed and capped so a pasted paragraph cannot break
 * the header.
 */
export function parsePortalTheme(raw: unknown): PortalTheme {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const card =
    src.titleCard && typeof src.titleCard === "object" && !Array.isArray(src.titleCard)
      ? (src.titleCard as Record<string, unknown>)
      : {};
  const d = DEFAULT_PORTAL_THEME;
  return {
    accent: normalizeHex(src.accent) ?? d.accent,
    header: normalizeHex(src.header) ?? d.header,
    background: normalizeHex(src.background) ?? d.background,
    title: normalizeHex(src.title) ?? d.title,
    titleCard: {
      eyebrow: cleanText(card.eyebrow),
      headline: cleanText(card.headline),
      subline: cleanText(card.subline),
    },
    layout: src.layout === "world" ? "world" : "classic",
    brand: cleanText(src.brand).slice(0, 32),
    world: parseWorld(src.world),
  };
}

const PLAY_KEYS = new Set(QUICK_PLAYS.map((p) => p.key));

/** An image address the portal may load: https, or a path under /public. Anything else → "". */
export function cleanImageUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (/^https:\/\/[^\s"'()<>]+$/i.test(v)) return v.slice(0, 600);
  if (/^\/[A-Za-z0-9/_.-]+$/.test(v) && !v.includes("..")) return v.slice(0, 300);
  return "";
}

export function parseWorld(raw: unknown): PortalWorld {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_WORLD;
  const text = (v: unknown, fallback: string, max = MAX_TEXT) => (typeof v === "string" ? cleanText(v).slice(0, max) : fallback);
  const plays = Array.isArray(src.quickPlays)
    ? Array.from(new Set(src.quickPlays.filter((k): k is QuickPlayKey => typeof k === "string" && PLAY_KEYS.has(k as QuickPlayKey)))).slice(0, 4)
    : d.quickPlays;
  return {
    roomName: text(src.roomName, d.roomName, 24) || d.roomName,
    headline: text(src.headline, d.headline),
    headlineAccent: text(src.headlineAccent, d.headlineAccent, 40),
    tagline: text(src.tagline, d.tagline),
    logoUrl: cleanImageUrl(src.logoUrl),
    heroUrl: cleanImageUrl(src.heroUrl),
    accent2: normalizeHex(src.accent2) ?? "",
    stage: src.stage === "pedestal" ? "pedestal" : "locker",
    showStats: typeof src.showStats === "boolean" ? src.showStats : d.showStats,
    quickPlays: plays.length ? plays : d.quickPlays,
  };
}

/** "Welcome to your {room}, {name}." with the room and client filled in. */
export function worldHeadline(world: PortalWorld, name: string): string {
  return world.headline.replace(/\{name\}/g, name).replace(/\{room\}/g, world.roomName);
}

export function isDefaultTheme(theme: PortalTheme): boolean {
  return JSON.stringify(theme) === JSON.stringify(DEFAULT_PORTAL_THEME);
}

export function hasTitleCard(theme: PortalTheme): boolean {
  return theme.titleCard.headline.length > 0;
}

/** "#2ecc71" → "145 63% 49%" — the bare HSL triplet index.css tokens are written in. */
export function hexToHslTriplet(hex: string): string {
  const n = normalizeHex(hex) ?? DEFAULT_PORTAL_THEME.accent;
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** WCAG relative luminance, 0 (black) – 1 (white). */
export function luminance(hex: string): number {
  const n = normalizeHex(hex) ?? "#000000";
  const ch = [1, 3, 5].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text that sits ON the accent — button labels. Picked, not chosen: a Bears
 * navy accent with the default near-black label would be unreadable, and
 * nobody setting a team colour should have to think about that.
 */
export function readableOn(hex: string): string {
  return contrastRatio(hex, "#0d0d0d") >= contrastRatio(hex, "#ffffff") ? "#0d0d0d" : "#ffffff";
}

/**
 * Plain-language warnings for the editor. The theme still saves — Chase
 * decides — but he is told when a choice will be hard for the client to read.
 */
export function themeWarnings(theme: PortalTheme): string[] {
  const out: string[] = [];
  if (contrastRatio(theme.title, theme.header) < 3)
    out.push("The name will be hard to read on the header colour.");
  if (contrastRatio(theme.accent, theme.background) < 2)
    out.push("The accent barely stands out from the page background.");
  if (luminance(theme.background) > 0.4)
    out.push("A light background: parts of the portal are built for dark and may look washed out.");
  return out;
}

/**
 * The CSS variables a theme sets. Every key here is a token index.css already
 * defines, plus `--portal-title`, so applying a theme only re-colours what
 * exists — it never adds or removes UI.
 */
export function themeCssVars(theme: PortalTheme): Record<string, string> {
  const accent = hexToHslTriplet(theme.accent);
  const onAccent = hexToHslTriplet(readableOn(theme.accent));
  return {
    "--accent": accent,
    "--accent-dim": accent,
    "--accent-foreground": onAccent,
    "--primary": accent,
    "--primary-foreground": onAccent,
    "--ring": accent,
    "--dark": hexToHslTriplet(theme.header),
    "--background": hexToHslTriplet(theme.background),
    "--portal-title": hexToHslTriplet(theme.title),
    // Second brand colour; falls back to the accent so nothing reads it as unset.
    "--accent-2": hexToHslTriplet(theme.world.accent2 || theme.accent),
  };
}

/**
 * Put the theme back into metadata WITHOUT touching anything else in it.
 *
 * metadata also carries modules, avatar_url, template_id and notif_defaults,
 * written by other screens. Replacing the blob would wipe them. A default
 * theme removes the key entirely rather than storing a copy of the defaults,
 * so "reset" leaves the row as if this feature had never touched it.
 */
export function mergePortalTheme(metadata: unknown, theme: PortalTheme): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const clean = parsePortalTheme(theme);
  if (isDefaultTheme(clean)) {
    delete base.portal_theme;
  } else {
    base.portal_theme = clean;
  }
  return base;
}
