import { describe, expect, it } from "vitest";
import {
  colorSlug,
  coveragePercent,
  groupBySku,
  matchFilesToColors,
  parseFileName,
  skuFromPath,
  normalizeUrl,
  hostOf,
  planPhotoMove,
  type ColorRow,
} from "./blank-images";

function fakeFile(name: string, path?: string): File {
  const f = new File([new Uint8Array([1])], name, { type: "image/png" });
  if (path) Object.defineProperty(f, "webkitRelativePath", { value: path });
  return f;
}

describe("colorSlug", () => {
  it("collapses the ways a colour gets written", () => {
    for (const v of ["Grey Heather", "grey-heather", "GreyHeather", "GREY_HEATHER", "  Grey  Heather "]) {
      expect(colorSlug(v)).toBe("greyheather");
    }
  });
});

describe("parseFileName", () => {
  it("reads the cleaned convention", () => {
    expect(parseFileName("greyheather.png")).toMatchObject({ colorSlug: "greyheather", surface: "front" });
    expect(parseFileName("greyheather-back.png")).toMatchObject({ colorSlug: "greyheather", surface: "back" });
  });

  it("reads the raw vendor convention", () => {
    expect(parseFileName("7102-Grey-Heather b.png", ["7102"])).toMatchObject({
      colorSlug: "greyheather", surface: "back", stylePrefix: "7102",
    });
    expect(parseFileName("7102-Grey-Heather (Flat Lay).png", ["7102"])).toMatchObject({
      colorSlug: "greyheather", surface: "front",
    });
  });

  it("strips a leading style number even when it wasn't declared", () => {
    expect(parseFileName("5102-Pink b.png")).toMatchObject({ colorSlug: "pink", surface: "back", stylePrefix: "5102" });
  });

  it("keeps digits that are part of the colour, not a style code", () => {
    // No separator after the digits, so it is not a style prefix.
    expect(parseFileName("74navy.png").colorSlug).toBe("74navy");
  });

  it("ignores duplicate-export suffixes", () => {
    expect(parseFileName("5102-Ecru b 2.png").colorSlug).toBe("ecru");
    expect(parseFileName("7102-Royal (Flat Lay) 2.png")).toMatchObject({ colorSlug: "royal", surface: "front" });
    expect(parseFileName("black (1).png").colorSlug).toBe("black");
  });

  it("recognises the several ways of saying back", () => {
    for (const n of ["sand-back.png", "sand_back.png", "sand b.png", "sand back.png"]) {
      expect(parseFileName(n)).toMatchObject({ colorSlug: "sand", surface: "back" });
    }
  });

  it("does not mistake a front marker for part of the colour", () => {
    expect(parseFileName("bone front.png")).toMatchObject({ colorSlug: "bone", surface: "front" });
  });
});

const colors: ColorRow[] = [
  { id: "c1", blank_id: "b", color_name: "Grey Heather", image_url: null, image_url_back: null },
  { id: "c2", blank_id: "b", color_name: "Sand", image_url: "https://x/sand.png", image_url_back: null },
];

describe("matchFilesToColors", () => {
  it("matches on the squashed slug", () => {
    const r = matchFilesToColors([fakeFile("grey-heather.png")], colors);
    expect(r.matched).toHaveLength(1);
    expect(r.matched[0].color?.id).toBe("c1");
    expect(r.unmatched).toHaveLength(0);
  });

  it("separates files with no colourway to land on", () => {
    const r = matchFilesToColors([fakeFile("chartreuse.png")], colors);
    expect(r.matched).toHaveLength(0);
    expect(r.unmatched[0].colorSlug).toBe("chartreuse");
  });

  it("flags a file that would overwrite an existing photo", () => {
    const r = matchFilesToColors([fakeFile("sand.png"), fakeFile("sand-back.png")], colors);
    const front = r.matched.find((m) => m.surface === "front");
    const back = r.matched.find((m) => m.surface === "back");
    expect(front?.replaces).toBe(true);
    expect(back?.replaces).toBe(false);
  });

  it("reports what the drop still does not cover", () => {
    const r = matchFilesToColors([fakeFile("grey-heather.png")], colors);
    // Grey Heather back, and Sand back — Sand front already exists.
    expect(r.stillMissing).toEqual([
      { color_name: "Grey Heather", surface: "back" },
      { color_name: "Sand", surface: "back" },
    ]);
  });

  it("is empty-safe", () => {
    const r = matchFilesToColors([], []);
    expect(r).toEqual({ matched: [], unmatched: [], stillMissing: [] });
  });
});

