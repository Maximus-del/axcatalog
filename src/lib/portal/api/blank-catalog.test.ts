import { describe, expect, it } from "vitest";
import { driveThumb, groupOf, latestRequest, parseCatalog } from "./blank-catalog";
import { activePortalPage, worldNavigation } from "@/components/portal/mooney/navigation";
import { canSeePath, navForRole } from "../roles";
import { toBlankRequests } from "@/lib/v2/blank-requests";

describe("blank catalog parsing", () => {
  const raw = {
    tier: "corporate",
    blanks: [
      { id: "b1", name: "Oversized Boxy Tee 7.5oz", type: "tee", price: "14.85", retail: 18.15, cost: 6.6, colors: [{ id: "c1", name: "Almond", hex: null, available: true, front: "10pXwRqOlBkOzVOnumHuLkU0d4UA-5Tzw", back: null }] },
      { id: "b2", name: null, type: "hoodie", price: 40 },
      { id: "b3", name: "No price", type: "tee", price: null },
    ],
    requests: [
      { id: "r1", blankId: "b1", status: "weird", createdAt: "2026-10-24T10:00:00Z" },
      { id: "r2", blankId: "b1", status: "added", createdAt: "2026-10-24T12:00:00Z" },
    ],
  };
  it("keeps only named, priced blanks and never surfaces cost", () => {
    const c = parseCatalog(raw);
    expect(c.tier).toBe("corporate");
    expect(c.blanks.map((b) => b.id)).toEqual(["b1"]);
    expect(c.blanks[0].price).toBe(14.85);
    expect(Object.keys(c.blanks[0])).not.toContain("cost");
  });
  it("defaults unknown statuses and finds the latest request", () => {
    const c = parseCatalog(raw);
    expect(c.requests[0].status).toBe("pending");
    expect(latestRequest(c.requests, "b1")?.status).toBe("added");
    expect(latestRequest(c.requests, "nope")).toBeNull();
  });
  it("is empty-safe", () => {
    expect(parseCatalog(null)).toEqual({ tier: "corporate", blanks: [], requests: [] });
  });
  it("builds Drive thumbnails only from real ids", () => {
    expect(driveThumb("10pXwRqOlBkOzVOnumHuLkU0d4UA-5Tzw", 800)).toBe("https://drive.google.com/thumbnail?id=10pXwRqOlBkOzVOnumHuLkU0d4UA-5Tzw&sz=w800");
    expect(driveThumb("bad id\"><script>")).toBeNull();
    expect(driveThumb(null)).toBeNull();
  });
  it("groups garments for the filter tabs", () => {
    expect(groupOf("zip_hoodie")).toBe("fleece");
    expect(groupOf("sweatpants")).toBe("bottoms");
    expect(groupOf(null)).toBe("other");
  });
});

describe("catalog access", () => {
  it("is owner-only", () => {
    expect(canSeePath("/portal/catalog", "team")).toBe(false);
    expect(canSeePath("/portal/catalog", "owner")).toBe(true);
  });
});

describe("world nav for a Team login", () => {
  const teamNav = navForRole(worldNavigation("Gym HQ"), "team");
  it("never returns undefined for pages whose tab Team doesn't have", () => {
    for (const path of ["/portal/drops", "/portal/profile", "/portal/era", "/portal/mockups", "/portal/catalog", "/portal/analytics"]) {
      expect(activePortalPage(path, teamNav)).toBeDefined();
    }
  });
  it("still highlights the right tab", () => {
    expect(activePortalPage("/portal/drops", teamNav).path).toBe("/portal/content");
    expect(activePortalPage("/portal/catalog", worldNavigation("Gym HQ")).path).toBe("/portal/catalog");
  });
});

describe("operator request list", () => {
  it("puts new requests first and resolves names", () => {
    const rows = toBlankRequests(
      [
        { id: "a", blank_id: "b1", color_ids: ["c1"], status: "added", tier: "corporate", quoted_unit_price: "14.85", created_at: "2026-10-24T13:00:00Z" },
        { id: "b", blank_id: "b1", color_ids: ["c1", "ghost"], status: "pending", tier: "corporate", quoted_unit_price: null, created_at: "2026-10-24T09:00:00Z" },
      ],
      new Map([["b1", { display_name: "Oversized Boxy Tee 7.5oz", garment_type: "tee" }]]),
      new Map([["c1", "Almond"]]),
    );
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(rows[0].colors).toEqual(["Almond"]);
    expect(rows[1].unitPrice).toBe(14.85);
  });
});
