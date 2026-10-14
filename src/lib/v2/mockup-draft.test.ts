import { describe, expect, it } from "vitest";
import {
  DRAFT_VERSION,
  describeAge,
  draftKey,
  isMeaningful,
  parseDraft,
  type MockupDraft,
} from "./mockup-draft";
import { newProduct } from "./studio-session";

const draft = (over: Partial<MockupDraft> = {}): MockupDraft => ({
  version: DRAFT_VERSION,
  entityId: "e1",
  savedAt: "2026-08-31T12:00:00.000Z",
  flow: "design_first",
  step: "placement",
  designId: "d1",
  products: [newProduct({ blankId: "b1", colorName: "Cool Blue", key: "k1" })],
  activeKey: "k1",
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
  it("says no to an untouched studio", () => {
    expect(isMeaningful({ designId: null, products: [], title: "", notes: "" })).toBe(false);
    expect(isMeaningful({ designId: null, products: [], title: "   ", notes: "  " })).toBe(false);
  });

  it("says yes once a real decision exists", () => {
    expect(isMeaningful({ designId: "d1", products: [], title: "", notes: "" })).toBe(true);
    expect(isMeaningful({ designId: null, products: [newProduct({ blankId: "b1" })], title: "", notes: "" })).toBe(true);
    expect(isMeaningful({ designId: null, products: [], title: "Idea", notes: "" })).toBe(true);
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
    const out = parseDraft({ ...draft(), step: "not-a-step", surface: "sideways", flow: "sideways" }, "e1");
    expect(out?.step).toBe("flow");
    expect(out?.surface).toBe("front");
    expect(out?.flow).toBeNull();
  });

  it("drops a product that is not shaped like one rather than restoring a stub", () => {
    // A half-parsed arrangement would put artwork somewhere nobody chose.
    const out = parseDraft({ ...draft(), products: [{ key: "k" }, "nope", null] }, "e1");
    expect(out?.products).toEqual([]);
  });

  it("keeps each product's own placement, which is the whole point", () => {
    const hoodie = newProduct({ blankId: "hoodie", key: "h" });
    const pants = newProduct({ blankId: "pants", key: "p" });
    const out = parseDraft({ ...draft(), products: [hoodie, pants] }, "e1");
    expect(out?.products.map((x) => x.blankId)).toEqual(["hoodie", "pants"]);
  });

  it("returns nothing for a draft with nothing in it", () => {
    expect(parseDraft(draft({ designId: null, products: [], title: "", notes: "" }), "e1")).toBeNull();
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

describe("a draft written by an older build", () => {
  it("is discarded, because the version moved", () => {
    expect(parseDraft({ ...draft(), version: 3 }, "e1")).toBeNull();
  });

  it("fills in a product missing fields the current build reads", () => {
    // Exactly the shape that crashed: no overrides, no saved.
    const legacy = { key: "k", blankId: "b1", masterColor: "Cream", colorNames: ["Cream"], placed: [], guides: {} };
    const out = parseDraft({ ...draft(), products: [legacy] }, "e1");
    expect(out?.products[0].overrides).toEqual({});
    expect(out?.products[0].saved).toEqual([]);
  });

  it("keeps a product's own arrangement and overrides when they are there", () => {
    const full = {
      key: "k",
      blankId: "b1",
      masterColor: "Cream",
      colorNames: ["Cream", "Shadow"],
      placed: [],
      overrides: { Shadow: [] },
      guides: {},
      saved: ["Cream"],
    };
    const out = parseDraft({ ...draft(), products: [full] }, "e1");
    expect(Object.keys(out?.products[0].overrides ?? {})).toEqual(["Shadow"]);
    expect(out?.products[0].saved).toEqual(["Cream"]);
  });

  it("drops junk in the products array without losing the good ones", () => {
    const good = { key: "k", blankId: "b1", placed: [] };
    const out = parseDraft({ ...draft(), products: [good, "nope", null, { key: "no-blank" }] }, "e1");
    expect(out?.products).toHaveLength(1);
    expect(out?.products[0].key).toBe("k");
  });
});
