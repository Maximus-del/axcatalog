import { describe, expect, it } from "vitest";
import {
  buildMockupShelf,
  coverOf,
  dropIntent,
  memberOrderWrites,
  moveItem,
  orderWrites,
  searchMockups,
  suggestFolderName,
  type MockupShelfItem,
} from "./mockup-shelf";
import type { Mockup, MockupFolder } from "./types";

const mockup = (id: string, over: Partial<Mockup> = {}): Mockup => ({
  id,
  title: `Mockup ${id}`,
  entityId: "e1",
  organizationId: "o1",
  blankId: "b1",
  blankName: "Garment-Wash Hoodie 14oz",
  colorName: "Aqua",
  imageUrl: "img",
  imageBucket: null,
  imagePath: null,
  folderId: null,
  sortOrder: 0,
  status: "draft",
  lifecycle: "bin",
  approvalState: "none",
  clientVisible: false,
  productId: null,
  collectionId: null,
  guides: {},
  surfaces: ["front"],
  placementCount: 1,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const folder = (id: string, over: Partial<MockupFolder> = {}): MockupFolder => ({
  id,
  name: "Drop",
  entityId: "e1",
  sortOrder: 0,
  coverMockupId: null,
  ...over,
});

describe("buildMockupShelf", () => {
  it("puts folders above loose mockups regardless of sort order", () => {
    const shelf = buildMockupShelf(
      [mockup("a", { sortOrder: 0 }), mockup("b", { folderId: "f1" }), mockup("c", { sortOrder: 2 })],
      [folder("f1", { sortOrder: 5 })],
    );
    expect(shelf.map((i) => i.key)).toEqual(["f1", "a", "c"]);
    expect(shelf[0].kind).toBe("folder");
  });

  it("hides a folder with no members, so emptying one cleans it up", () => {
    const shelf = buildMockupShelf([mockup("a")], [folder("f1")]);
    expect(shelf.map((i) => i.key)).toEqual(["a"]);
  });

  it("orders members inside a folder by their own sort order", () => {
    const shelf = buildMockupShelf(
      [mockup("a", { folderId: "f1", sortOrder: 2 }), mockup("b", { folderId: "f1", sortOrder: 0 })],
      [folder("f1")],
    );
    const f = shelf[0];
    expect(f.kind === "folder" && f.mockups.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("keeps each band's ordering independent", () => {
    const shelf = buildMockupShelf(
      [mockup("a", { sortOrder: 1 }), mockup("b", { sortOrder: 0 }), mockup("z", { folderId: "f1" })],
      [folder("f1", { sortOrder: 3 })],
    );
    expect(shelf.map((i) => i.key)).toEqual(["f1", "b", "a"]);
  });
});

describe("coverOf", () => {
  it("uses the first member when no cover is set", () => {
    expect(coverOf(folder("f1"), [mockup("a"), mockup("b")])?.id).toBe("a");
  });

  it("honours an explicit cover", () => {
    expect(coverOf(folder("f1", { coverMockupId: "b" }), [mockup("a"), mockup("b")])?.id).toBe("b");
  });

  it("falls back when the explicit cover is no longer a member", () => {
    expect(coverOf(folder("f1", { coverMockupId: "gone" }), [mockup("a")])?.id).toBe("a");
  });

  it("is null for an empty folder", () => {
    expect(coverOf(folder("f1"), [])).toBeNull();
  });
});

describe("orderWrites", () => {
  const item = (key: string, kind: "folder" | "mockup", sortOrder: number): MockupShelfItem =>
    kind === "folder"
      ? { kind, key, sortOrder, folder: folder(key, { sortOrder }), mockups: [mockup("x")] }
      : { kind, key, sortOrder, mockup: mockup(key, { sortOrder }) };

  it("only writes rows whose position actually changed", () => {
    expect(orderWrites([item("a", "mockup", 0), item("b", "mockup", 5)])).toEqual([
      { kind: "mockup", id: "b", sortOrder: 1 },
    ]);
  });

  it("numbers folders and mockups independently", () => {
    const writes = orderWrites([item("f1", "folder", 3), item("a", "mockup", 3)]);
    expect(writes).toEqual([
      { kind: "folder", id: "f1", sortOrder: 0 },
      { kind: "mockup", id: "a", sortOrder: 0 },
    ]);
  });

  it("creating a folder does not renumber the mockups below it", () => {
    // Both bands start at 0, so adding a folder cannot shift the loose band.
    const before = orderWrites([item("a", "mockup", 0), item("b", "mockup", 1)]);
    const after = orderWrites([item("f1", "folder", 0), item("a", "mockup", 0), item("b", "mockup", 1)]);
    expect(before).toEqual([]);
    expect(after).toEqual([]);
  });
});

describe("memberOrderWrites", () => {
  it("renumbers only what moved", () => {
    expect(memberOrderWrites([mockup("a", { sortOrder: 0 }), mockup("b", { sortOrder: 5 })])).toEqual([
      { kind: "mockup", id: "b", sortOrder: 1 },
    ]);
  });
});

describe("dropIntent", () => {
  const m = (key: string): MockupShelfItem => ({ kind: "mockup", key, sortOrder: 0, mockup: mockup(key) });
  const f = (key: string): MockupShelfItem => ({
    kind: "folder", key, sortOrder: 0, folder: folder(key), mockups: [mockup("x")],
  });

  it("reorders when dropped before an item", () => {
    expect(dropIntent(m("a"), m("b"), 2, "before")).toEqual({ type: "reorder", toIndex: 2 });
  });

  it("groups two mockups dropped onto each other", () => {
    expect(dropIntent(m("a"), m("b"), 1, "onto")).toEqual({ type: "group-with", targetKey: "b" });
  });

  it("adds to a folder when dropped onto one", () => {
    expect(dropIntent(m("a"), f("f1"), 0, "onto")).toEqual({ type: "add-to-folder", folderId: "f1" });
  });

  it("never nests folders", () => {
    expect(dropIntent(f("f1"), f("f2"), 1, "onto")).toEqual({ type: "reorder", toIndex: 1 });
  });

  it("does nothing when dropped on itself", () => {
    expect(dropIntent(m("a"), m("a"), 0, "onto")).toEqual({ type: "none" });
  });
});

describe("suggestFolderName", () => {
  it("uses the first mockup's name, which operators actually type", () => {
    expect(suggestFolderName(mockup("a", { title: "Mooney World Hoodie" }))).toBe("Mooney World Hoodie");
  });

  it("does not propagate a placeholder name", () => {
    expect(suggestFolderName(mockup("a", { title: "Untitled mockup" }))).toBe("New folder");
    expect(suggestFolderName(mockup("a", { title: "   " }))).toBe("New folder");
  });
});

describe("searchMockups", () => {
  const list = [
    mockup("a", { title: "Globe Hoodie", colorName: "Aqua", blankName: "Garment-Wash Hoodie 14oz" }),
    mockup("b", { title: "Left Chest Tee", colorName: "Sand", blankName: "Oversized Heavyweight Tee" }),
  ];

  it("matches on title", () => {
    expect(searchMockups(list, "globe").map((m) => m.id)).toEqual(["a"]);
  });

  it("matches on colour and blank, which is how people actually look", () => {
    expect(searchMockups(list, "sand").map((m) => m.id)).toEqual(["b"]);
    expect(searchMockups(list, "oversized").map((m) => m.id)).toEqual(["b"]);
  });

  it("is case and whitespace insensitive", () => {
    expect(searchMockups(list, "  AQUA ").map((m) => m.id)).toEqual(["a"]);
  });

  it("returns everything for an empty query", () => {
    expect(searchMockups(list, "")).toHaveLength(2);
  });
});

describe("moveItem", () => {
  it("moves without changing length", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("is a no-op for an out-of-range index", () => {
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});
