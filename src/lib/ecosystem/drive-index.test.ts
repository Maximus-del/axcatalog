import { describe, expect, it } from "vitest";
import {
  coloursMissingImages,
  matchProduct,
  normalizeColor,
  normalizeName,
  planRescan,
  previewImage,
  productFoldersIn,
  productNameOf,
  styleNumberOf,
  viewTypeOf,
  viewsFor,
  type DriveImage,
} from "./drive-index";

function img(over: Partial<DriveImage> = {}): DriveImage {
  return {
    manufacturer: "AXISM",
    productFolder: "7601 — FULL ZIP UP HOOD 10 OZ",
    productFolderId: "pf1",
    color: "BLACK",
    colorFolderId: "cf1",
    viewFolderId: "vf1",
    viewType: "FRONT",
    fileId: "file1",
    filename: "AXISM_7601_BLACK_FRONT_CLEAN.png",
    mimeType: "image/png",
    driveUrl: "https://drive.google.com/file/d/file1/view",
    modifiedAt: "2026-08-21T00:00:00Z",
    ...over,
  };
}

describe("normalising names", () => {
  it("handles the em dash the library actually uses", () => {
    // "7601 — FULL ZIP UP HOOD" has an em dash, not a hyphen. A comparison
    // that treats it as a word character matches nothing at all.
    expect(normalizeName("7601 — FULL ZIP UP HOOD 10 OZ")).toBe("7601 FULL ZIP UP HOOD 10 OZ");
  });

  it("flattens case, underscores and repeated spaces", () => {
    expect(normalizeName("special_hoodie   14  oz")).toBe("SPECIAL HOODIE 14 OZ");
    expect(normalizeName(" Oversized-Box S/S Tee ")).toBe("OVERSIZED BOX S S TEE");
  });

  it("compares colours with punctuation gone entirely", () => {
    expect(normalizeColor("VINTAGE_BLACK")).toBe("VINTAGEBLACK");
    expect(normalizeColor("Vintage Black")).toBe(normalizeColor("VINTAGE-BLACK"));
    expect(normalizeColor("Blue Haze Oil Wash")).toBe("BLUEHAZEOILWASH");
  });
});

describe("style numbers", () => {
  it("takes a leading style number", () => {
    expect(styleNumberOf("7601 — FULL ZIP UP HOOD 10 OZ")).toBe("7601");
    expect(styleNumberOf("CCHOD475 GARMENT WASH HOODIE")).toBe("CCHOD475");
    // Real vendor codes run long and can carry a trailing suffix.
    expect(styleNumberOf("PRM4600QZ PIGMENT DYE QUARTER ZIP")).toBe("PRM4600QZ");
    expect(styleNumberOf("SS4500 HEAVYWEIGHT HOODIE")).toBe("SS4500");
  });

  it("does not mistake a weight for a style number", () => {
    // "OVERSIZED BOX S-S TEE 7.5 OZ" must not yield 7.5 — the number is not
    // leading, and a weight is not an identifier.
    expect(styleNumberOf("OVERSIZED BOX S-S TEE 7.5 OZ")).toBeNull();
    expect(styleNumberOf("HEAVY CREW 15 OZ")).toBeNull();
  });

  it("strips the style number off the name", () => {
    expect(productNameOf("7601 — FULL ZIP UP HOOD 10 OZ")).toBe("FULL ZIP UP HOOD 10 OZ");
    expect(productNameOf("SPECIAL HOODIE 14 OZ")).toBe("SPECIAL HOODIE 14 OZ");
  });
});

describe("view folders", () => {
  it("reads every standardised view", () => {
    for (const [folder, want] of [
      ["FRONT", "FRONT"], ["Front", "FRONT"], ["BACK_HOOD_UP", "BACK_HOOD_UP"],
      ["back hood down", "BACK_HOOD_DOWN"], ["FRONT_ANGLE", "FRONT_ANGLE"],
      ["LEFT_SIDE", "LEFT_SIDE"], ["BACK_POCKET", "BACK_POCKET"], ["DETAIL", "DETAIL"],
    ] as const) {
      expect(viewTypeOf(folder)).toBe(want);
    }
  });

  it("refuses anything it does not recognise instead of guessing", () => {
    expect(viewTypeOf("BLACK")).toBeNull();
    expect(viewTypeOf("MISC")).toBeNull();
  });
});

