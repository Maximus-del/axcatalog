import { describe, expect, it } from "vitest";
import {
  buildPlan,
  classifyView,
  driveThumbUrl,
  matchBlank,
  nameKey,
  normalizeColor,
  parseStyleFolder,
  planColorCache,
  prettyColor,
} from "./photography.mjs";

describe("normalizeColor", () => {
  it("brings the three spellings of one colour together", () => {
    for (const v of ["VINTAGE_WOOD_CAMO", "Vintage Wood Camo", "vintage-wood-camo", "  Vintage  Wood Camo "]) {
      expect(normalizeColor(v)).toBe("vintage wood camo");
    }
  });

  it("preserves the supplier's own spelling rather than correcting it", () => {
    // AXISM's README explicitly documents "Sulpher Brown". The database stores
    // the same. Correcting it here would break the match.
    expect(normalizeColor("Sulpher_Brown")).toBe("sulpher brown");
  });

  it("is empty and safe for nothing", () => {
    expect(normalizeColor(null)).toBe("");
    expect(normalizeColor(undefined)).toBe("");
    expect(normalizeColor("")).toBe("");
  });
});

describe("prettyColor", () => {
  it("turns a folder name into something a human reads", () => {
    expect(prettyColor("YELLOW_PEACH_GREEN_BLACK")).toBe("Yellow Peach Green Black");
    expect(prettyColor("aqua")).toBe("Aqua");
  });
});

describe("classifyView", () => {
  it("reads the plain surfaces", () => {
    expect(classifyView("FRONT")).toEqual({ viewType: "front", variant: null, isPrimary: true });
    expect(classifyView("Back")).toEqual({ viewType: "back", variant: null, isPrimary: true });
  });

  it("makes hood-down the canonical back", () => {
    // Hood-up hides the top third of the print area, which is exactly where
    // artwork is placed.
    expect(classifyView("BACK_HOOD_DOWN")).toEqual({ viewType: "back", variant: "hood_down", isPrimary: true });
  });

  it("keeps hood-up as a secondary back rather than discarding it", () => {
    const out = classifyView("BACK_HOOD_UP");
    expect(out.viewType).toBe("back");
    expect(out.isPrimary).toBe(false);
  });

  it("degrades to the right surface for an unknown variant", () => {
    expect(classifyView("BACK_SOMETHING_NEW").viewType).toBe("back");
    expect(classifyView("FRONT_ANGLED").viewType).toBe("front");
  });

  it("returns no surface for a folder that is not a view at all", () => {
    expect(classifyView("CONTACT_SHEETS").viewType).toBeNull();
    expect(classifyView("").viewType).toBeNull();
  });
});

describe("parseStyleFolder", () => {
  it("splits AXISM's number-first naming", () => {
    expect(parseStyleFolder("7010 — DRI EASE OVERSIZED TEE")).toMatchObject({
      styleNumber: "7010",
      name: "DRI EASE OVERSIZED TEE",
    });
  });

  it("handles a plain hyphen as well as an em dash", () => {
    expect(parseStyleFolder("5102 - WOMENS CROP HOODIE 10 OZ").styleNumber).toBe("5102");
  });

  it("leaves Cotton Collective's name-only folders without a fake number", () => {
    expect(parseStyleFolder("SPECIAL HOODIE 14 OZ")).toMatchObject({
      styleNumber: null,
      name: "SPECIAL HOODIE 14 OZ",
    });
  });
});

describe("matchBlank", () => {
  const blanks = [
    { id: "a", name: "Oversized Heavyweight Tee", style_number: "7010" },
    { id: "b", name: "Garment-Wash Hoodie 14oz", style_number: "CCHOD475" },
    { id: "c", name: "Standard Hoodie 11oz", style_number: "CCHOD376" },
  ];

  it("trusts the style number above everything", () => {
    const out = matchBlank({ styleNumber: "7010", name: "SOMETHING ELSE ENTIRELY" }, blanks);
    expect(out.blank?.id).toBe("a");
    expect(out.via).toBe("style_number");
  });

  it("is case-insensitive about style numbers", () => {
    expect(matchBlank({ styleNumber: "cchod475", name: "x" }, blanks).blank?.id).toBe("b");
  });

  it("refuses to guess when a name is ambiguous", () => {
    // "HOODIE" is inside two blank names; guessing would attach one supplier's
    // photography to another's garment.
    const out = matchBlank({ styleNumber: null, name: "HOODIE" }, blanks);
    expect(out.blank).toBeNull();
    expect(out.via).toBe("ambiguous_name_contains");
  });

  it("matches an unambiguous name", () => {
    expect(matchBlank({ styleNumber: null, name: "Standard Hoodie 11 oz" }, blanks).blank?.id).toBe("c");
  });

  it("returns no match rather than a wrong one", () => {
    expect(matchBlank({ styleNumber: null, name: "Snapback Cap" }, blanks).blank).toBeNull();
  });

  it("cannot connect a supplier folder name to a different catalog name", () => {
    // The real case that forced stored bindings to exist.
    const out = matchBlank({ styleNumber: null, name: "SPECIAL HOODIE 14 OZ" }, blanks);
    expect(out.blank).toBeNull();
  });

  it("uses a stored binding above everything else", () => {
    const bound = [{ id: "z", name: "Anything", style_number: "ZZZ", drive_product_folder_id: "folder-1" }];
    const out = matchBlank({ styleNumber: null, name: "SPECIAL HOODIE 14 OZ", folderId: "folder-1" }, bound);
    expect(out.blank?.id).toBe("z");
    expect(out.via).toBe("stored_binding");
  });
});

