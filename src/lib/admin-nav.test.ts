import { describe, expect, it } from "vitest";
import { GROUPS, PINNED, activeGroupFor, allNavItems, isItemActive } from "./admin-nav";

describe("isItemActive", () => {
  it("matches the page itself and its children", () => {
    expect(isItemActive("/admin/products", "/admin/products")).toBe(true);
    expect(isItemActive("/admin/products", "/admin/products/abc-123")).toBe(true);
  });

  it("does not match a sibling that merely shares a prefix", () => {
    // The bug this replaced: startsWith lit up Pricing while on Pricing Links.
    expect(isItemActive("/admin/pricing", "/admin/pricing-links")).toBe(false);
    expect(isItemActive("/admin/designs", "/admin/design-templates")).toBe(false);
    expect(isItemActive("/admin/orders", "/admin/imports/orders")).toBe(false);
  });

  it("keeps the home route from matching everything", () => {
    expect(isItemActive("/admin", "/admin", true)).toBe(true);
    expect(isItemActive("/admin", "/admin/products", true)).toBe(false);
  });
});

describe("activeGroupFor", () => {
  it("finds the group holding the current page", () => {
    expect(activeGroupFor("/admin/blanks")).toBe("Commerce");
    expect(activeGroupFor("/admin/print-queue")).toBe("Orders");
    expect(activeGroupFor("/admin/athletes/abc")).toBe("People");
  });

  it("returns null for pinned items and unknown paths", () => {
    expect(activeGroupFor("/admin/inbox")).toBeNull();
    expect(activeGroupFor("/admin/nowhere")).toBeNull();
  });

  it("prefers the more specific destination when paths nest", () => {
    expect(activeGroupFor("/admin/imports/orders")).toBe("Orders");
  });
});

describe("the nav as a whole", () => {
  it("has no duplicate destinations", () => {
    const tos = allNavItems().map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
  });

  it("keeps the pinned list short enough to stay a shortcut", () => {
    expect(PINNED.length).toBeLessThanOrEqual(5);
  });

  it("gives every group enough items to justify a header", () => {
    for (const g of GROUPS) expect(g.items.length).toBeGreaterThanOrEqual(5);
  });

  it("resolves every group item back to its own group", () => {
    for (const g of GROUPS) {
      for (const item of g.items) {
        expect(activeGroupFor(item.to)).toBe(g.label);
      }
    }
  });
});
