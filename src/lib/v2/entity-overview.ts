// AX OS V2 — the athlete overview's arithmetic.
//
// The page answers one question: what is happening with this athlete right now,
// and what do I need to work on? That means it shows a FEW of each thing and a
// count of the rest — never the whole library, which is what the library is
// for.
//
// All of it is pure so the counting and the truncation are testable without
// mounting a page. The page itself only arranges what this returns.

/** How many previews each dashboard card shows before it starts counting. */
export const PREVIEW_COUNT = 3;

export interface Preview<T> {
  /** The items to render as tiles. */
  shown: T[];
  /** How many did not fit. Zero means no "+N" tile. */
  remaining: number;
}

/**
 * The three-plus-a-counter pattern every card on this page uses.
 *
 * The counter tile is only produced when something is actually left over: a
 * "+0" tile is a dead square that teaches the operator the grid has four slots
 * when it has three.
 */
export function preview<T>(items: T[], count = PREVIEW_COUNT): Preview<T> {
  const shown = items.slice(0, count);
  return { shown, remaining: Math.max(0, items.length - shown.length) };
}

/**
 * "2h ago".
 *
 * Deliberately coarse. On this page the difference between 94 and 96 minutes
 * is noise; the question being asked is "is this from today or from last
 * month". Anything older than a week gets its date instead, because "38d ago"
 * is a number nobody converts.
 */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const seconds = Math.round((now.getTime() - then) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** "AX since Apr 2026". Empty when the record has no date, rather than "Invalid Date". */
export function sinceLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/**
 * The line under the athlete's name: club, position, league, status.
 *
 * Built by filtering rather than by template, so a partner with no league and
 * no position reads "Active" instead of "· · Active".
 */
export function identityLine(entity: {
  teamName?: string | null;
  position?: string | null;
  league?: string | null;
}): string[] {
  return [entity.teamName, entity.position, entity.league].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
}

export interface StatTile {
  key: string;
  label: string;
  value: string;
  /** A CSS custom-property name from the AX palette. */
  tone: string;
  to: string;
  /** Shown on hover when the headline number needs a caveat. */
  note?: string;
}

/**
 * The six numbers across the top.
 *
 * `Orders (YTD)` is the one that can lie. Every bulk order raised before the
 * cart existed has a zero subtotal because nothing ever wrote one, so summing
 * them produces a confident $0.00 for an athlete who has ordered twice. When
 * nothing in range carries a price the tile shows an em dash and says why on
 * hover — the same call V2 already makes for unpriced blanks.
 */
export function statTiles(input: {
  counts: { designs: number; concepts: number; products: number; collections: number; liveProducts: number };
  orders: { ytdTotal: number; ytdCount: number; ytdUnpriced: number };
  libraryHref: (section: string) => string;
  ordersHref: string;
  money: (n: number | null) => string;
}): StatTile[] {
  const { counts, orders, libraryHref, ordersHref, money } = input;

  const ordersValue =
    orders.ytdCount === 0
      ? money(0)
      : orders.ytdUnpriced === orders.ytdCount
        ? "—"
        : money(orders.ytdTotal);

  const ordersNote =
    orders.ytdCount === 0
      ? "No orders raised this year."
      : orders.ytdUnpriced === 0
        ? `${orders.ytdCount} orders this year.`
        : `${orders.ytdCount} orders this year, ${orders.ytdUnpriced} raised before prices were recorded.`;

  return [
    { key: "designs", label: "Designs", value: String(counts.designs), tone: "--ax-accent", to: libraryHref("designs") },
    { key: "mockups", label: "Mockups", value: String(counts.concepts), tone: "--ax-blue", to: libraryHref("mockups") },
    { key: "products", label: "Products", value: String(counts.products), tone: "--ax-violet", to: libraryHref("products") },
    { key: "collections", label: "Collections", value: String(counts.collections), tone: "--ax-amber", to: libraryHref("collections") },
    { key: "live", label: "Live", value: String(counts.liveProducts), tone: "--ax-accent", to: libraryHref("live") },
    { key: "orders", label: "Orders (YTD)", value: ordersValue, tone: "--ax-faint", to: ordersHref, note: ordersNote },
  ];
}

/**
 * Order status pills, in V2's palette.
 *
 * The labels come from lib/order-status so V1 and V2 cannot describe the same
 * row differently; only the colour is decided here, because V1's badge classes
 * are written against V1's tokens and this page renders inside `.admin-os`.
 *
 * `draft` has an entry so the map is total, but a draft never reaches this
 * page: an athlete's order list excludes carts.
 */
export const ORDER_TONE: Record<string, string> = {
  draft: "--ax-faint",
  submitted: "--ax-blue",
  acknowledged: "--ax-amber",
  in_production: "--ax-blue",
  ready: "--ax-violet",
  shipped: "--ax-accent",
  completed: "--ax-secondary",
  cancelled: "--ax-red",
};

export function orderTone(status: string): string {
  return ORDER_TONE[status] ?? "--ax-faint";
}
