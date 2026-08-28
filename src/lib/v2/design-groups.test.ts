import { describe, expect, it } from "vitest";
import {
  buildShelf,
  coverOf,
  dropIntent,
  memberOrderWrites,
  moveItem,
  orderWrites,
  suggestGroupName,
  type DesignGroup,
  type ShelfItem,
} from "./design-groups";
import type { Design } from "./types";

const design = (id: string, over: Partial<Design> = {}): Design => ({
  id,
  title: `Design ${id}`,
  status: "active",
  entityId: "e1",
  fileBucket: "design-files",
  filePath: `${id}.png`,
  fileType: "export",
  productionReady: true,
  createdAt: "",
  ...over,
});

const group = (id: string, over: Partial<DesignGroup> = {}): DesignGroup => ({
  id,
  name: "Colourways",
  entityId: "e1",
  sortOrder: 0,
  coverDesignId: null,
  ...over,
});

const membership = (entries: [string, string | null, number][]) =>
  new Map(entries.map(([id, groupId, sortOrder]) => [id, { groupId, sortOrder }]));

describe("shelf assembly", () => {
  it("interleaves loose designs and groups by one shared sort order", () => {
    const shelf = buildShelf(
      [design("a"), design("b"), design("c")],
      [group("g1", { sortOrder: 1 })],
      membership([
        ["a", null, 0],
        ["b", "g1", 0],
        ["c", null, 2],
      ]),
    );
    expect(shelf.map((i) => i.key)).toEqual(["a", "g1", "c"]);
    expect(shelf[1].kind).toBe("group");
  });

  it("orders designs inside a group by the same field", () => {
    const shelf = buildShelf(
      [design("a"), design("b")],
      [group("g1")],
      membership([
        ["a", "g1", 1],
        ["b", "g1", 0],
      ]),
    );
    const g = shelf[0];
    expect(g.kind).toBe("group");
    if (g.kind === "group") expect(g.designs.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("hides a group once it has no members left", () => {
    const shelf = buildShelf([design("a")], [group("g1")], membership([["a", null, 0]]));
    expect(shelf.map((i) => i.key)).toEqual(["a"]);
  });

  it("never loses a design — grouping is organisational only", () => {
    const designs = [design("a"), design("b"), design("c")];
    const shelf = buildShelf(
      designs,
      [group("g1")],
      membership([
        ["a", "g1", 0],
        ["b", "g1", 1],
        ["c", null, 1],
      ]),
    );
    const seen = shelf.flatMap((i) => (i.kind === "group" ? i.designs.map((d) => d.id) : [i.design.id]));
    expect(seen.sort()).toEqual(["a", "b", "c"]);
  });
});

describe("cover resolution", () => {
  it("defaults to the first member", () => {
    expect(coverOf(group("g1"), [design("a"), design("b")])?.id).toBe("a");
  });

  it("honours an explicit cover when one is set", () => {
    expect(coverOf(group("g1", { coverDesignId: "b" }), [design("a"), design("b")])?.id).toBe("b");
  });

  it("falls back to the first member when the explicit cover has left the group", () => {
    expect(coverOf(group("g1", { coverDesignId: "zz" }), [design("a")])?.id).toBe("a");
  });

  it("returns null for an empty group rather than throwing", () => {
    expect(coverOf(group("g1"), [])).toBeNull();
  });
});

describe("reordering", () => {
  it("moves an item forwards and backwards", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("is a no-op for an unchanged or invalid index", () => {
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 9, 0)).toEqual(["a", "b"]);
  });

  it("writes only the rows whose position actually changed", () => {
    const items: ShelfItem[] = [
      { kind: "design", key: "a", sortOrder: 1, design: design("a") },
      { kind: "design", key: "b", sortOrder: 1, design: design("b") },
      { kind: "design", key: "c", sortOrder: 2, design: design("c") },
    ];
    // b is already at index 1 and c at index 2, so only a is rewritten.
    expect(orderWrites(items)).toEqual([{ kind: "design", id: "a", sortOrder: 0 }]);
  });

  it("tags a group write as a group so the right table is updated", () => {
    const items: ShelfItem[] = [
      { kind: "group", key: "g1", sortOrder: 5, group: group("g1"), designs: [design("a")] },
    ];
    expect(orderWrites(items)).toEqual([{ kind: "group", id: "g1", sortOrder: 0 }]);
  });

  it("writes member order only where it differs", () => {
    const writes = memberOrderWrites(
      [design("a"), design("b")],
      membership([
        ["a", "g1", 0],
        ["b", "g1", 5],
      ]),
    );
    expect(writes).toEqual([{ kind: "design", id: "b", sortOrder: 1 }]);
  });
});

describe("drop intent", () => {
  const a: ShelfItem = { kind: "design", key: "a", sortOrder: 0, design: design("a") };
  const b: ShelfItem = { kind: "design", key: "b", sortOrder: 1, design: design("b") };
  const g: ShelfItem = { kind: "group", key: "g1", sortOrder: 2, group: group("g1"), designs: [design("c")] };

  it("groups two designs when one is dropped onto the other", () => {
    expect(dropIntent(a, b, 1, "onto")).toEqual({ type: "group-with", targetKey: "b" });
  });

  it("adds to an existing group when dropped onto one", () => {
    expect(dropIntent(a, g, 2, "onto")).toEqual({ type: "add-to-group", groupId: "g1" });
  });

  it("reorders when dropped on the leading edge", () => {
    expect(dropIntent(a, b, 1, "before")).toEqual({ type: "reorder", toIndex: 1 });
  });

  it("never nests a group inside a group", () => {
    expect(dropIntent(g, b, 1, "onto")).toEqual({ type: "reorder", toIndex: 1 });
  });

  it("ignores a drop on itself or with nothing dragged", () => {
    expect(dropIntent(a, a, 0, "onto")).toEqual({ type: "none" });
    expect(dropIntent(null, a, 0, "onto")).toEqual({ type: "none" });
  });
});

describe("group naming", () => {
  it("uses a real design title", () => {
    expect(suggestGroupName("Darnell Mooney", design("a", { title: "Mooney World Logo" }))).toBe("Mooney World Logo");
  });

  it("falls back when the title is a generator filename", () => {
    expect(suggestGroupName("Darnell Mooney", design("a", { title: "ChatGPT Image Aug 16, 2026" }))).toBe(
      "Darnell Mooney — new group",
    );
    expect(suggestGroupName(null, design("a", { title: "IMG_2841" }))).toBe("New group");
  });
});
