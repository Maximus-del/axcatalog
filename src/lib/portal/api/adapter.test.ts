import { describe, expect, it } from "vitest";
import { formatMoney, money, sumMoney, toApiError, toMinor } from "./money";
import { lastMonths, monthKeys, zonedMidnightUtc } from "./period";
import { parseRevenue, summaryFrom } from "./summary";
import { destinationHref, toDestination, type CollectionRow } from "./destinations";
import { filterProducts, isOrderable, toContractProduct } from "./products";

describe("money", () => {
  it("converts decimal strings without float drift", () => {
    expect(toMinor("19.99")).toBe(1999);
    expect(toMinor("2500.00")).toBe(250000);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor("1,234.5")).toBe(123450);
    expect(toMinor("-90.00")).toBe(-9000);
    expect(toMinor("0.005")).toBe(1);
  });

  it("treats missing as unknown, not zero", () => {
    expect(toMinor(null)).toBeNull();
    expect(toMinor("")).toBeNull();
    expect(toMinor("abc")).toBeNull();
    expect(money(null)).toBeNull();
    expect(money("0")).toEqual({ amountMinor: 0, currency: "USD" });
  });

  it("never sums mixed currencies", () => {
    expect(sumMoney([money("1", "USD"), money("2", "USD")])).toEqual({ amountMinor: 300, currency: "USD" });
    expect(sumMoney([money("1", "USD"), money("2", "CAD")])).toBeNull();
    expect(sumMoney([null, null])).toBeNull();
  });

  it("formats whole dollars without cents and keeps cents when present", () => {
    expect(formatMoney(money("3000"))).toBe("$3,000");
    expect(formatMoney(money("2500"), { cents: true })).toBe("$2,500.00");
    expect(formatMoney(money("135.5"))).toBe("$135.50");
    expect(formatMoney(null)).toBe("—");
  });

  it("maps database errors to contract statuses, and hides existence", () => {
    expect(toApiError({ code: "P0002", message: "not found" }).status).toBe(404);
    expect(toApiError({ code: "P0002", message: "athlete 123 belongs to org 9" }).error.message).toBe("Not found.");
    expect(toApiError({ code: "28000" }).status).toBe(401);
    expect(toApiError({ code: "42501" }).status).toBe(403);
    expect(toApiError({ code: "P0409" }).status).toBe(409);
    expect(toApiError({ code: "22023", message: "bad zone" }).status).toBe(422);
    expect(toApiError({ code: "P0422", message: "x", details: '{"quantity":"Too many"}' }).error.fieldErrors).toEqual({ quantity: "Too many" });
    expect(toApiError({ code: "P0002" }).error.requestId).toMatch(/^pr_/);
  });
});

describe("period", () => {
  it("finds local midnight across DST in Los Angeles", () => {
    // PST (UTC-8) in January, PDT (UTC-7) in July.
    expect(zonedMidnightUtc(2026, 1, 1, "America/Los_Angeles").toISOString()).toBe("2026-01-01T08:00:00.000Z");
    expect(zonedMidnightUtc(2026, 7, 1, "America/Los_Angeles").toISOString()).toBe("2026-07-01T07:00:00.000Z");
    // DST starts 2026-03-08; midnight that day is still PST.
    expect(zonedMidnightUtc(2026, 3, 8, "America/Los_Angeles").toISOString()).toBe("2026-03-08T08:00:00.000Z");
    expect(zonedMidnightUtc(2026, 3, 9, "America/Los_Angeles").toISOString()).toBe("2026-03-09T07:00:00.000Z");
  });

  it("builds a [from,to) 12-month window in the viewer's zone", () => {
    const now = new Date("2026-10-15T05:30:00Z"); // still Oct 14 in LA
    const p = lastMonths(12, "America/Los_Angeles", now);
    expect(p.from).toBe("2025-11-01T07:00:00.000Z");
    expect(p.to).toBe("2026-11-01T07:00:00.000Z");
    expect(monthKeys(p)).toHaveLength(12);
    expect(monthKeys(p)[0]).toBe("2025-11");
    expect(monthKeys(p)[11]).toBe("2026-10");
  });

  it("the same instant is a different month in UTC near the boundary", () => {
    const now = new Date("2026-11-01T03:00:00Z"); // Oct 31 in LA, Nov 1 in UTC
    expect(monthKeys(lastMonths(1, "America/Los_Angeles", now))).toEqual(["2026-10"]);
    expect(monthKeys(lastMonths(1, "UTC", now))).toEqual(["2026-11"]);
  });

  it("falls back to UTC for an unknown zone rather than throwing", () => {
    expect(lastMonths(1, "Mars/Olympus", new Date("2026-05-10T00:00:00Z")).timeZone).toBe("UTC");
  });
});

