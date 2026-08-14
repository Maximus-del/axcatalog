// Shared content model for the fan experience. FeedItem references reusable
// objects (athlete, product, camp, article, event) rather than embedding
// content — so a real event-driven backend can replace the demo generator
// later without changing the UI.

export type FeedType = "drop" | "exclusive" | "camp" | "update" | "photoshoot" | "event" | "article";
export type AccessLevel = "public" | "followers" | "subscribers" | "vip";

export interface FeedItem {
  id: string;
  athleteId: string;
  athleteSlug: string;
  type: FeedType;
  headline: string;
  body: string;
  cta: string;
  accessLevel: AccessLevel;
  /** Hours before "now"; resolved to a real timestamp at render time. */
  publishedOffsetHours: number;
  /** Reusable object references (any may be set depending on type). */
  productId?: string;
  campId?: string;
  articleId?: string;
  eventId?: string;
  demo: true;
}

export interface Camp {
  id: string;
  athleteId: string;
  athleteSlug: string;
  name: string;
  city: string;
  /** Days from "now" until the camp date. */
  dateOffsetDays: number;
  /** Days from "now" until registration opens (negative = already open). */
  regOpensOffsetDays: number;
  accessEarlyHours: number;
  demo: true;
}

export interface Article {
  id: string;
  athleteId: string | null;
  athleteSlug: string | null;
  kicker: string;
  title: string;
  excerpt: string;
  publishedOffsetHours: number;
  demo: true;
}

export const ACCESS_TYPES: ReadonlySet<FeedType> = new Set<FeedType>(["exclusive", "event"]);

export const FEED_TYPE_LABEL: Record<FeedType, string> = {
  drop: "New Drop",
  exclusive: "Access Only",
  camp: "Camp",
  update: "Update",
  photoshoot: "New Content",
  event: "Access Event",
  article: "Story",
};
