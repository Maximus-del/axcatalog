import { describe, expect, it } from "vitest";
import {
  cartPermalink,
  cleanLockerSlug,
  imageUrl,
  inviteUrl,
  isLockerHost,
  lockerUrl,
  numericVariantId,
  onboardingSummary,
  parseLocker,
  parseMyRequests,
  parseOnboarding,
  pickVariant,
  sortSizes,
  suggestedRole,
  LOCKER_FALLBACK_ORIGIN,
} from "./invites";
import { canSeePath, navForRole, playsForRole, resolvePortalRole } from "./roles";

const SB = "https://x.supabase.co";

describe("addresses", () => {
  it("builds invite and locker links", () => {
    expect(inviteUrl("abc", "https://app.test/")).toBe("https://app.test/invite/abc");
    expect(lockerUrl("proactive")).toBe("https://lockers.athletexclusive.com/proactive");
    expect(lockerUrl("proactive", LOCKER_FALLBACK_ORIGIN)).toBe(`${LOCKER_FALLBACK_ORIGIN}/l/proactive`);
  });
  it("recognises the lockers host", () => {
    expect(isLockerHost("lockers.athletexclusive.com")).toBe(true);
    expect(isLockerHost("chase-dashboard-phi.vercel.app")).toBe(false);
  });
  it("cleans slugs", () => {
    expect(cleanLockerSlug("  Proactive Sports! ")).toBe("proactive-sports");
    expect(cleanLockerSlug("a")).toBeNull();
    expect(cleanLockerSlug("---")).toBeNull();
  });
});

describe("checkout", () => {
  it("reads gid and numeric variant ids", () => {
    expect(numericVariantId("gid://shopify/ProductVariant/44839473938622")).toBe("44839473938622");
    expect(numericVariantId("44839473938622")).toBe("44839473938622");
    expect(numericVariantId("Default")).toBeNull();
    expect(numericVariantId(null)).toBeNull();
  });
  it("merges lines, caps quantity, drops junk", () => {
    expect(
      cartPermalink(
        [
          { variantId: "111111", quantity: 1 },
          { variantId: "gid://shopify/ProductVariant/111111", quantity: 2 },
          { variantId: "222222", quantity: 150 },
          { variantId: "nope", quantity: 1 },
          { variantId: "333333", quantity: 0 },
        ],
        "https://shop.test",
      ),
    ).toBe("https://shop.test/cart/111111:3,222222:99");
  });
  it("returns null for an empty cart", () => {
    expect(cartPermalink([])).toBeNull();
  });
});

