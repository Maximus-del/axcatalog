// GET /collections — the destinations on the Locker Room wall.
//
// A destination IS a collection. Which collections appear, their art, label,
// jersey number and accent are server-maintained on the collection row in
// metadata.portal_destination, so AX controls the wall and a new era is a data
// change, not a deploy:
//
//   metadata.portal_destination = {
//     key: "atlanta",            // stable id the UI routes on (?collection=atlanta)
//     label: "Atlanta",
//     jersey_number: 1,          // the number worn in THAT era — not the athlete's current number
//     accent: "#EF233C",
//     image: "/mooney/assets/atlanta-1.png",
//     images: ["https://…/crest-1.png", "https://…/crest-2.png"],  // optional deck; first wins over `image`
//     caption: "Crest I · Crest II",                                 // optional
//     sort: 10,
//     hidden: false
//   }
//
// Without that config a collection still appears, labelled from its team's city
// (or its own name) in the team colour, with no artwork — the UI renders its
// fallback rather than a broken image.
//
// Visibility is the database's: a client reads only active collections that
// belong to them (viewer_collection_ids), and only their own products inside.

import { supabase } from "@/integrations/supabase/client";
import type { Destination, PortalScope } from "./contract";
import { toApiError } from "./money";

type Json = Record<string, unknown>;

export interface CollectionRow {
  id: string;
  name: string;
  slug: string | null;
  status: string | null;
  athlete_id: string | null;
  metadata: Json | null;
  team: { name: string | null; city: string | null; primary_color: string | null } | null;
}

const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_ACCENT = "#2ecc71";

/** Destination key → the gear page filter. One place, so routes agree. */
export function destinationHref(key: string): string {
  return `/portal/gear?collection=${encodeURIComponent(key)}`;
}

/** Pure: collection row → destination, or null when it is configured hidden. Exported for tests. */
export function toDestination(row: CollectionRow, productCount: number): Destination | null {
  const cfg = (row.metadata?.portal_destination ?? {}) as Json;
  if (cfg.hidden === true) return null;
  const key = typeof cfg.key === "string" && cfg.key.trim() ? cfg.key.trim() : (row.slug ?? row.id);
  const jersey = cfg.jersey_number;
  const jerseyNumber =
    typeof jersey === "number" && Number.isInteger(jersey) && jersey >= 0 && jersey < 100
      ? jersey
      : typeof jersey === "string" && /^\d{1,2}$/.test(jersey)
        ? Number(jersey)
        : null;
  const accent =
    typeof cfg.accent === "string" && HEX.test(cfg.accent)
      ? cfg.accent
      : row.team?.primary_color && HEX.test(row.team.primary_color)
        ? row.team.primary_color
        : DEFAULT_ACCENT;
  const usable = (v: unknown): v is string => typeof v === "string" && (v.startsWith("/") || v.startsWith("https://"));
  // `images` is the deck; `image` is the older single-art field. Both are read
  // so Mooney's lockers (image only) keep working untouched.
  const images = Array.from(
    new Set([...(Array.isArray(cfg.images) ? cfg.images.filter(usable) : []), ...(usable(cfg.image) ? [cfg.image] : [])]),
  ).slice(0, 6);
  const image = images[0] ?? null;
  const caption = typeof cfg.caption === "string" ? cfg.caption.trim().slice(0, 60) : "";
  const label =
    (typeof cfg.label === "string" && cfg.label.trim()) || row.team?.city || row.team?.name || row.name;
  return {
    id: key,
    label,
    jerseyNumber,
    accent,
    image,
    images,
    caption,
    href: destinationHref(key),
    collectionId: row.id,
    productCount,
    teamName: row.team?.name ?? null,
  };
}

export function sortKey(row: CollectionRow): number {
  const s = (row.metadata?.portal_destination as Json | undefined)?.sort;
  return typeof s === "number" ? s : 1000;
}

export async function fetchDestinations(scope: PortalScope): Promise<Destination[]> {
  // athlete_id narrows; it does not authorise. RLS decides what comes back —
  // a client asking for another athlete's id gets nothing.
  const { data, error } = await supabase
    .from("collections")
    .select("id, name, slug, status, athlete_id, metadata, team:teams(name, city, primary_color)")
    .eq("athlete_id", scope.athleteId)
    .eq("status", "active");
  if (error) throw toApiError(error);
  const rows = (data ?? []) as unknown as CollectionRow[];
  if (rows.length === 0) return [];

  const { data: links, error: lErr } = await supabase
    .from("collection_products")
    .select("collection_id")
    .in(
      "collection_id",
      rows.map((r) => r.id),
    );
  const counts = new Map<string, number>();
  if (!lErr) {
    for (const l of (links ?? []) as { collection_id: string }[]) {
      counts.set(l.collection_id, (counts.get(l.collection_id) ?? 0) + 1);
    }
  }

  return rows
    .slice()
    .sort((a, b) => sortKey(a) - sortKey(b) || a.name.localeCompare(b.name))
    .map((r) => toDestination(r, counts.get(r.id) ?? 0))
    .filter((d): d is Destination => d !== null);
}
