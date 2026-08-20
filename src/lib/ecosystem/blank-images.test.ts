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
