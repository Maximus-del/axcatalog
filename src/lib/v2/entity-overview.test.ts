import { describe, expect, it } from "vitest";
import { identityLine, orderTone, preview, relativeTime, sinceLabel, statTiles } from "./entity-overview";
import { ORDER_STATUSES, STATUS_LABEL } from "@/lib/order-status";

describe("three previews and a counter", () => {
  it("shows three and counts the rest", () => {
    const p = preview([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p.shown).toEqual([1, 2, 3]);
    expect(p.remaining).toBe(7);
  });

  it("produces no counter tile when everything fits", () => {
    expect(preview([1, 2, 3]).remaining).toBe(0);
    expect(preview([1]).remaining).toBe(0);
  });

  it("handles an empty library without a negative count", () => {
    const p = preview([]);
    expect(p.shown).toEqual([]);
    expect(p.remaining).toBe(0);
  });
});

describe("relative time", () => {
  const now = new Date("2026-05-10T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("reads in hours for today", () => {
    expect(relativeTime(ago(2 * 3600_000), now)).toBe("2h ago");
  });

  it("reads in minutes for the last hour", () => {
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5m ago");
  });

  it("says just now rather than 0m ago", () => {
    expect(relativeTime(ago(3_000), now)).toBe("just now");
  });

  it("reads in days up to a week", () => {
    expect(relativeTime(ago(24 * 3600_000), now)).toBe("1d ago");
    expect(relativeTime(ago(7 * 24 * 3600_000), now)).toBe("7d ago");
  });

  it("switches to a date past a week, because nobody converts 38d", () => {
    expect(relativeTime(ago(38 * 24 * 3600_000), now)).toMatch(/2026/);
  });

  it("is empty rather than 'Invalid Date' for a missing or broken timestamp", () => {
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime("not a date", now)).toBe("");
  });

  it("does not render a negative age from a clock skew", () => {
    expect(relativeTime(new Date(now.getTime() + 60_000).toISOString(), now)).toBe("just now");
  });
});

describe("AX since", () => {
  it("gives a month and a year", () => {
    expect(sinceLabel("2026-04-16T00:00:00Z")).toMatch(/2026/);
  });

  it("is empty when there is no date to show", () => {
    expect(sinceLabel(null)).toBe("");
    expect(sinceLabel("nonsense")).toBe("");
  });
});

describe("the identity line", () => {
  it("reads club, position, league", () => {
    expect(identityLine({ teamName: "Atlanta Falcons", position: "WR", league: "NFL" })).toEqual([
      "Atlanta Falcons",
      "WR",
      "NFL",
    ]);
  });

  it("drops the parts an entity does not have instead of leaving empty separators", () => {
    expect(identityLine({ teamName: null, position: null, league: "NFL" })).toEqual(["NFL"]);
    expect(identityLine({})).toEqual([]);
  });

  it("treats a blank string as absent", () => {
    expect(identityLine({ teamName: "   ", position: "WR" })).toEqual(["WR"]);
  });
});

describe("the stat strip", () => {
  const counts = { designs: 34, concepts: 10, products: 36, collections: 3, liveProducts: 13 };
  const money = (n: number | null) => `$${(n ?? 0).toFixed(2)}`;
  const build = (orders: { ytdTotal: number; ytdCount: number; ytdUnpriced: number }) =>
    statTiles({ counts, orders, libraryHref: (s) => `/lib#${s}`, ordersHref: "/orders", money });

  it("shows the six numbers in pipeline order", () => {
    expect(build({ ytdTotal: 0, ytdCount: 0, ytdUnpriced: 0 }).map((t) => t.label)).toEqual([
      "Designs",
      "Mockups",
      "Products",
      "Collections",
      "Live",
      "Orders (YTD)",
    ]);
  });

  it("sends every tile somewhere", () => {
    for (const tile of build({ ytdTotal: 0, ytdCount: 0, ytdUnpriced: 0 })) expect(tile.to).toBeTruthy();
  });

  it("shows the money when the orders carry prices", () => {
    const tile = build({ ytdTotal: 42250, ytdCount: 4, ytdUnpriced: 0 }).find((t) => t.key === "orders");
    expect(tile?.value).toBe("$42250.00");
  });

  it("refuses to report $0.00 for an athlete whose orders were never priced", () => {
    const tile = build({ ytdTotal: 0, ytdCount: 2, ytdUnpriced: 2 }).find((t) => t.key === "orders");
    expect(tile?.value).toBe("—");
    expect(tile?.note).toMatch(/before prices were recorded/);
  });

  it("still shows a real zero when there were genuinely no orders", () => {
    const tile = build({ ytdTotal: 0, ytdCount: 0, ytdUnpriced: 0 }).find((t) => t.key === "orders");
    expect(tile?.value).toBe("$0.00");
    expect(tile?.note).toMatch(/No orders/);
  });

  it("shows the total when only some orders are unpriced, and says so", () => {
    const tile = build({ ytdTotal: 900, ytdCount: 3, ytdUnpriced: 1 }).find((t) => t.key === "orders");
    expect(tile?.value).toBe("$900.00");
    expect(tile?.note).toMatch(/1 raised before/);
  });
});

describe("order status colour", () => {
  it("has a tone for every status the lifecycle can be in", () => {
    for (const s of ORDER_STATUSES) expect(orderTone(s)).toMatch(/^--ax-/);
  });

  it("falls back rather than rendering an empty custom property", () => {
    expect(orderTone("something_new")).toBe("--ax-faint");
  });

  it("keeps its labels in step with V1, which owns them", () => {
    expect(STATUS_LABEL.shipped).toBe("Shipped");
    expect(STATUS_LABEL.in_production).toBe("In Production");
    expect(STATUS_LABEL.acknowledged).toBe("Acknowledged");
    expect(STATUS_LABEL.completed).toBe("Completed");
  });
});
