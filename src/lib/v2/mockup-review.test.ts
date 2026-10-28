import { describe, expect, it } from "vitest";
import { hasChanges, mockupKey, planSummary, planSync, toMockupItem, type MockupItem } from "./mockup-review";

const row = (color: string, state: MockupItem["state"], extra: Partial<MockupItem> = {}): MockupItem => ({
  ...toMockupItem({ id: color, design_code: "PSP-ICEMAN", design_name: "Ice Man", garment: "TEE V1 — AXISM 7010", color, review_state: state }),
  ...extra,
});

describe("planSync", () => {
  it("on an existing product: approved stays, dropped and to-fix come off, pending is untouched", () => {
    const gid = "gid://shopify/Product/1";
    const [p] = planSync([
      row("Black", "approved", { shopifyProductGid: gid }),
      row("Lilac", "archived", { shopifyProductGid: gid }),
      row("Navy", "needs_fix", { shopifyProductGid: gid }),
      row("Surf", "pending", { shopifyProductGid: gid }),
    ]);
    expect(p.keep).toEqual(["Black"]);
    expect(p.remove).toEqual(["Lilac", "Navy"]);
    expect(p.untouched).toEqual(["Surf"]);
    expect(p.add).toEqual([]);
    expect(planSummary(p)).toBe("Remove 2 · Keep 1");
    expect(hasChanges(p)).toBe(true);
  });

  it("re-adds an approved colour that an earlier sync took off", () => {
    const gid = "gid://shopify/Product/1";
    const [p] = planSync([row("Navy", "approved", { shopifyProductGid: gid, shopifyState: "off" })]);
    expect(p.add).toEqual(["Navy"]);
  });

  it("does not try to remove a colour that is already off", () => {
    const gid = "gid://shopify/Product/1";
    const [p] = planSync([row("Navy", "archived", { shopifyProductGid: gid, shopifyState: "off" })]);
    expect(p.remove).toEqual([]);
    expect(hasChanges(p)).toBe(false);
    expect(planSummary(p)).toBe("Nothing to change");
  });

  it("without a product, approved colours are all adds and nothing is removed", () => {
    const [p] = planSync([row("Black", "approved"), row("Lilac", "archived")]);
    expect(p.productGid).toBeNull();
    expect(p.add).toEqual(["Black"]);
    expect(p.remove).toEqual([]);
  });

  it("groups by design", () => {
    const plans = planSync([row("Black", "approved"), { ...row("Black", "approved"), designCode: "PSP-ZAYLIBRE", designName: "Zay Libre" }]);
    expect(plans.map((p) => p.designCode).sort()).toEqual(["PSP-ICEMAN", "PSP-ZAYLIBRE"]);
  });
});

describe("mockupKey", () => {
  it("maps the review keys", () => {
    expect(mockupKey("A")).toBe("approve");
    expect(mockupKey("f")).toBe("fix");
    expect(mockupKey("x")).toBe("archive");
    expect(mockupKey("b")).toBe("flip");
    expect(mockupKey("ArrowRight")).toBe("next");
    expect(mockupKey("q")).toBeNull();
  });
});
