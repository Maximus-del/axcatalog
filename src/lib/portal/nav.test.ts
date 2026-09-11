import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isActive, labelFor, PORTAL_NAV, PRIMARY_NAV, toWithSearch } from "./nav";

describe("PORTAL_NAV", () => {
  it("has no duplicate destinations", () => {
    const paths = PORTAL_NAV.map((d) => d.to);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps the mobile bar to five slots", () => {
    expect(PRIMARY_NAV).toHaveLength(5);
  });

  it("starts at Home and ends at Profile — the two the thumb reaches for", () => {
    expect(PRIMARY_NAV[0].to).toBe("/portal");
    expect(PRIMARY_NAV[PRIMARY_NAV.length - 1].to).toBe("/portal/profile");
  });

  it("every destination is under /portal", () => {
    for (const d of PORTAL_NAV) expect(d.to.startsWith("/portal")).toBe(true);
  });

  it("only Home matches exactly", () => {
    expect(PORTAL_NAV.filter((d) => d.end).map((d) => d.to)).toEqual(["/portal"]);
  });

  it("surfaces Made For You, which used to be drawer-only", () => {
    expect(PORTAL_NAV.some((d) => d.to === "/portal/mockups")).toBe(true);
  });
});

describe("isActive", () => {
  const home = PORTAL_NAV.find((d) => d.to === "/portal")!;
  const products = PORTAL_NAV.find((d) => d.to === "/portal/products")!;

  it("does not light Home up on every route", () => {
    expect(isActive(home, "/portal")).toBe(true);
    expect(isActive(home, "/portal/products")).toBe(false);
  });

  it("matches a section from its detail routes", () => {
    expect(isActive(products, "/portal/products")).toBe(true);
    expect(isActive(products, "/portal/products/abc-123")).toBe(true);
  });

  it("does not match a different section that shares a prefix string", () => {
    const fake = { to: "/portal/product", label: "x", icon: "x" };
    expect(isActive(fake, "/portal/products")).toBe(false);
  });
});

describe("labelFor", () => {
  it("uses the long label where there is room", () => {
    const products = PORTAL_NAV.find((d) => d.to === "/portal/products")!;
    expect(labelFor(products, true)).toBe("Product Lineup");
    expect(labelFor(products, false)).toBe("Products");
  });

  it("falls back to the short label when there is no long one", () => {
    const mockups = PORTAL_NAV.find((d) => d.to === "/portal/mockups")!;
    expect(labelFor(mockups, true)).toBe("Made For You");
  });
});

describe("toWithSearch", () => {
  it("carries the query string, so impersonation survives a click", () => {
    expect(toWithSearch("/portal/analytics", "?as=abc")).toEqual({
      pathname: "/portal/analytics",
      search: "?as=abc",
    });
  });

  it("is harmless with no query string", () => {
    expect(toWithSearch("/portal", "")).toEqual({ pathname: "/portal", search: "" });
  });
});

/**
 * Source-level: a nav surface that hard-codes `to="/portal/..."` is a nav
 * surface that has dropped ?as=. That is exactly how the drawer broke
 * impersonation — it read from its own private LINKS array and used a bare
 * string `to`.
 */
describe("navigation surfaces share one list", () => {
  const NAV_DIR = join(process.cwd(), "src", "components", "portal");
  const SURFACES = ["PortalBottomNav.tsx", "PortalNavDrawer.tsx", "PortalDesktopNav.tsx"];

  it("the surfaces exist", () => {
    const present = readdirSync(NAV_DIR);
    for (const s of SURFACES) expect(present, `${s} missing`).toContain(s);
  });

  it("no surface keeps its own destination list", () => {
    for (const s of SURFACES) {
      const src = readFileSync(join(NAV_DIR, s), "utf8");
      const hardCoded = src.match(/to=["']\/portal/g) ?? [];
      expect(hardCoded, `${s} hard-codes a portal path instead of using PORTAL_NAV`).toEqual([]);
      expect(src, `${s} should read from nav.ts`).toMatch(/PORTAL_NAV|PRIMARY_NAV/);
    }
  });

  it("every surface preserves the query string", () => {
    for (const s of SURFACES) {
      const src = readFileSync(join(NAV_DIR, s), "utf8");
      expect(src, `${s} must route through toWithSearch`).toContain("toWithSearch");
    }
  });
});
