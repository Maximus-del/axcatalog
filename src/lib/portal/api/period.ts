// Reporting windows: [from, to) in an explicit IANA time zone.
//
// A "last 12 months" window for someone in Los Angeles starts at local midnight
// there, which is 07:00 or 08:00 UTC depending on daylight saving. Getting
// this wrong moves an order across a month — the April 1 order at 06:30 UTC is
// March 31 in Los Angeles. The server buckets in the same zone, so the chart and
// the totals agree.

export interface Period {
  /** Inclusive start, ISO 8601 UTC. */
  from: string;
  /** Exclusive end, ISO 8601 UTC. */
  to: string;
  timeZone: string;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Offset of `tz` from UTC at instant `at`, in minutes (LA in summer → -420). */
function offsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The UTC instant of local midnight on `y-m-d` in `tz`. Correct across DST changes. */
export function zonedMidnightUtc(year: number, month1: number, day: number, tz: string): Date {
  const guess = Date.UTC(year, month1 - 1, day);
  // Two passes: the offset at the guess can differ from the offset at the answer
  // when midnight sits next to a DST transition.
  let t = guess - offsetMinutes(tz, new Date(guess)) * 60000;
  t = guess - offsetMinutes(tz, new Date(t)) * 60000;
  return new Date(t);
}

/** Calendar parts of instant `at` as seen in `tz`. */
function localParts(at: Date, tz: string): { year: number; month1: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month1: get("month"), day: get("day") };
}

/**
 * The last `months` whole calendar months up to and including the current one,
 * in `tz`: [first day of month (n-1) ago, first day of next month).
 */
export function lastMonths(months: number, tz: string, now: Date = new Date()): Period {
  const zone = isValidTimeZone(tz) ? tz : "UTC";
  const { year, month1 } = localParts(now, zone);
  const startIndex = year * 12 + (month1 - 1) - (months - 1);
  const endIndex = year * 12 + month1; // next month
  const from = zonedMidnightUtc(Math.floor(startIndex / 12), (startIndex % 12) + 1, 1, zone);
  const to = zonedMidnightUtc(Math.floor(endIndex / 12), (endIndex % 12) + 1, 1, zone);
  return { from: from.toISOString(), to: to.toISOString(), timeZone: zone };
}

/** `YYYY-MM` keys for every month in the period, oldest first — zero months included. */
export function monthKeys(period: Period): string[] {
  const out: string[] = [];
  const start = localParts(new Date(period.from), period.timeZone);
  // `to` is exclusive: step back a millisecond to land in the last included month.
  const end = localParts(new Date(new Date(period.to).getTime() - 1), period.timeZone);
  let i = start.year * 12 + (start.month1 - 1);
  const last = end.year * 12 + (end.month1 - 1);
  while (i <= last && out.length < 240) {
    out.push(`${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);
    i += 1;
  }
  return out;
}
