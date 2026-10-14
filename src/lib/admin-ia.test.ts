import { describe, expect, it } from "vitest";
import {
  DEPARTMENTS,
  activeToolFor,
  allTools,
  departmentByKey,
  departmentFor,
  isItemActive,
} from "./admin-ia";

describe("isItemActive", () => {
  it("matches the page itself and its children", () => {
    expect(isItemActive("/admin/products", "/admin/products")).toBe(true);
    expect(isItemActive("/admin/products", "/admin/products/abc-123")).toBe(true);
  });

  it("does not match a sibling that merely shares a prefix", () => {
    // The bug this replaced: startsWith lit up Pricing while on Pricing Links.
    expect(isItemActive("/admin/designs", "/admin/design-templates")).toBe(false);
    expect(isItemActive("/admin/orders", "/admin/imports/orders")).toBe(false);
  });

  it("keeps the home route from matching everything", () => {
    expect(isItemActive("/admin", "/admin", true)).toBe(true);
    expect(isItemActive("/admin", "/admin/products", true)).toBe(false);
  });
});

describe("the four departments", () => {
  it("is exactly four, in the order the homepage shows them", () => {
    expect(DEPARTMENTS.map((d) => d.key)).toEqual(["creative", "commerce", "orders", "people"]);
  });

  it("sends every card somewhere that is one of its own tools", () => {
    for (const d of DEPARTMENTS) {
      expect(d.tools.some((t) => t.to === d.home)).toBe(true);
    }
  });

  it("never lists the same destination in two departments", () => {
    const tos = allTools().map((t) => t.to);
    expect(new Set(tos).size).toBe(tos.length);
  });

  it("keeps each department small enough to read as tabs", () => {
    // Past about eight the tab strip stops being scannable and we are back to
    // a sidebar, just rotated ninety degrees.
    for (const d of DEPARTMENTS) {
      expect(d.tools.length).toBeGreaterThanOrEqual(4);
      expect(d.tools.length).toBeLessThanOrEqual(8);
    }
  });

  it("gives every tool a non-empty label and an /admin path", () => {
    for (const t of allTools()) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.to.startsWith("/admin/")).toBe(true);
    }
  });
});

describe("departmentFor", () => {
  it("places each tool in its own department", () => {
    for (const d of DEPARTMENTS) {
      for (const t of d.tools) {
        expect(departmentFor(t.to)?.key).toBe(d.key);
      }
    }
  });

  it("keeps a detail page inside its department", () => {
    expect(departmentFor("/admin/athletes/abc-123")?.key).toBe("people");
    expect(departmentFor("/admin/blanks/import-images")?.key).toBe("commerce");
  });

  it("prefers the more specific destination when paths nest", () => {
    expect(departmentFor("/admin/imports/orders")?.key).toBe("orders");
  });

  it("returns null for the homepage and for utilities that belong to no department", () => {
    for (const p of ["/admin", "/admin/inbox", "/admin/tasks", "/admin/analytics", "/admin/settings", "/admin/nowhere"]) {
      expect(departmentFor(p)).toBeNull();
    }
  });
});

describe("activeToolFor", () => {
  it("marks the tool you are actually in", () => {
    expect(activeToolFor("/admin/blanks")?.label).toBe("Blanks");
    expect(activeToolFor("/admin/design-templates")?.label).toBe("Design Templates");
  });

  it("keeps the tab lit on a detail page", () => {
    expect(activeToolFor("/admin/athletes/abc-123")?.label).toBe("Athletes");
    expect(activeToolFor("/admin/orders/xyz")?.label).toBe("All Orders");
  });

  it("lights the tab that stands for a consolidated page", () => {
    // Fulfillment, print zones and ingestion live behind one Operations tab.
    for (const p of ["/admin/fulfillment", "/admin/print-zones", "/admin/ingestion"]) {
      expect(activeToolFor(p)?.label).toBe("Operations");
    }
  });

  it("does not confuse order imports with the order list", () => {
    expect(activeToolFor("/admin/imports/orders")?.label).toBe("Imports");
  });

  it("is null off-department", () => {
    expect(activeToolFor("/admin/settings")).toBeNull();
  });
});

describe("consolidation actually happened", () => {
  // The redesign's own acceptance test: these used to be separate sidebar
  // entries and must NOT come back as tools.
  const absorbed = [
    "/admin/blanks/import-images", // → a view inside Blanks
    "/admin/pricing",              // → a view inside Blanks
    "/admin/fulfillment",          // → Operations
    "/admin/print-zones",          // → Operations
    "/admin/ingestion",            // → Operations
  ];

  it("keeps absorbed destinations out of the tool list", () => {
    const tos = allTools().map((t) => t.to);
    for (const p of absorbed) expect(tos).not.toContain(p);
  });

  it("still resolves every absorbed destination to a department", () => {
    // Consolidated, not orphaned — you can still land there from a bookmark
    // and the chrome around you still knows where you are.
    for (const p of absorbed) {
      expect(departmentFor(p)).not.toBeNull();
    }
  });

  it("holds the whole back office in 24 tools or fewer", () => {
    // A ceiling against sprawl, not a fixed count. It caught Inventory taking
    // the total to 22, which is the point — raising it should be a decision
    // someone makes on purpose, not something that drifts.
    expect(allTools().length).toBeLessThanOrEqual(24);
  });
});

describe("departmentByKey", () => {
  it("finds a department and rejects an unknown one", () => {
    expect(departmentByKey("orders")?.label).toBe("Orders");
    expect(departmentByKey("marketing")).toBeNull();
  });
});

describe("the pricing redirect keeps its bearings", () => {
  it("claims /admin/pricing for Commerce and lights the Blanks tab", () => {
    expect(departmentFor("/admin/pricing")?.key).toBe("commerce");
    expect(activeToolFor("/admin/pricing")?.label).toBe("Blanks");
    // The legacy price sheet too, which is a real page rather than a redirect.
    expect(activeToolFor("/admin/pricing/sheet")?.label).toBe("Blanks");
  });
});
