import { describe, expect, it } from "vitest";
import {
  DRAFT_VERSION,
  describeAge,
  draftKey,
  isMeaningful,
  parseDraft,
  type MockupDraft,
} from "./mockup-draft";

const draft = (over: Partial<MockupDraft> = {}): MockupDraft => ({
  version: DRAFT_VERSION,
  entityId: "e1",
  savedAt: "2026-08-31T12:00:00.000Z",
  flow: "design_first",
  step: "placement",
  designId: "d1",
  blankId: "b1",
  colorName: "Cool Blue",
  extraColors: ["Sand"],
  extraBlanks: {},
  placed: [],
  guides: { front: { x: 50, y: 34 } },
  surface: "front",
  title: "Mooney hoodie",
  notes: "",
  collectionId: "",
  ...over,
});

describe("draftKey", () => {
  it("is scoped to the entity, so two people's drafts cannot collide", () => {
    expect(draftKey("e1")).not.toBe(draftKey("e2"));
    expect(draftKey("e1")).toContain("e1");
  });
});

describe("isMeaningful — opening the builder and closing it leaves nothing", () => {
  it("says no to an untouched wizard", () => {
    expect(isMeaningful({ designId: null, blankId: null, placed: [], title: "", notes: "" })).toBe(false);
    expect(isMeaningful({ designId: null, blankId: null, placed: [], title: "   ", notes: "  " })).toBe(false);
  });

  it("says yes once a real decision exists", () => {
    expect(isMeaningful({ designId: "d1", blankId: null, placed: [], title: "", notes: "" })).toBe(true);
    expect(isMeaningful({ designId: null, blankId: "b1", placed: [], title: "", notes: "" })).toBe(true);
    expect(isMeaningful({ designId: null, blankId: null, placed: [], title: "Idea", notes: "" })).toBe(true);
  });
});

describe("parseDraft", () => {
  it("round-trips a real draft", () => {
    const d = draft();
    expect(parseDraft(JSON.parse(JSON.stringify(d)), "e1")).toEqual(d);
  });

  it("refuses a draft from another entity", () => {
    expect(parseDraft(draft(), "someone-else")).toBeNull();
  });

  it("discards an older shape rather than migrating it", () => {
    expect(parseDraft({ ...draft(), version: 1 }, "e1")).toBeNull();
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, 7, "nope", [], {}]) {
      expect(parseDraft(junk, "e1")).toBeNull();
    }
  });

  it("repairs individual fields instead of rejecting the whole draft", () => {
    const out = parseDraft(
      { ...draft(), step: "not-a-step", surface: "sideways", extraColors: ["Sand", 4, null], flow: "sideways" },
      "e1",
    );
    expect(out?.step).toBe("flow");
    expect(out?.surface).toBe("front");
    expect(out?.extraColors).toEqual(["Sand"]);
    expect(out?.flow).toBeNull();
  });

  it("returns nothing for a draft with nothing in it", () => {
    expect(parseDraft(draft({ designId: null, blankId: null, placed: [], title: "", notes: "" }), "e1")).toBeNull();
  });
});

describe("describeAge", () => {
  const at = (iso: string) => new Date(iso);
  it("reads as a person would say it", () => {
    expect(describeAge("2026-08-31T12:00:00Z", at("2026-08-31T12:00:20Z"))).toBe("a moment ago");
    expect(describeAge("2026-08-31T12:00:00Z", at("2026-08-31T12:03:00Z"))).toBe("3 minutes ago");
    expect(describeAge("2026-08-31T12:00:00Z", at("2026-08-31T13:01:00Z"))).toBe("1 hour ago");
    expect(describeAge("2026-08-31T12:00:00Z", at("2026-09-02T12:00:00Z"))).toBe("2 days ago");
  });

  it("does not go negative when clocks disagree", () => {
    expect(describeAge("2026-08-31T12:00:00Z", at("2026-08-31T11:00:00Z"))).toBe("a moment ago");
  });

  it("says something for an unparseable timestamp", () => {
    expect(describeAge("not a date")).toBe("earlier");
  });
});
