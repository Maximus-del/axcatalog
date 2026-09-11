import { describe, expect, it } from "vitest";
import {
  CLIENT_PREVIEW_BUCKET,
  groupShelf,
  mapShelf,
  mapShelfRow,
  shelfState,
  type ClientShelfRow,
} from "./client-designs";

function row(over: Partial<ClientShelfRow> = {}): ClientShelfRow {
  return {
    design_id: "d1",
    title: "MWRLD Barb",
    design_number: "A1B2C3",
    group_id: "g1",
    group_name: "Mooney World",
    sort_order: 0,
    preview_paths: ["previews/d1-01.jpg"],
    ...over,
  };
}

describe("mapShelfRow", () => {
  it("maps a full row", () => {
    const d = mapShelfRow(row());
    expect(d).toEqual({
      id: "d1",
      title: "MWRLD Barb",
      designNumber: "A1B2C3",
      groupId: "g1",
      groupName: "Mooney World",
      sortOrder: 0,
      previewPath: "previews/d1-01.jpg",
      previewCount: 1,
    });
  });

  it("never exposes a bucket — the shape has nowhere to put one", () => {
    const d = mapShelfRow(row()) as unknown as Record<string, unknown>;
    expect(Object.keys(d)).not.toContain("bucket");
    expect(Object.keys(d)).not.toContain("file");
    expect(JSON.stringify(d)).not.toContain("design-files");
  });

  it("falls back to a display title, never an empty string", () => {
    expect(mapShelfRow(row({ title: null })).title).toBe("Untitled design");
    expect(mapShelfRow(row({ title: "   " })).title).toBe("Untitled design");
  });

  it("treats a design with no rendered preview as previewPath null", () => {
    expect(mapShelfRow(row({ preview_paths: [] })).previewPath).toBeNull();
    expect(mapShelfRow(row({ preview_paths: null })).previewPath).toBeNull();
  });

  it("discards blank path entries rather than signing an empty path", () => {
    const d = mapShelfRow(row({ preview_paths: ["", "  ", "previews/real.jpg"] }));
    expect(d.previewPath).toBe("previews/real.jpg");
    expect(d.previewCount).toBe(1);
  });

  it("keeps the first preview when several are rendered", () => {
    const d = mapShelfRow(row({ preview_paths: ["a.jpg", "b.jpg", "c.jpg"] }));
    expect(d.previewPath).toBe("a.jpg");
    expect(d.previewCount).toBe(3);
  });

  it("normalises missing group and sort order", () => {
    const d = mapShelfRow(row({ group_id: null, group_name: null, sort_order: null }));
    expect(d.groupId).toBeNull();
    expect(d.groupName).toBeNull();
    expect(d.sortOrder).toBe(0);
  });
});

describe("mapShelf", () => {
  it("handles null and undefined", () => {
    expect(mapShelf(null)).toEqual([]);
    expect(mapShelf(undefined)).toEqual([]);
  });
});

describe("shelfState", () => {
  it("loading before the first result", () => {
    expect(shelfState(null)).toBe("loading");
  });

  it("nothing-shared when the shelf is empty", () => {
    expect(shelfState([])).toBe("nothing-shared");
  });

  it("previews-pending when shared designs have no rendered preview", () => {
    const designs = mapShelf([row({ preview_paths: [] }), row({ design_id: "d2", preview_paths: null })]);
    expect(shelfState(designs)).toBe("previews-pending");
  });

  it("ready as soon as one preview exists", () => {
    const designs = mapShelf([row({ preview_paths: [] }), row({ design_id: "d2" })]);
    expect(shelfState(designs)).toBe("ready");
  });

  it("distinguishes pending from empty — they are different messages", () => {
    expect(shelfState([])).not.toBe(shelfState(mapShelf([row({ preview_paths: [] })])));
  });
});

describe("groupShelf", () => {
  it("groups by folder and preserves order within a folder", () => {
    const designs = mapShelf([
      row({ design_id: "a", group_id: "g1", group_name: "One" }),
      row({ design_id: "b", group_id: "g2", group_name: "Two" }),
      row({ design_id: "c", group_id: "g1", group_name: "One" }),
    ]);
    const groups = groupShelf(designs);
    expect(groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(groups[0].designs.map((d) => d.id)).toEqual(["a", "c"]);
  });

  it("puts ungrouped designs last", () => {
    const designs = mapShelf([
      row({ design_id: "a", group_id: null, group_name: null }),
      row({ design_id: "b", group_id: "g1", group_name: "One" }),
    ]);
    expect(groupShelf(designs).map((g) => g.id)).toEqual(["g1", null]);
  });

  it("returns nothing for an empty shelf", () => {
    expect(groupShelf([])).toEqual([]);
  });
});

describe("CLIENT_PREVIEW_BUCKET", () => {
  it("is the preview bucket, never the production one", () => {
    expect(CLIENT_PREVIEW_BUCKET).toBe("design-previews");
    expect(CLIENT_PREVIEW_BUCKET).not.toBe("design-files");
  });
});