describe("matching a product to a folder", () => {
  const folders = productFoldersIn([
    img(),
    img({ productFolder: "7010 — DRI EASE OVERSIZED TEE", productFolderId: "pf2" }),
    img({ manufacturer: "COTTON COLLECTIVE", productFolder: "HEAVY CREW 15 OZ", productFolderId: "pf3" }),
    img({ manufacturer: "COTTON COLLECTIVE", productFolder: "SPECIAL HOODIE 14 OZ", productFolderId: "pf4" }),
  ]);

  it("matches on manufacturer and style number first", () => {
    const r = matchProduct({ manufacturer: "Axism", styleNumber: "7010", title: "Whatever" }, folders);
    expect(r).toMatchObject({ status: "matched", folderId: "pf2", via: "style_number" });
  });

  it("falls back to the normalised product name", () => {
    const r = matchProduct(
      { manufacturer: "cotton collective", styleNumber: null, title: "Heavy  Crew 15 oz" },
      folders,
    );
    expect(r).toMatchObject({ status: "matched", folderId: "pf3", via: "product_name" });
  });

  it("never matches across manufacturers", () => {
    // AXISM has 7010; Cotton Collective does not. Same style number, wrong maker.
    const r = matchProduct({ manufacturer: "COTTON COLLECTIVE", styleNumber: "7010", title: "x" }, folders);
    expect(r.status).toBe("no_match");
  });

  it("asks a human when a partial name matches, even a single one", () => {
    // "HEAVY CREW" is contained in "HEAVY CREW 15 OZ". Suggestive, not proof.
    const r = matchProduct({ manufacturer: "COTTON COLLECTIVE", styleNumber: null, title: "Heavy Crew" }, folders);
    expect(r.status).toBe("image_match_required");
    expect(r.candidates.map((c) => c.productFolderId)).toEqual(["pf3"]);
  });

  it("asks a human when two folders are equally plausible", () => {
    const dupes = productFoldersIn([
      img({ manufacturer: "AXISM", productFolder: "7010 TEE A", productFolderId: "a" }),
      img({ manufacturer: "AXISM", productFolder: "7010 TEE B", productFolderId: "b" }),
    ]);
    const r = matchProduct({ manufacturer: "AXISM", styleNumber: "7010", title: "Tee" }, dupes);
    expect(r.status).toBe("image_match_required");
    expect(r.candidates).toHaveLength(2);
    expect(r.folderId).toBeNull();
  });

  it("a confirmed mapping wins over everything and is never recomputed", () => {
    // Automatic matching must not overwrite a decision a person already made,
    // even when the automatic answer would differ.
    const r = matchProduct(
      { manufacturer: "AXISM", styleNumber: "7010", title: "x", confirmedFolderId: "pf-manual" },
      folders,
    );
    expect(r).toMatchObject({ status: "confirmed", folderId: "pf-manual", via: "manual" });
  });

  it("reports no match rather than a wrong one", () => {
    expect(matchProduct({ manufacturer: "SHAKA WEAR", styleNumber: "999", title: "x" }, folders).status)
      .toBe("no_match");
    expect(matchProduct({ manufacturer: null, styleNumber: null, title: "x" }, folders).status)
      .toBe("no_match");
  });
});

