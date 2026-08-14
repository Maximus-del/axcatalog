// DEMO CONTENT GENERATOR — clearly-labeled placeholder content so the fan UI
// can be evaluated before the real content/event backend exists. Everything
// returned carries `demo: true`. Generation is deterministic per athlete so
// the feed is stable across renders. NONE of this is a real athlete statement.
import type { Article, Camp, FeedItem, FeedType } from "./content-types";

interface AthleteSeed {
  id: string;
  slug: string;
  first: string;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

const DEMO_CITIES = ["Houston, TX", "Atlanta, GA", "Dallas, TX", "Los Angeles, CA", "Chicago, IL", "Miami, FL", "Nashville, TN", "Phoenix, AZ"];

// Each athlete gets a deterministic 2–4 item mix. Types rotate by seed so the
// feed feels varied. Copy is intentionally generic placeholder text.
const ROTATION: FeedType[][] = [
  ["drop", "exclusive", "camp", "photoshoot"],
  ["photoshoot", "update", "drop", "event"],
  ["camp", "drop", "exclusive", "update"],
  ["update", "photoshoot", "event", "drop"],
];

function feedCopy(type: FeedType, first: string): { headline: string; body: string; cta: string } {
  switch (type) {
    case "drop":
      return { headline: `${first} World — Game Day Collection`, body: "New drop landing soon. Members get first access.", cta: "Preview Drop" };
    case "exclusive":
      return { headline: "Inside the Offseason", body: "Behind-the-scenes training, access members only.", cta: "Watch" };
    case "camp":
      return { headline: `${first} Youth Football Camp`, body: "Registration opening soon — Access members get in 24 hours early.", cta: "View Camp" };
    case "update":
      return { headline: `From ${first}`, body: "A quick note to the fans ahead of the season.", cta: "Read More" };
    case "photoshoot":
      return { headline: "New Content — Behind the Shoot", body: "Behind the scenes from the latest photoshoot.", cta: "View Gallery" };
    case "event":
      return { headline: "Meet + Greet", body: "Subscribers get early registration.", cta: "View Event" };
    case "article":
      return { headline: `From the Farm: ${first}'s Week`, body: "An original Goat Farm story.", cta: "Read Story" };
  }
}

export function demoFeedForAthlete(a: AthleteSeed): FeedItem[] {
  const seed = hash(a.slug);
  const types = ROTATION[seed % ROTATION.length];
  const count = 2 + (seed % 3); // 2–4 items
  return types.slice(0, count).map((type, i) => {
    const c = feedCopy(type, a.first);
    const access = type === "exclusive" ? "subscribers" : type === "event" ? "subscribers" : "followers";
    return {
      id: `demo-feed-${a.slug}-${i}`,
      athleteId: a.id,
      athleteSlug: a.slug,
      type,
      headline: c.headline,
      body: c.body,
      cta: c.cta,
      accessLevel: access as FeedItem["accessLevel"],
      publishedOffsetHours: (hash(a.slug + type) % 96) + i, // within ~4 days
      campId: type === "camp" ? `demo-camp-${a.slug}` : undefined,
      demo: true,
    };
  });
}

export function demoFeed(athletes: AthleteSeed[]): FeedItem[] {
  return athletes
    .flatMap((a) => demoFeedForAthlete(a))
    .sort((x, y) => x.publishedOffsetHours - y.publishedOffsetHours);
}

export function demoCampForAthlete(a: AthleteSeed): Camp {
  const seed = hash(a.slug + "camp");
  return {
    id: `demo-camp-${a.slug}`,
    athleteId: a.id,
    athleteSlug: a.slug,
    name: `${a.first} Youth Football Camp`,
    city: pick(DEMO_CITIES, seed),
    dateOffsetDays: 20 + (seed % 90),
    regOpensOffsetDays: (seed % 10) - 3, // some already open
    accessEarlyHours: 24,
    demo: true,
  };
}

export function demoCamps(athletes: AthleteSeed[]): Camp[] {
  return athletes.map(demoCampForAthlete).sort((x, y) => x.dateOffsetDays - y.dateOffsetDays);
}

const ARTICLE_KICKERS = ["From the Farm", "Behind the Athlete", "Off the Field", "Game Week", "The Drop"];

export function demoArticlesForAthlete(a: AthleteSeed): Article[] {
  const seed = hash(a.slug + "story");
  return [
    {
      id: `demo-article-${a.slug}`,
      athleteId: a.id,
      athleteSlug: a.slug,
      kicker: pick(ARTICLE_KICKERS, seed),
      title: `Inside the offseason with ${a.first}`,
      excerpt: "An original Goat Farm editorial feature. Placeholder content for layout.",
      publishedOffsetHours: (seed % 120) + 6,
      demo: true,
    },
  ];
}

export function demoArticles(athletes: AthleteSeed[]): Article[] {
  return athletes.flatMap(demoArticlesForAthlete).sort((x, y) => x.publishedOffsetHours - y.publishedOffsetHours);
}

/** Turn a relative hour offset into a friendly "3h ago" / "2d ago" string. */
export function agoLabel(offsetHours: number): string {
  if (offsetHours < 1) return "just now";
  if (offsetHours < 24) return `${Math.round(offsetHours)}h ago`;
  const d = Math.round(offsetHours / 24);
  return `${d}d ago`;
}

/** Friendly future date for camps, computed at render time. */
export function inDaysLabel(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
