import { describe, expect, it } from "vitest";
import { addChip, binLabel, binOf, indexAfterRemoval, keyAction, toReviewItem } from "./content-review";
import { sectionOf } from "./studio-nav";

describe("content review", () => {
  it("maps keys to decisions", () => {
    expect(keyAction("A")).toBe("approve");
    expect(keyAction("f")).toBe("fix");
    expect(keyAction("x")).toBe("archive");
    expect(keyAction("z")).toBe("undo");
    expect(keyAction("ArrowRight")).toBe("next");
    expect(keyAction("q")).toBeNull();
  });
  it("adds a quick note once", () => {
    expect(addChip("", "Logo placement")).toBe("Logo placement");
    expect(addChip("Logo placement", "Crop / framing")).toBe("Logo placement, Crop / framing");
    expect(addChip("logo placement", "Logo placement")).toBe("logo placement");
  });
  it("stays on the same slot after a decision, or the last one", () => {
    expect(indexAfterRemoval(2, 5)).toBe(2);
    expect(indexAfterRemoval(4, 4)).toBe(3);
    expect(indexAfterRemoval(0, 0)).toBe(0);
  });
  it("sorts pieces into client and AX bins", () => {
    expect(binOf({ athleteId: "p1", category: "model" })).toBe("p1");
    expect(binOf({ athleteId: null, category: "website" })).toBe("ax:website");
    expect(binLabel("ax:world-tour", new Map())).toBe("AX · World Tour");
    expect(binLabel("p1", new Map([["p1", "Proactive"]]))).toBe("Proactive");
  });
  it("reads a row", () => {
    const i = toReviewItem({ id: 1, title: "T", hero_url: "https://x", type: "photo", review_state: "needs_fix", review_note: "Crop", media: [{ drive_file_id: "d", folder: "A / B" }] });
    expect(i).toMatchObject({ id: "1", state: "needs_fix", note: "Crop", driveFileId: "d", folder: "A / B" });
  });
  it("lights up Releases", () => {
    expect(sectionOf("/admin-v2/review")).toBe("releases");
  });
});
