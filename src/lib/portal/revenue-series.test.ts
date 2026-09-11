import { describe, expect, it } from "vitest";
import {
  axisMoney,
  exactMoney,
  hasRevenue,
  monthlyRevenue,
  seriesTotal,
  type RevenueLine,
} from "./revenue-series";

const NOW = new Date("2026-09-11T12:00:00Z");

function line(orderDate: string | null, lineTotal: number): RevenueLine {
  return { orderDate, lineTotal };
}

describe("monthlyRevenue", () => {
  it("returns the requested window, oldest first, ending on the current month", () => {
    const pts = monthlyRevenue([], { months: 12, now: NOW });
    expect(pts).toHaveLength(12);
    expect(pts[0].month).toBe("2025-10");
    expect(pts[11].month).toBe("2026-09");
  });

  it("sums line totals into their calendar month", () => {
    const pts = monthlyRevenue(
      [
        line("2026-09-01T00:00:00Z", 100),
        line("2026-09-28T23:00:00Z", 50.5),
        line("2026-08-15T00:00:00Z", 10),
      ],
      { months: 12, now: NOW },
    );
    expect(pts.find((p) => p.month === "2026-09")?.revenue).toBe(150.5);
    expect(pts.find((p) => p.month === "2026-08")?.revenue).toBe(10);
  });

  it("keeps months with no orders as real zeros", () => {
    const pts = monthlyRevenue([line("2026-09-01T00:00:00Z", 100)], { months: 3, now: NOW });
    expect(pts.map((p) => p.revenue)).toEqual([0, 0, 100]);
  });

  it("nets refunds out rather than counting them as sales", () => {
    const pts = monthlyRevenue(
      [line("2026-09-02T00:00:00Z", 200), line("2026-09-09T00:00:00Z", -75)],
      { months: 1, now: NOW },
    );
    expect(pts[0].revenue).toBe(125);
  });

  it("drops orders outside the window instead of folding them into an edge month", () => {
    const pts = monthlyRevenue(
      [line("2020-01-01T00:00:00Z", 9999), line("2026-09-01T00:00:00Z", 10)],
      { months: 3, now: NOW },
    );
    expect(seriesTotal(pts)).toBe(10);
  });

  it("buckets in UTC so the month does not depend on who is looking", () => {
    // 23:30 UTC on the last day of August is already September in +02:00.
    const pts = monthlyRevenue([line("2026-08-31T23:30:00Z", 40)], { months: 3, now: NOW });
    expect(pts.find((p) => p.month === "2026-08")?.revenue).toBe(40);
    expect(pts.find((p) => p.month === "2026-09")?.revenue).toBe(0);
  });

  it("ignores null and unparseable dates rather than crashing or bucketing them at the epoch", () => {
    const pts = monthlyRevenue(
      [line(null, 500), line("not-a-date", 500), line("2026-09-01T00:00:00Z", 25)],
      { months: 12, now: NOW },
    );
    expect(seriesTotal(pts)).toBe(25);
  });

  it("crosses a year boundary correctly and marks January with its year", () => {
    const pts = monthlyRevenue([], { months: 12, now: new Date("2026-02-05T00:00:00Z") });
    expect(pts[0].month).toBe("2025-03");
    const jan = pts.find((p) => p.month === "2026-01");
    expect(jan?.label).toBe("Jan 26");
    expect(pts.find((p) => p.month === "2025-12")?.label).toBe("Dec");
  });

  it("rounds to cents", () => {
    const pts = monthlyRevenue(
      [line("2026-09-01T00:00:00Z", 0.1), line("2026-09-02T00:00:00Z", 0.2)],
      { months: 1, now: NOW },
    );
    expect(pts[0].revenue).toBe(0.3);
  });
});

describe("hasRevenue", () => {
  it("is false for an all-zero window — that gets an empty state, not a flat line", () => {
    expect(hasRevenue(monthlyRevenue([], { months: 12, now: NOW }))).toBe(false);
  });

  it("is true as soon as one month moved", () => {
    expect(hasRevenue(monthlyRevenue([line("2026-09-01T00:00:00Z", 1)], { months: 12, now: NOW }))).toBe(true);
  });

  it("is true for a window that only contains a refund", () => {
    expect(hasRevenue(monthlyRevenue([line("2026-09-01T00:00:00Z", -20)], { months: 3, now: NOW }))).toBe(true);
  });
});

describe("seriesTotal", () => {
  it("sums the window", () => {
    expect(seriesTotal(monthlyRevenue([line("2026-09-01T00:00:00Z", 10), line("2026-08-01T00:00:00Z", 5)], { months: 12, now: NOW }))).toBe(15);
  });

  it("is zero for an empty series", () => {
    expect(seriesTotal([])).toBe(0);
  });
});

describe("money formatting", () => {
  it("keeps axis ticks short", () => {
    expect(axisMoney(0)).toBe("$0");
    expect(axisMoney(940)).toBe("$940");
    expect(axisMoney(1200)).toBe("$1.2k");
    expect(axisMoney(23465)).toBe("$23k");
    expect(axisMoney(1_500_000)).toBe("$1.5m");
  });

  it("gives the tooltip the exact figure", () => {
    expect(exactMoney(1234.5)).toBe("$1,234.50");
    expect(exactMoney(0)).toBe("$0.00");
  });
});