describe("10: a hoodie keeps its three views apart", () => {
  const hoodie = [
    img({ viewType: "FRONT", fileId: "f" }),
    img({ viewType: "BACK_HOOD_DOWN", fileId: "d" }),
    img({ viewType: "BACK_HOOD_UP", fileId: "u" }),
  ];

  it("exposes all three for the colour", () => {
    expect(viewsFor(hoodie, "pf1", "BLACK").map((i) => i.viewType).sort())
      .toEqual(["BACK_HOOD_DOWN", "BACK_HOOD_UP", "FRONT"]);
  });

  it("shows the front as the preview", () => {
    expect(previewImage(hoodie, "pf1", "Black")?.fileId).toBe("f");
  });

  it("never lets hood-up stand in as the plain back", () => {
    const views = viewsFor(hoodie, "pf1", "BLACK");
    expect(views.find((v) => v.viewType === "BACK")).toBeUndefined();
    expect(views.filter((v) => v.viewType === "BACK_HOOD_UP")).toHaveLength(1);
  });
});

describe("preview priority", () => {
  it("prefers FRONT, then FRONT_ANGLE, then anything", () => {
    expect(previewImage([img({ viewType: "DETAIL", fileId: "d" }), img({ viewType: "FRONT", fileId: "f" })], "pf1", "BLACK")?.fileId).toBe("f");
    expect(previewImage([img({ viewType: "DETAIL", fileId: "d" }), img({ viewType: "FRONT_ANGLE", fileId: "a" })], "pf1", "BLACK")?.fileId).toBe("a");
    expect(previewImage([img({ viewType: "DETAIL", fileId: "d" })], "pf1", "BLACK")?.fileId).toBe("d");
  });

  it("matches the colour however it is punctuated", () => {
    const set = [img({ color: "VINTAGE_BLACK" })];
    expect(previewImage(set, "pf1", "Vintage Black")).not.toBeNull();
  });
});

describe("9: a product folder where one colour has no images", () => {
  const set = [img({ color: "BLACK" }), img({ color: "SAND", fileId: "f2", colorFolderId: "cf2" })];

  it("names the colours with nothing", () => {
    expect(coloursMissingImages(set, "pf1", ["Black", "Sand", "Cub"])).toEqual(["Cub"]);
  });

  it("returns null rather than borrowing another colour's photo", () => {
    // Showing the customer the right garment in the wrong colour is worse than
    // showing nothing.
    expect(previewImage(set, "pf1", "Cub")).toBeNull();
  });
});

describe("11: a Drive file is renamed but keeps its id", () => {
  const stored = [
    { drive_file_id: "file1", filename: "OLD_NAME.png", modified_at: "2026-08-20T00:00:00Z" },
  ];

  it("updates in place instead of deleting and re-adding", () => {
    const plan = planRescan([img({ fileId: "file1", filename: "NEW_NAME.png", modifiedAt: "2026-08-21T00:00:00Z" })], stored);
    expect(plan.added).toHaveLength(0);
    expect(plan.missing).toHaveLength(0);
    expect(plan.updated).toHaveLength(1);
    expect(plan.updated[0].to.filename).toBe("NEW_NAME.png");
  });

  it("does not duplicate a file it has seen before", () => {
    const plan = planRescan([img({ fileId: "file1", filename: "OLD_NAME.png", modifiedAt: "2026-08-20T00:00:00Z" })], stored);
    expect(plan.added).toHaveLength(0);
    expect(plan.updated).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("marks a vanished file missing rather than deleting it", () => {
    const plan = planRescan([], stored);
    expect(plan.missing.map((m) => m.drive_file_id)).toEqual(["file1"]);
  });

  it("does not re-report something already marked missing", () => {
    const plan = planRescan([], [{ ...stored[0], missing: true }]);
    expect(plan.missing).toHaveLength(0);
  });

  it("un-marks a file that has come back", () => {
    const plan = planRescan([img({ fileId: "file1", filename: "OLD_NAME.png", modifiedAt: "2026-08-20T00:00:00Z" })],
      [{ ...stored[0], missing: true }]);
    expect(plan.updated).toHaveLength(1);
  });

  it("adds files it has never seen", () => {
    const plan = planRescan([img({ fileId: "file9" })], stored);
    expect(plan.added.map((a) => a.fileId)).toEqual(["file9"]);
    expect(plan.missing.map((m) => m.drive_file_id)).toEqual(["file1"]);
  });
});