// Shaped like the live function's output for Darnell Mooney on 2026-10-15.
const LIVE_LIKE = {
  attributable: true,
  currency: "USD",
  currencies: ["USD"],
  as_of: "2026-09-04T00:00:00Z",
  basis_note: "gross = …",
  lifetime: { gross: 3000.0, refund_flagged: 460.0, orders: 31, units: 60, refund_flagged_orders: 8 },
  period: { gross: 135.0, refund_flagged: 135.0, orders: 2 },
  monthly: [
    { month: "2026-03", gross: 45.0, refund_flagged: 45.0 },
    { month: "2026-04", gross: 90.0, refund_flagged: 90.0 },
  ],
  top_products: [{ title: "Mooney World Hoodie", units: 2, gross: 90.0 }],
};
const PERIOD = lastMonths(12, "America/Los_Angeles", new Date("2026-10-15T05:30:00Z"));

describe("revenue + summary", () => {
  it("parses the live shape, filling zero months", () => {
    const r = parseRevenue(LIVE_LIKE, PERIOD);
    expect(r.lifetime?.gross).toEqual({ amountMinor: 300000, currency: "USD" });
    expect(r.lifetime?.refundFlagged).toEqual({ amountMinor: 46000, currency: "USD" });
    expect(r.lifetime?.orders).toBe(31);
    expect(r.monthly).toHaveLength(12);
    expect(r.monthly.find((m) => m.month === "2026-04")?.gross?.amountMinor).toBe(9000);
    expect(r.monthly.find((m) => m.month === "2026-01")?.gross?.amountMinor).toBe(0);
  });

  it("lifetime and period are separate scopes and are not reconciled", () => {
    const s = summaryFrom({
      revenue: parseRevenue(LIVE_LIKE, PERIOD),
      credit: money("2500.00"),
      live: 20,
      community: { followers: 1, access: 0, vip: 0 },
      period: PERIOD,
    });
    expect(s.lifetimeRevenue?.amountMinor).toBe(300000);
    expect(s.attributedRevenue?.amountMinor).toBe(13500);
    expect(s.ordersCount).toBe(31);
    expect(s.creditBalance?.amountMinor).toBe(250000);
    expect(s.revenueBasis).toBe("gross");
    expect(s.refundFlaggedRevenue?.amountMinor).toBe(46000);
    expect(s.asOf).toBe("2026-09-04T00:00:00Z");
    expect(s.period.timeZone).toBe("America/Los_Angeles");
  });

  it("a shared organisation yields null revenue, never another entity's number", () => {
    const s = summaryFrom({
      revenue: parseRevenue({ attributable: false, reason: "shared_organization" }, PERIOD),
      credit: money("10"),
      live: 3,
      community: { followers: null, access: null, vip: null },
      period: PERIOD,
    });
    expect(s.revenueAttributable).toBe(false);
    expect(s.lifetimeRevenue).toBeNull();
    expect(s.attributedRevenue).toBeNull();
    expect(s.ordersCount).toBeNull();
    expect(s.creditBalance?.amountMinor).toBe(1000);
  });

  it("server function not deployed → revenue unknown (null), not $0", () => {
    const s = summaryFrom({ revenue: null, credit: null, live: null, community: { followers: null, access: null, vip: null }, period: PERIOD });
    expect(s.lifetimeRevenue).toBeNull();
    expect(s.creditBalance).toBeNull();
    expect(s.liveProductsCount).toBeNull();
  });

  it("mixed currencies → money fields null rather than a wrong sum", () => {
    const r = parseRevenue({ ...LIVE_LIKE, currency: null, currencies: ["USD", "CAD"] }, PERIOD);
    expect(r.lifetime?.gross).toBeNull();
    expect(r.lifetime?.orders).toBe(31);
  });
});

