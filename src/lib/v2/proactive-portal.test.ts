import { describe, expect, it } from "vitest";
import { DEFAULT_PORTAL_THEME, DEFAULT_WORLD, cleanImageUrl, parsePortalTheme, parseWorld, worldHeadline } from "@/lib/portal/portal-theme";
import { toDestination, type CollectionRow } from "@/lib/portal/api/destinations";
import { entityRow, nextSlug } from "./add-entity";
import { toWallItem, wallMetadata } from "./collection-wall";
import { portalAssetPath } from "./portal-assets";

describe("world theme", () => {
  it("Mooney's saved theme (no world key) parses to exactly the old behaviour", () => {
    const mooney = { brand: "", title: "#ffffff", accent: "#2ecc71", header: "#0d0d0d", layout: "world", titleCard: { eyebrow: "", subline: "", headline: "" }, background: "#1a1a1a" };
    const t = parsePortalTheme(mooney);
    expect(t.world).toEqual(DEFAULT_WORLD);
    expect(worldHeadline(t.world, "Darnell Mooney")).toBe("Welcome to your Locker Room, Darnell Mooney.");
    expect(t.world.quickPlays).toEqual(["order", "design", "code", "content"]);
  });

  it("keeps a valid world and drops junk field by field", () => {
    const w = parseWorld({
      roomName: "Gym HQ",
      headline: "Welcome to",
      headlineAccent: "the Gym",
      logoUrl: "javascript:alert(1)",
      heroUrl: "https://x.supabase.co/storage/v1/object/public/content-media/portal/a/hero/gym.webp",
      accent2: "#20FF33",
      stage: "pedestal",
      showStats: false,
      quickPlays: ["order", "request", "nope", "order", "projects", "content", "drops"],
    });
    expect(w.logoUrl).toBe("");
    expect(w.heroUrl).toContain("content-media");
    expect(w.accent2).toBe("#20ff33");
    expect(w.stage).toBe("pedestal");
    expect(w.showStats).toBe(false);
    expect(w.quickPlays).toEqual(["order", "request", "projects", "content"]);
  });

  it("refuses image addresses that could break out of a CSS url()", () => {
    expect(cleanImageUrl('https://a.b/x.png") ; background:red')).toBe("");
    expect(cleanImageUrl("/mooney/assets/locker-room.png")).toBe("/mooney/assets/locker-room.png");
    expect(cleanImageUrl("/../etc/passwd")).toBe("");
  });

  it("the default theme still round-trips", () => {
    expect(parsePortalTheme(DEFAULT_PORTAL_THEME)).toEqual(DEFAULT_PORTAL_THEME);
  });
});

describe("destination deck", () => {
  const row = (d: Record<string, unknown>): CollectionRow => ({ id: "c1", name: "Proactive Sports", slug: "ps", status: "active", athlete_id: "a", metadata: { portal_destination: d }, team: null });
  it("reads images[] as a deck, first on top, and keeps the old single image working", () => {
    const deck = toDestination(row({ images: ["https://a/1.png", "https://a/2.png"], caption: "Crest I · Crest II" }), 2)!;
    expect(deck.image).toBe("https://a/1.png");
    expect(deck.images).toEqual(["https://a/1.png", "https://a/2.png"]);
    expect(deck.caption).toBe("Crest I · Crest II");
    const single = toDestination(row({ image: "/mooney/assets/atlanta-1.png" }), 1)!;
    expect(single.images).toEqual(["/mooney/assets/atlanta-1.png"]);
  });
});

describe("add someone", () => {
  it("an organisation has one name and an empty surname", () => {
    const r = entityRow({ name: "  Proactive  Sports Performance ", entityType: "facility", roles: ["client", "client"] });
    expect(r).toMatchObject({ first_name: "Proactive Sports Performance", last_name: "", display_name: "Proactive Sports Performance", slug: "proactive-sports-performance", roles: ["client"] });
  });
  it("a person keeps first and last", () => {
    expect(entityRow({ name: "Darnell", lastName: "Mooney", entityType: "person", roles: ["athlete"] }).display_name).toBe("Darnell Mooney");
  });
  it("needs a name and a role", () => {
    expect(() => entityRow({ name: " ", entityType: "person", roles: ["client"] })).toThrow();
    expect(() => entityRow({ name: "X", entityType: "person", roles: [] })).toThrow();
  });
  it("finds the next free address", () => {
    expect(nextSlug("proactive")).toBe("proactive-2");
    expect(nextSlug("proactive-2")).toBe("proactive-3");
  });
});

describe("collection wall", () => {
  it("round-trips without losing keys it does not edit", () => {
    const row = { id: "c", name: "Darnell Mooney x Bears", status: "active", metadata: { other: 1, portal_destination: { key: "chicago", jersey_number: 11, image: "/mooney/assets/chicago-11.png", label: "Chicago", sort: 20, accent: "#F58220" } } };
    const item = toWallItem(row, 3);
    const meta = wallMetadata(row.metadata, { ...item, caption: "Bears era" });
    expect(meta.other).toBe(1);
    expect(meta.portal_destination).toMatchObject({ key: "chicago", jersey_number: 11, label: "Chicago", sort: 20, image: "/mooney/assets/chicago-11.png", images: ["/mooney/assets/chicago-11.png"], caption: "Bears era", accent: "#f58220", hidden: false });
  });
});

describe("portal asset path", () => {
  it("is filed under the entity and never trusts the file name", () => {
    expect(portalAssetPath("e1", "plaque", "Crest II (final)!!.PNG", 5)).toBe("portal/e1/plaque/5-crest-ii-final.png");
  });
});
