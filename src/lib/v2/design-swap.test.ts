import { describe, expect, it } from "vitest";
import { defaultSwapTarget, designsInUse, swapDesign } from "./design-swap";
import type { PlacedDesign } from "./placement-geometry";

const at = (over: Partial<PlacedDesign> & Pick<PlacedDesign, "id" | "designId">): PlacedDesign => ({
  surface: "front",
  box: { x: 30, y: 22, w: 40, h: 40 },
  rotation: 0,
  zoneId: null,
  zoneLabel: null,
  ...over,
});

describe("swapping the design", () => {
  it("keeps the box exactly where it was", () => {
    const placed = [at({ id: "p1", designId: "d1" })];
    const [swapped] = swapDesign(placed, "d2");
    expect(swapped.designId).toBe("d2");
    expect(swapped.box).toEqual(placed[0].box);
    expect(swapped.rotation).toBe(placed[0].rotation);
  });

  it("swaps front and back together by default", () => {
    const placed = [at({ id: "p1", designId: "d1" }), at({ id: "p2", designId: "d1", surface: "back" })];
    expect(swapDesign(placed, "d2").every((p) => p.designId === "d2")).toBe(true);
  });

  it("can be limited to one surface", () => {
    const placed = [at({ id: "p1", designId: "d1" }), at({ id: "p2", designId: "d1", surface: "back" })];
    const next = swapDesign(placed, "d2", { surface: "front" });
    expect(next[0].designId).toBe("d2");
    expect(next[1].designId).toBe("d1");
  });

  it("can replace just one of several designs", () => {
    const placed = [at({ id: "p1", designId: "d1" }), at({ id: "p2", designId: "d9" })];
    const next = swapDesign(placed, "d2", { fromDesignId: "d9" });
    expect(next.map((p) => p.designId)).toEqual(["d1", "d2"]);
  });

  it("clears the print zone, because the box is no longer that preset", () => {
    const placed = [at({ id: "p1", designId: "d1", zoneId: "z1", zoneLabel: "Left chest" })];
    const [swapped] = swapDesign(placed, "d2");
    expect(swapped.zoneId).toBeNull();
    expect(swapped.zoneLabel).toBeNull();
  });

  it("returns the same array when the swap would change nothing", () => {
    const placed = [at({ id: "p1", designId: "d1" })];
    expect(swapDesign(placed, "d1")).toBe(placed);
    expect(swapDesign(placed, "d2", { fromDesignId: "nope" })).toBe(placed);
  });

  it("does nothing to an empty garment", () => {
    expect(swapDesign([], "d2")).toEqual([]);
  });
});

describe("what is on the garment", () => {
  it("lists each design once, in placement order", () => {
    const placed = [
      at({ id: "p1", designId: "d1" }),
      at({ id: "p2", designId: "d9" }),
      at({ id: "p3", designId: "d1", surface: "back" }),
    ];
    expect(designsInUse(placed)).toEqual(["d1", "d9"]);
  });

  it("picks the obvious swap target when there is only one design", () => {
    expect(defaultSwapTarget([at({ id: "p1", designId: "d1" })])).toBe("d1");
  });

  it("refuses to guess when there is more than one", () => {
    expect(defaultSwapTarget([at({ id: "p1", designId: "d1" }), at({ id: "p2", designId: "d2" })])).toBeNull();
  });

  it("has nothing to target on an empty garment", () => {
    expect(defaultSwapTarget([])).toBeNull();
  });
});
