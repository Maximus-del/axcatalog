// Brand HQ charts that the order history can answer: orders and units per
// month. Pure, so the month bucketing is tested rather than eyeballed.

export interface MonthPoint {
  /** "2026-10" */
  month: string;
  value: number;
}

export function lastMonths(count: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Orders (or units) per month over the last `count` months, oldest first; months with none are 0. */
export function perMonth(
  orders: Array<{ createdAt: string; units: number; status?: string }>,
  count: number,
  measure: "orders" | "units",
  now = new Date(),
): MonthPoint[] {
  const months = lastMonths(count, now);
  const totals = new Map(months.map((m) => [m, 0]));
  for (const o of orders) {
    if (o.status === "cancelled" || o.status === "canceled") continue;
    const d = new Date(o.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!totals.has(key)) continue;
    totals.set(key, (totals.get(key) ?? 0) + (measure === "orders" ? 1 : Math.max(0, o.units || 0)));
  }
  return months.map((m) => ({ month: m, value: totals.get(m) ?? 0 }));
}