describe("nameKey", () => {
  it("ignores weight units and punctuation", () => {
    expect(nameKey("Garment-Wash Hoodie 14oz")).toBe(nameKey("GARMENT WASH HOODIE 14"));
  });
});

describe("driveThumbUrl", () => {
  it("builds a renderable public URL", () => {
    expect(driveThumbUrl("ABC123")).toBe("https://drive.google.com/thumbnail?id=ABC123&sz=w1600");
  });
});

/* --------------------------------------------------------------- buildPlan */

const blanks = [
  {
    id: "hoodie",
    name: "Garment-Wash Hoodie 14oz",
    style_number: "CCHOD475",
    // The real binding: this Drive folder is named "SPECIAL HOODIE 14 OZ",
    // which matches nothing about the catalog name. A human said so once.
    drive_product_folder_id: "s1",
    colors: [{ id: "c1", color_name: "Aqua" }, { id: "c2", color_name: "Jet Black" }],
  },
];

// The folder id is derived from the title so that a different style is a
// different folder — otherwise every fixture would inherit the hoodie's stored
// binding and "unmatched" could never be exercised.
const entry = (color, view, fileId, styleTitle = "SPECIAL HOODIE 14 OZ") => ({
  styleFolder: { id: styleTitle === "SPECIAL HOODIE 14 OZ" ? "s1" : `folder-${styleTitle}`, title: styleTitle },
  colorFolder: { id: `cf-${color}`, title: color },
  viewFolder: { id: `vf-${color}-${view}`, title: view },
  file: { id: fileId, title: `${fileId}.png`, mimeType: "image/png", modifiedTime: "2026-08-21T00:00:00Z" },
});

describe("buildPlan", () => {
  it("produces rows for matched styles and colours", () => {
    const plan = buildPlan(
      [entry("AQUA", "FRONT", "f1"), entry("AQUA", "BACK_HOOD_DOWN", "b1")],
      blanks,
    );
    expect(plan.images).toHaveLength(2);
    expect(plan.images[0]).toMatchObject({
      blank_id: "hoodie",
      color: "Aqua",
      normalized_color: "aqua",
      view_type: "front",
      drive_file_id: "f1",
      matched_color: true,
    });
  });

  it("uses the DATABASE's spelling of a matched colour, not the folder's", () => {
    const plan = buildPlan([entry("JET_BLACK", "FRONT", "f2")], blanks);
    expect(plan.images[0].color).toBe("Jet Black");
  });

  it("never invents a blank — an unmatched style is reported and skipped", () => {
    const plan = buildPlan([entry("AQUA", "FRONT", "f3", "MYSTERY PONCHO")], blanks);
    expect(plan.images).toHaveLength(0);
    expect(plan.unmatchedStyles).toEqual([
      { style: "MYSTERY PONCHO", folderId: "folder-MYSTERY PONCHO", reason: "no_match" },
    ]);
  });

  it("still records a photo whose colour is not in the database, and flags it", () => {
    // The Drive genuinely has colourways the catalog does not (Vintage
    // Sunflower). Dropping them silently would lose real photography.
    const plan = buildPlan([entry("VINTAGE_SUNFLOWER", "FRONT", "f4")], blanks);
    expect(plan.images).toHaveLength(1);
    expect(plan.images[0].matched_color).toBe(false);
    expect(plan.unmatchedColors).toEqual([{ blank: "Garment-Wash Hoodie 14oz", color: "Vintage Sunflower" }]);
  });

  it("skips folders that are not views and says which", () => {
    const plan = buildPlan([entry("AQUA", "CONTACT_SHEETS", "f5")], blanks);
    expect(plan.images).toHaveLength(0);
    expect(plan.skippedViews).toEqual([{ blank: "Garment-Wash Hoodie 14oz", folder: "CONTACT_SHEETS" }]);
  });

  it("reports each unmatched style once, however many files it has", () => {
    const plan = buildPlan(
      [entry("A", "FRONT", "x1", "MYSTERY"), entry("B", "FRONT", "x2", "MYSTERY")],
      blanks,
    );
    expect(plan.unmatchedStyles).toHaveLength(1);
  });
});

describe("planColorCache", () => {
  it("derives one front and one back per colourway", () => {
    const plan = buildPlan([entry("AQUA", "FRONT", "f1"), entry("AQUA", "BACK_HOOD_DOWN", "b1")], blanks);
    const cache = planColorCache(plan.images);
    expect(cache).toHaveLength(1);
    expect(cache[0]).toMatchObject({
      blank_id: "hoodie",
      normalized_color: "aqua",
      front: driveThumbUrl("f1"),
      back: driveThumbUrl("b1"),
    });
  });

  it("prefers hood-down over hood-up for the back, whatever order they arrive in", () => {
    const plan = buildPlan(
      [entry("AQUA", "BACK_HOOD_UP", "up"), entry("AQUA", "BACK_HOOD_DOWN", "down")],
      blanks,
    );
    expect(planColorCache(plan.images)[0].back).toBe(driveThumbUrl("down"));
  });

  it("excludes colourways the catalog does not have, since there is no row to cache onto", () => {
    const plan = buildPlan([entry("VINTAGE_SUNFLOWER", "FRONT", "f9")], blanks);
    expect(planColorCache(plan.images)).toHaveLength(0);
  });
});