describe("skuFromPath", () => {
  it("finds the SKU folder a file sat in", () => {
    expect(skuFromPath(fakeFile("black.png", "clean/AX-HOOD-03/black.png"))).toBe("AX-HOOD-03");
  });

  it("uppercases a lowercase folder", () => {
    expect(skuFromPath(fakeFile("black.png", "ax-tee-06/black.png"))).toBe("AX-TEE-06");
  });

  it("is null when there is no SKU-shaped folder", () => {
    expect(skuFromPath(fakeFile("black.png", "_unzipped/black.png"))).toBeNull();
    expect(skuFromPath(fakeFile("black.png"))).toBeNull();
  });
});

describe("groupBySku", () => {
  it("splits a directory drop into per-blank piles", () => {
    const g = groupBySku([
      fakeFile("a.png", "clean/AX-HOOD-03/a.png"),
      fakeFile("b.png", "clean/AX-HOOD-03/b.png"),
      fakeFile("c.png", "clean/AX-TEE-06/c.png"),
      fakeFile("d.png"),
    ]);
    expect(g.get("AX-HOOD-03")).toHaveLength(2);
    expect(g.get("AX-TEE-06")).toHaveLength(1);
    expect(g.get(null)).toHaveLength(1);
  });
});

describe("coveragePercent", () => {
  const base = { id: "b", sku: null, style_number: null, name: "x", garment_type: null, url: null };

  it("counts both surfaces as the target", () => {
    expect(coveragePercent({ ...base, colorways: 10, haveFront: 10, haveBack: 10 })).toBe(100);
    expect(coveragePercent({ ...base, colorways: 10, haveFront: 10, haveBack: 0 })).toBe(50);
  });

  it("does not divide by zero on a blank with no colourways", () => {
    expect(coveragePercent({ ...base, colorways: 0, haveFront: 0, haveBack: 0 })).toBe(0);
  });
});

describe("normalizeUrl", () => {
  it("keeps a full URL", () => {
    expect(normalizeUrl("https://ottocap.com/products/31-069")).toBe("https://ottocap.com/products/31-069");
  });

  it("adds a scheme to a bare domain, which is how links usually get pasted", () => {
    // Without this the stored value resolves against our own site.
    expect(normalizeUrl("ottocap.com/products/31-069")).toBe("https://ottocap.com/products/31-069");
    expect(normalizeUrl("www.ottocap.com")).toBe("https://www.ottocap.com/");
  });

  it("trims surrounding whitespace from a paste", () => {
    expect(normalizeUrl("  https://ottocap.com  ")).toBe("https://ottocap.com/");
  });

  it("rejects things that are not addresses", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
    expect(normalizeUrl("just some words")).toBeNull();
    expect(normalizeUrl("localhost")).toBeNull();
  });
});

describe("hostOf", () => {
  it("gives a short label for the link", () => {
    expect(hostOf("https://www.ottocap.com/products/31-069")).toBe("ottocap.com");
    expect(hostOf("https://comfortcolors.com/x")).toBe("comfortcolors.com");
  });

  it("is null-safe", () => {
    expect(hostOf(null)).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });
});

describe("planPhotoMove", () => {
  const rows: ColorRow[] = [
    { id: "sand", blank_id: "b", color_name: "Sand", image_url: "F_sand", image_url_back: "B_sand" },
    { id: "bone", blank_id: "b", color_name: "Bone", image_url: null, image_url_back: null },
  ];

  it("swaps front and back on one row in a SINGLE patch", () => {
    // Two separate updates to the same row would clobber each other — the
    // second write would overwrite the first with a stale value.
    const patches = planPhotoMove(rows, { colorId: "sand", surface: "front" }, { colorId: "sand", surface: "back" });
    expect(patches).toHaveLength(1);
    expect(patches[0]).toEqual({ colorId: "sand", image_url_back: "F_sand", image_url: "B_sand" });
  });

  it("moves a photo to an empty slot on another colourway", () => {
    const patches = planPhotoMove(rows, { colorId: "sand", surface: "front" }, { colorId: "bone", surface: "front" });
    expect(patches).toEqual([
      { colorId: "bone", image_url: "F_sand" },
      { colorId: "sand", image_url: null },
    ]);
  });

  it("swaps across colourways when the target is occupied", () => {
    const occupied: ColorRow[] = [
      rows[0],
      { id: "bone", blank_id: "b", color_name: "Bone", image_url: "F_bone", image_url_back: null },
    ];
    const patches = planPhotoMove(occupied, { colorId: "sand", surface: "front" }, { colorId: "bone", surface: "front" });
    expect(patches).toEqual([
      { colorId: "bone", image_url: "F_sand" },
      { colorId: "sand", image_url: "F_bone" },
    ]);
  });

  it("does nothing when dropped on itself", () => {
    expect(planPhotoMove(rows, { colorId: "sand", surface: "front" }, { colorId: "sand", surface: "front" })).toEqual([]);
  });

  it("does nothing when the source slot is empty", () => {
    expect(planPhotoMove(rows, { colorId: "bone", surface: "front" }, { colorId: "sand", surface: "front" })).toEqual([]);
  });

  it("is safe when a slot references a colour that isn't loaded", () => {
    expect(planPhotoMove(rows, { colorId: "ghost", surface: "front" }, { colorId: "sand", surface: "front" })).toEqual([]);
  });
});

