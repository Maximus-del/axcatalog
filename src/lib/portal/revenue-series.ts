// Monthly attributed revenue, derived from the order lines the portal already
// pages through.
//
// The chart this feeds used to render twelve bars of zero under the caption
// "Revenue data will appear here after Shopify sync" — a chart that both said
// nothing was there and drew a flat line at zero, which reads as "you sold
// nothing" rather than "nobody has asked the database". The orders have been
// there since 2023; only the dates were never selected.
//
// Pure on purpose: bucketing by month across time zones and DST is exactly the
// kind of thing that looks obvious and is wrong, so it is tested directly.

export interface RevenueLine {
  /** ISO timestamp from orders.order_date. */
  orderDate: string | null;
  /** order_line_items.line_total. Refunds arrive negative and net out. */
  lineTotal: number;
}

export interface RevenuePoint {
  /** Sort key, `YYYY-MM`. */
  month: string;
  /** Axis label, e.g. "Mar" — year appended in January to mark the boundary. */
  label: string;
  revenue: number;
}

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function key(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function labelFor(year: number, monthIndex: number): string {
  // A bare "Jan" in a rolling window is ambiguous about which year it belongs
  // to, and a 12-month window always spans two.
  return monthIndex === 0 ? `${MONTH_LABEL[0]} ${String(year).slice(2)}` : MONTH_LABEL[monthIndex];
}

/**
 * Revenue for each of the last `months` calendar months, oldest first.
 *
 * Months inside the window with no orders are real zeros and are kept — a gap
 * in trading is information. Months before the first order are inside the
 * window too and are also zero, which is honest for a rolling window.
 *
 * Dates are read in UTC. Order timestamps are stored with a zone, and bucketing
 * in the viewer's local zone would move an order across a month boundary
 * depending on who is looking at it.
 */
export function monthlyRevenue(
  lines: RevenueLine[],
  { months = 12, now = new Date() }: { months?: number; now?: Date } = {},
): RevenuePoint[] {
  const buckets = new Map<string, number>();
  for (const line of lines) {
    if (!line.orderDate) continue;
    const d = new Date(line.orderDate);
    if (Number.isNaN(d.getTime())) continue;
    const k = key(d.getUTCFullYear(), d.getUTCMonth());
    buckets.set(k, (buckets.get(k) ?? 0) + (Number(line.lineTotal) || 0));
  }

  const out: RevenuePoint[] = [];
  const endYear = now.getUTCFullYear();
  const endMonth = now.getUTCMonth();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(endYear, endMonth - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const k = key(y, m);
    out.push({
      month: k,
      label: labelFor(y, m),
      revenue: Math.round((buckets.get(k) ?? 0) * 100) / 100,
    });
  }
  return out;
}

export function seriesTotal(points: RevenuePoint[]): number {
  return Math.round(points.reduce((sum, p) => sum + p.revenue, 0) * 100) / 100;
}

/**
 * Whether there is anything worth drawing. A window of pure zeros gets an empty
 * state, not a flat line — a flat line at zero is a claim, and the wrong one
 * when the truth is "no orders in this window" or "nothing attributed yet".
 */
export function hasRevenue(points: RevenuePoint[]): boolean {
  return points.some((p) => p.revenue !== 0);
}

/** Compact money for an axis tick: 1200 -> "$1.2k". */
export function axisMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `$${Math.round(value)}`;
}

/** Exact money for a tooltip. */
export function exactMoney(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}
