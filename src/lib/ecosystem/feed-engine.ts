// ─────────────────────────────────────────────────────────────────────────
// FEED ENGINE — one event source, many projections.
// Everything a fan reacts to is a feed event. The SAME events power:
//   • the Home feed          (buildFeed)
//   • notifications          (feedToNotifications)
//   • "new" avatar rings     (newAthleteIds)
//   • the unread bell badge  (countUnread)
// Real products are linked into drop/photoshoot events here ("Shop the Look").
//
// BACKEND: today events come from the deterministic demo generator. When a
// real feed_items / domain_events table exists, replace buildFeed's source —
// every projection below keeps working unchanged.
// ─────────────────────────────────────────────────────────────────────────
import type { FeedItem, FeedType } from "./content-types";
import { demoFeedForAthlete } from "./demo-content";
import { athleteName, type PublicAthlete, type PublicAthleteProduct } from "./types";

export interface EnrichedFeedItem extends FeedItem {
  athleteName: string;
  athleteImage: string | null;
  product?: PublicAthleteProduct;
  /** For drops: hours until it goes live (>0 = upcoming, 0 = available now). */
  liveInHours?: number;
}

export interface NotifItem {
  id: string;
  athleteId: string;
  cat: "drops" | "camps" | "content" | "events";
  title: string;
  sub: string;
  to: string;
  offsetHours: number;
}

const CAT_OF: Record<FeedType, NotifItem["cat"]> = {
  drop: "drops", camp: "camps", event: "events",
  exclusive: "content", photoshoot: "content", update: "content", article: "content",
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic countdown for a drop: ~half upcoming (within 5 days), half live. */
function dropLiveIn(slug: string): number {
  const h = hash(slug + "drop-live");
  return h % 2 === 0 ? (h % 120) : 0;
}

export function buildFeed(
  followed: PublicAthlete[],
  productsByAthlete: Map<string, PublicAthleteProduct[]>,
): EnrichedFeedItem[] {
  const items: EnrichedFeedItem[] = [];
  for (const a of followed) {
    const name = athleteName(a);
    const base = demoFeedForAthlete({ id: a.id, slug: a.slug, first: a.first_name });
    for (const item of base) {
      const product =
        item.type === "drop" || item.type === "photoshoot"
          ? productsByAthlete.get(a.id)?.[0]
          : undefined;
      items.push({
        ...item,
        athleteName: name,
        athleteImage: a.image_url,
        product,
        liveInHours: item.type === "drop" ? dropLiveIn(a.slug) : undefined,
        productId: product?.id ?? item.productId,
      });
    }
  }
  // Recency-ranked (smaller offset = more recent). Upcoming drops surface near top.
  return items.sort((x, y) => {
    const xu = x.type === "drop" && (x.liveInHours ?? 0) > 0 ? -12 : 0;
    const yu = y.type === "drop" && (y.liveInHours ?? 0) > 0 ? -12 : 0;
    return x.publishedOffsetHours + xu - (y.publishedOffsetHours + yu);
  });
}

export function pickFeatured(feed: EnrichedFeedItem[]): EnrichedFeedItem | null {
  return feed.find((f) => f.product) ?? feed[0] ?? null;
}

export function feedToNotifications(feed: EnrichedFeedItem[]): NotifItem[] {
  return feed
    .map((f) => ({
      id: f.id,
      athleteId: f.athleteId,
      cat: CAT_OF[f.type],
      title: `${f.athleteName} — ${f.headline}`,
      sub: f.body,
      to:
        f.type === "drop" ? `/a/${f.athleteSlug}?tab=shop`
        : f.type === "camp" ? `/a/${f.athleteSlug}?tab=camps`
        : f.type === "exclusive" || f.type === "event" ? `/a/${f.athleteSlug}?tab=access`
        : `/a/${f.athleteSlug}`,
      offsetHours: f.publishedOffsetHours,
    }))
    .sort((a, b) => a.offsetHours - b.offsetHours);
}

/** Athletes with an event within the window — powers "new" avatar rings. */
export function newAthleteIds(feed: EnrichedFeedItem[], withinHours = 72): Set<string> {
  const s = new Set<string>();
  for (const f of feed) if (f.publishedOffsetHours <= withinHours) s.add(f.athleteId);
  return s;
}

/** Count of notifications more recent than `thresholdHours` ago (unread). */
export function countUnread(notifs: NotifItem[], thresholdHours: number): number {
  return notifs.filter((n) => n.offsetHours <= thresholdHours).length;
}

/** Friendly countdown label for a drop's liveInHours. */
export function dropCountdown(liveInHours: number | undefined): string | null {
  if (liveInHours == null) return null;
  if (liveInHours <= 0) return "Available now";
  if (liveInHours < 24) return `Drops in ${Math.round(liveInHours)}h`;
  return `Drops in ${Math.round(liveInHours / 24)}d`;
}