describe("onboarding", () => {
  it("parses untrusted answers defensively", () => {
    const a = parseOnboarding({ position: "coach", topSize: "L", bottomSize: "XXXXL", wants: ["order_gear", "hack", "order_gear"], notes: 5 });
    expect(a).toEqual({ position: "coach", topSize: "L", bottomSize: null, wants: ["order_gear"], notes: "" });
    expect(parseOnboarding(null)).toBeNull();
    expect(parseOnboarding({ position: "ceo" })?.position).toBe("other");
  });
  it("suggests Owner when the answers say so", () => {
    expect(suggestedRole(parseOnboarding({ position: "owner" }), "team")).toBe("owner");
    expect(suggestedRole(parseOnboarding({ position: "coach", wants: ["see_sales"] }), "team")).toBe("owner");
    expect(suggestedRole(parseOnboarding({ position: "coach" }), "team")).toBe("team");
    expect(suggestedRole(null, "owner")).toBe("owner");
  });
  it("summarises for the approval card", () => {
    expect(onboardingSummary(parseOnboarding({ position: "coach", topSize: "L", wants: ["order_gear"] }))).toBe("Coach / staff · Top L · wants Order team gear");
    expect(onboardingSummary(null)).toMatch(/hasn't answered/i);
  });
});

describe("public locker parsing", () => {
  const raw = {
    entity: { id: "e1", name: "Proactive", slug: "proactive", theme: {}, locker: {} },
    products: [
      {
        id: "p1",
        title: "Tee",
        price: "48.00",
        compareAt: null,
        handle: "tee",
        images: [
          { bucket: "product-images", path: "p1/a b.png", color: "Black" },
          { bucket: "external", path: "https://cdn.shopify.com/x.png" },
          { bucket: "external", path: "http://insecure/x.png" },
        ],
        variants: [
          { id: "44839473938622", size: "M", color: "black", available: false, price: 48 },
          { id: "not-a-variant", size: "L" },
        ],
      },
    ],
    collections: [
      { id: "c1", key: "strength", label: "Strength Club", images: ["/proactive/a.webp", "javascript:alert(1)"], productIds: ["p1", "ghost"] },
      { id: "c2", key: "empty", label: "Empty", images: [], productIds: ["ghost"] },
    ],
  };
  it("keeps only safe images, real variants and non-empty collections", () => {
    const l = parseLocker(raw, SB)!;
    expect(l.products[0].price).toBe(48);
    expect(l.products[0].images.map((i) => i.url)).toEqual([`${SB}/storage/v1/object/public/product-images/p1/a%20b.png`, "https://cdn.shopify.com/x.png"]);
    expect(l.products[0].variants).toHaveLength(1);
    expect(l.products[0].variants[0].available).toBe(false);
    expect(l.collections).toHaveLength(1);
    expect(l.collections[0].images).toEqual(["/proactive/a.webp"]);
    expect(l.collections[0].productIds).toEqual(["p1"]);
  });
  it("never surfaces wholesale fields even if the server sent them", () => {
    const l = parseLocker({ ...raw, products: [{ ...raw.products[0], wholesale_price: 20, athlete_price: 18 }] }, SB)!;
    expect(Object.keys(l.products[0])).not.toContain("wholesale_price");
    expect(Object.keys(l.products[0])).not.toContain("athlete_price");
  });
  it("is null when the locker is closed", () => {
    expect(parseLocker(null, SB)).toBeNull();
  });
  it("builds storage urls", () => {
    expect(imageUrl("product-images", "a/b.png", SB)).toBe(`${SB}/storage/v1/object/public/product-images/a/b.png`);
    expect(imageUrl(null, null, SB)).toBeNull();
  });
});

describe("variant picking", () => {
  const p = parseLocker(
    {
      entity: { id: "e" },
      products: [
        {
          id: "p",
          title: "t",
          price: 45,
          variants: [
            { id: "100001", size: "S", color: "black" },
            { id: "100002", size: "M", color: "black" },
            { id: "100003", size: "M", color: "cloud" },
          ],
        },
      ],
    },
    SB,
  )!.products[0];
  it("finds the colour + size", () => {
    expect(pickVariant(p, "cloud", "M")?.id).toBe("100003");
    expect(pickVariant(p, "cloud", "S")).toBeNull();
  });
  it("sorts sizes in wearing order", () => {
    expect(sortSizes(["2XL", "S", "XL", "M", "S", "OSFA"])).toEqual(["S", "M", "XL", "2XL", "OSFA"]);
  });
});

describe("my requests", () => {
  it("parses and defaults", () => {
    const r = parseMyRequests([{ id: "r", athleteId: "a", entityName: "PSP", status: "weird", requestedRole: "owner", onboarding: null, onboardedAt: null }]);
    expect(r[0]).toMatchObject({ status: "pending", requestedRole: "owner", answered: false });
    expect(parseMyRequests("nope")).toEqual([]);
  });
});

describe("owner vs team", () => {
  it("closes money and commissioning pages to Team", () => {
    expect(canSeePath("/portal/analytics", "team")).toBe(false);
    expect(canSeePath("/portal/studio/new", "team")).toBe(false);
    expect(canSeePath("/portal/products", "team")).toBe(true);
    expect(canSeePath("/portal", "team")).toBe(true);
    expect(canSeePath("/portal/analytics", "owner")).toBe(true);
  });
  it("filters both nav shapes", () => {
    const nav = [{ path: "/portal" }, { path: "/portal/analytics" }, { to: "/portal/content" }, { to: "/portal/profile" }];
    expect(navForRole(nav, "team")).toEqual([{ path: "/portal" }, { to: "/portal/content" }]);
    expect(navForRole(nav, "owner")).toHaveLength(4);
  });
  it("swaps commissioning shortcuts for ordering", () => {
    expect(playsForRole(["design", "code", "content"], "team")).toEqual(["order", "code", "content"]);
    expect(playsForRole(["order", "design"], "team")).toEqual(["order"]);
    expect(playsForRole(["design"], "owner")).toEqual(["design"]);
  });
  it("resolves the role", () => {
    expect(resolvePortalRole({ isAdmin: true, viewParam: null, linkRole: undefined })).toBe("owner");
    expect(resolvePortalRole({ isAdmin: true, viewParam: "team", linkRole: undefined })).toBe("team");
    expect(resolvePortalRole({ isAdmin: false, viewParam: "owner", linkRole: "team" })).toBe("team");
    expect(resolvePortalRole({ isAdmin: false, viewParam: null, linkRole: undefined })).toBe("owner");
  });
});