const row = (over: Partial<CollectionRow>): CollectionRow => ({
  id: "c1",
  name: "Darnell Mooney x Falcons",
  slug: "darnell-mooney-falcons",
  status: "active",
  athlete_id: "a",
  metadata: {},
  team: { name: "Atlanta Falcons", city: "Atlanta", primary_color: "#A71930" },
  ...over,
});

describe("destinations", () => {
  it("uses the configured key, label, jersey, accent and art", () => {
    const d = toDestination(
      row({ metadata: { portal_destination: { key: "atlanta", label: "Atlanta", jersey_number: 1, accent: "#EF233C", image: "/mooney/assets/atlanta-1.png" } } }),
      7,
    )!;
    expect(d).toMatchObject({ id: "atlanta", label: "Atlanta", jerseyNumber: 1, accent: "#EF233C", image: "/mooney/assets/atlanta-1.png", href: "/portal/gear?collection=atlanta", productCount: 7, teamName: "Atlanta Falcons" });
  });

  it("falls back to the team city and colour, and no art, when unconfigured", () => {
    const d = toDestination(row({}), 0)!;
    expect(d.id).toBe("darnell-mooney-falcons");
    expect(d.label).toBe("Atlanta");
    expect(d.accent).toBe("#A71930");
    expect(d.image).toBeNull();
    expect(d.jerseyNumber).toBeNull();
  });

  it("rejects unsafe or malformed config values", () => {
    const d = toDestination(row({ metadata: { portal_destination: { image: "javascript:alert(1)", accent: "red", jersey_number: 250 } } }), 0)!;
    expect(d.image).toBeNull();
    expect(d.accent).toBe("#A71930");
    expect(d.jerseyNumber).toBeNull();
  });

  it("a collection with no team uses its own name", () => {
    expect(toDestination(row({ team: null, name: "Mooney World" }), 2)!.label).toBe("Mooney World");
  });

  it("hidden destinations are dropped", () => {
    expect(toDestination(row({ metadata: { portal_destination: { hidden: true } } }), 1)).toBeNull();
  });

  it("encodes the key in the href", () => {
    expect(destinationHref("moon's house")).toBe("/portal/gear?collection=moon's%20house");
  });
});

describe("live vs archive", () => {
  const base = {
    id: "p", title: "Tee", slug: "tee", status: "published", product_type: "tee", shopify_handle: null, blank_id: null,
    primary_image_url: null, images: [], price: null, wholesale_price: null, athlete_unit_price: null,
    variants: [{ id: "v", color: "Black", size: "L", available: false }], sizes: [], colors: [], created_at: "",
  } as unknown as Parameters<typeof toContractProduct>[0];

  it("labels by store status, never by the client's hide", () => {
    expect(toContractProduct(base, [], false).lifecycle).toBe("live");
    expect(toContractProduct({ ...base, status: "archived" }, [], true).lifecycle).toBe("archive");
    expect(toContractProduct({ ...base, status: "internal" }, [], false).lifecycle).toBe("live");
  });

  it("keeps archived products orderable even when Shopify says sold out", () => {
    expect(isOrderable({ ...base, status: "published" })).toBe(false);
    expect(isOrderable({ ...base, status: "archived" })).toBe(true);
    expect(isOrderable({ ...base, status: "draft" })).toBe(false);
  });

  it("filters the Live and Archive tabs, live by default", () => {
    const live = toContractProduct(base, ["atlanta"], false);
    const arch = toContractProduct({ ...base, id: "a", status: "archived" }, ["atlanta"], false);
    expect(filterProducts([live, arch]).map((p) => p.id)).toEqual(["p"]);
    expect(filterProducts([live, arch], { lifecycle: "archive" }).map((p) => p.id)).toEqual(["a"]);
    expect(filterProducts([live, arch], { lifecycle: "all", collection: "atlanta" })).toHaveLength(2);
  });
});
