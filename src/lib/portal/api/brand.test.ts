import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: { from: (b: string) => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${b}/${p}` } }) }) },
  },
}));

import { analyticsFrom, assetDownload, assetUrl, matchTopProducts, toDrop, toMediaAsset, toProfile } from "./brand";
import { parseRevenue } from "./summary";
import { lastMonths } from "./period";

describe("content library", () => {
  it("public buckets become public URLs; private ones are never guessed", () => {
    expect(assetUrl("product-images", "m/front.png", null)).toBe("https://cdn.test/product-images/m/front.png");
    expect(assetUrl("external", "https://shopify.cdn/x.png", null)).toBe("https://shopify.cdn/x.png");
    expect(assetUrl(null, null, "https://cdn.example/ep1.jpg")).toBe("https://cdn.example/ep1.jpg");
    expect(assetUrl("design-files", "secret/art.png", null)).toBeNull();
    expect(assetUrl("mockups", "x.png", null)).toBeNull();
    expect(assetUrl(null, null, "javascript:alert(1)")).toBeNull();
  });
  it("maps a row and its download", () => {
    const a = toMediaAsset({ id: "pi_1", title: "The 1 Hoodie", kind: "product", bucket: "product-images", path: "m/f.png", product_id: "p1", approved: true });
    expect(a).toMatchObject({ id: "pi_1", kind: "product", productId: "p1", approved: true });
    expect(assetDownload(a)).toEqual({ url: "https://cdn.test/product-images/m/f.png", expiresAt: null });
    expect(assetDownload({ ...a, downloadUrl: null })).toBeNull();
  });
});

describe("drops", () => {
  it("keeps the version to send back and whether it can be edited", () => {
    const d = toDrop({ id: "d", title: "Fall Drop", status: "live", scheduledAt: "2026-08-18T00:38:51Z", timeZone: "UTC", destinationId: "moons-house", version: "2026-08-14T17:51:39Z", editable: false });
    expect(d).toMatchObject({ status: "live", destinationId: "moons-house", editable: false, version: "2026-08-14T17:51:39Z" });
  });
});

describe("analytics", () => {
  const period = lastMonths(12, "America/Los_Angeles", new Date("2026-10-15T05:30:00Z"));
  const report = parseRevenue(
    { attributable: true, currency: "USD", as_of: "2026-09-04T00:00:00Z", lifetime: { gross: 3000, orders: 31 }, period: { gross: 135, orders: 2 },
      monthly: [{ month: "2026-04", gross: 90 }], top_products: [{ title: "Mooney World Hoodie", units: 2, gross: 90 }] },
    period,
  );
  const dests = [{ id: "atlanta" }, { id: "chicago" }, { id: "new-york" }] as never[];
  it("per-city revenue is null, never a split of the total", () => {
    const a = analyticsFrom(report, dests, [], period);
    expect(a.byDestination).toEqual([
      { destinationId: "atlanta", value: null },
      { destinationId: "chicago", value: null },
      { destinationId: "new-york", value: null },
    ]);
    expect(a.attributedRevenue?.amountMinor).toBe(13500);
    expect(a.monthly).toHaveLength(12);
    expect(a.topProducts[0].title).toBe("Mooney World Hoodie");
  });
  it("revenue unknown → nothing pretends to be zero", () => {
    const a = analyticsFrom(null, dests, [], period);
    expect(a.attributedRevenue).toBeNull();
    expect(a.monthly).toEqual([]);
  });
});

describe("profile", () => {
  it("referral appears only when AX approved one, and has no invented URL", () => {
    const p = toProfile({ id: "a", name: "Darnell Mooney", referral: { code: "MOONEY10", buyerDiscountPercent: 10, url: null } }, 3000);
    expect(p.referral).toEqual({ code: "MOONEY10", buyerDiscountPercent: 10, url: null });
    expect(toProfile({ id: "a", name: "x", referral: null }, null).referral).toBeNull();
  });
  it("progression comes from the existing tier ladder when lifetime is known", () => {
    expect(toProfile({ id: "a", name: "x" }, 3000).progression?.label).toBeTruthy();
    expect(toProfile({ id: "a", name: "x" }, null).progression).toBeNull();
  });
});

describe("top sellers get the client's own product photo", () => {
  const catalog = [
    { id: "p1", title: "Mooney World “WRLD” Hoodie", image: "https://img/p1.png" },
    { id: "p2", title: "The 1 Tee", image: null },
    { id: "p3", title: "Twin", image: "https://img/a.png" },
    { id: "p4", title: "twin", image: "https://img/b.png" },
  ];
  it("matches by title ignoring case, curly quotes and spacing", () => {
    const [a] = matchTopProducts([{ title: 'mooney world "WRLD"  hoodie', units: 3 }], catalog);
    expect(a.productId).toBe("p1");
    expect(a.imageUrl).toBe("https://img/p1.png");
  });
  it("gives no picture rather than a guess", () => {
    const [none, twin] = matchTopProducts([{ title: "Unknown", units: 1 }, { title: "Twin", units: 1 }], catalog);
    expect(none.productId).toBeNull();
    expect(twin.productId).toBeNull();
  });
});
