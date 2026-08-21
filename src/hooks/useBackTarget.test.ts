import { describe, expect, it } from "vitest";
import { backState, backTargetOf } from "./useBackTarget";

describe("backTargetOf", () => {
  it("keeps the query string, because that is where the tab lives", () => {
    expect(backTargetOf("/admin/athletes/abc", "?tab=merch&team=t1", "Ana Ruiz")).toEqual({
      to: "/admin/athletes/abc?tab=merch&team=t1",
      label: "Ana Ruiz",
    });
  });

  it("handles a page with no search params", () => {
    expect(backTargetOf("/admin/athletes/abc", "", "Ana Ruiz").to).toBe("/admin/athletes/abc");
  });
});

describe("backState", () => {
  it("nests under `from` so it does not collide with other router state", () => {
    const target = { to: "/admin/athletes/abc?tab=merch", label: "Ana Ruiz" };
    expect(backState(target)).toEqual({ from: target });
  });
});