describe("matching past a vendor code prefix", () => {
  // The real AX-BAG-01 drop: every file carries a code we can't enumerate,
  // so all nine landed in "needs a colour" before suffix matching.
  const bagColors: ColorRow[] = [
    "Black Cheetah", "Black Camo", "Black Checker Strap", "Cheetah",
    "Forest Camo", "Polka Dot", "Black", "Southwest", "Tiger Camo",
  ].map((color_name, i) => ({
    id: `c${i}`, blank_id: "bag", color_name, image_url: null, image_url_back: null,
  }));

  function matchOne(name: string) {
    const r = matchFilesToColors([fakeFile(name)], bagColors);
    return r.matched[0]?.color?.color_name ?? null;
  }

  it("finds the colour after an alphabetic code", () => {
    expect(matchOne("BCHT-Black-Cheetah.png")).toBe("Black Cheetah");
    expect(matchOne("BKCH-Black-Checker-Strap.png")).toBe("Black Checker Strap");
    expect(matchOne("FCMO-Forest-Camo.png")).toBe("Forest Camo");
    expect(matchOne("PDOT-Polka-Dot.png")).toBe("Polka Dot");
    expect(matchOne("RBK-Black.png")).toBe("Black");
  });

  it("prefers the longest colour when one name contains another", () => {
    // "BCHT-Black-Cheetah" ends with both "cheetah" and "blackcheetah".
    expect(matchOne("BCHT-Black-Cheetah.png")).toBe("Black Cheetah");
    expect(matchOne("CHTA-Cheetah.png")).toBe("Cheetah");
    expect(matchOne("BCMO-Black-Camo.png")).toBe("Black Camo");
  });

  it("marks a fragment match so it can be shown differently", () => {
    const r = matchFilesToColors([fakeFile("BCHT-Black-Cheetah.png"), fakeFile("Southwest.png")], bagColors);
    const byName = Object.fromEntries(r.matched.map((m) => [m.fileName, m.confidence]));
    expect(byName["BCHT-Black-Cheetah.png"]).toBe("suffix");
    expect(byName["Southwest.png"]).toBe("exact");
  });

  it("names the stored file after the colourway, not the vendor code", () => {
    const r = matchFilesToColors([fakeFile("BKCH-Black-Checker-Strap.png")], bagColors);
    expect(r.matched[0].colorSlug).toBe("blackcheckerstrap");
  });

  it("still refuses a file with no colour in it", () => {
    const r = matchFilesToColors([fakeFile("IMG_4821.png")], bagColors);
    expect(r.matched).toHaveLength(0);
    expect(r.unmatched).toHaveLength(1);
  });

  it("will not match on a fragment shorter than four characters", () => {
    // Guards against a code prefix accidentally being read as a colour.
    const shortColors: ColorRow[] = [
      { id: "x", blank_id: "b", color_name: "Red", image_url: null, image_url_back: null },
    ];
    const r = matchFilesToColors([fakeFile("ABCRED.png")], shortColors);
    expect(r.matched).toHaveLength(0);
  });

  it("resolves the whole nine-file drop", () => {
    const names = [
      "BCHT-Black-Cheetah.png", "BCMO-Black-Camo.png", "BKCH-Black-Checker-Strap.png",
      "CHTA-Cheetah.png", "FCMO-Forest-Camo.png", "PDOT-Polka-Dot.png",
      "RBK-Black.png", "SW-Southwest.png", "TCMO-Tiger-Camo.png",
    ];
    const r = matchFilesToColors(names.map((n) => fakeFile(n)), bagColors);
    expect(r.matched).toHaveLength(9);
    expect(r.unmatched).toHaveLength(0);
  });
});
