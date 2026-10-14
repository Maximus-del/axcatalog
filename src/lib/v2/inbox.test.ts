import { describe, expect, it, beforeEach } from "vitest";
import {
  DRAG_MIME,
  dragPayload,
  dropLabel,
  hitTest,
  intersects,
  movedEnough,
  normalizeRect,
  rangeBetween,
  readDragIds,
  readTray,
  union,
  writeTray,
  type Box,
} from "./inbox";

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

describe("marquee geometry", () => {
  it("normalises a rectangle dragged in any direction", () => {
    const up = normalizeRect(100, 100, 20, 40);
    expect(up).toEqual({ left: 20, top: 40, right: 100, bottom: 100 });
    expect(normalizeRect(20, 40, 100, 100)).toEqual(up);
  });

  it("counts a card the marquee only clips", () => {
    // The whole point: a loose drag across a row must catch the row.
    expect(intersects(box(0, 0, 50, 50), box(40, 40, 90, 90))).toBe(true);
    expect(intersects(box(0, 0, 50, 50), box(50, 50, 90, 90))).toBe(false);
  });

  it("returns hits in grid order, not hit order", () => {
    const boxes = [
      { id: "a", box: box(0, 0, 40, 40) },
      { id: "b", box: box(50, 0, 90, 40) },
      { id: "c", box: box(100, 0, 140, 40) },
    ];
    expect(hitTest(box(30, 10, 110, 20), boxes)).toEqual(["a", "b", "c"]);
    expect(hitTest(box(200, 200, 300, 300), boxes)).toEqual([]);
  });

  it("ignores a gesture that has not travelled", () => {
    expect(movedEnough(10, 10, 12, 11)).toBe(false);
    expect(movedEnough(10, 10, 20, 10)).toBe(true);
  });
});

describe("selection", () => {
  const order = ["a", "b", "c", "d", "e"];

  it("fills a range in either direction", () => {
    expect(rangeBetween(order, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeBetween(order, "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("falls back to the clicked card with no anchor or a stale one", () => {
    expect(rangeBetween(order, null, "c")).toEqual(["c"]);
    expect(rangeBetween(order, "zz", "c")).toEqual(["c"]);
  });

  it("unions without duplicating", () => {
    expect(union(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("drag payload", () => {
  it("carries the whole selection when the dragged card is in it", () => {
    expect(dragPayload(["a", "b", "c"], "b")).toEqual(["a", "b", "c"]);
  });

  it("carries only the dragged card when it is not selected", () => {
    // Six designs must never move because one unselected card was dragged.
    expect(dragPayload(["a", "b", "c"], "z")).toEqual(["z"]);
  });

  it("labels the drop by count", () => {
    expect(dropLabel(1, "Darnell Mooney")).toBe("Assign 1 design to Darnell Mooney");
    expect(dropLabel(6, "DJ Reed")).toBe("Assign 6 designs to DJ Reed");
  });

  it("reads ids off a drag and shrugs at anything else", () => {
    expect(readDragIds((m) => (m === DRAG_MIME ? JSON.stringify(["a", "b"]) : ""))).toEqual(["a", "b"]);
    expect(readDragIds(() => "")).toEqual([]);
    expect(readDragIds(() => "not json")).toEqual([]);
    expect(readDragIds(() => JSON.stringify({ nope: true }))).toEqual([]);
    expect(readDragIds(() => JSON.stringify(["a", 7, null]))).toEqual(["a"]);
  });
});

describe("tray persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips pinned ids", () => {
    writeTray(["one", "two"]);
    expect(readTray()).toEqual(["one", "two"]);
  });

  it("returns nothing rather than throwing on junk", () => {
    localStorage.setItem("ax.v2.inbox.tray", "{oops");
    expect(readTray()).toEqual([]);
    localStorage.setItem("ax.v2.inbox.tray", JSON.stringify("a string"));
    expect(readTray()).toEqual([]);
  });

  it("caps the tray so a runaway list cannot fill storage", () => {
    writeTray(Array.from({ length: 40 }, (_, i) => `e${i}`));
    expect(readTray()).toHaveLength(12);
  });
});
