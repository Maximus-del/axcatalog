import { describe, expect, it } from "vitest";
import {
  parseLibraryPath,
  planStorage,
  readLibraryDrop,
  storableField,
  prettyColorName,
  viewOf,
  type LibraryView,
} from "./library-import";
import type { ColorRow } from "./blank-images";

function file(relativePath: string): File {
  const name = relativePath.split("/").pop() ?? relativePath;
  const f = new File([new Uint8Array([1])], name, { type: "image/png" });
  Object.defineProperty(f, "webkitRelativePath", { value: relativePath, configurable: true });
  return f;
}

function color(name: string, id = name): ColorRow {
  return { id, blank_id: "b1", color_name: name, image_url: null, image_url_back: null };
}

describe("viewOf", () => {
  it("reads every view the library uses", () => {
    const cases: [string, LibraryView][] = [
      ["FRONT", "front"],
      ["Front", "front"],
      ["BACK", "back"],
      ["BACK_HOOD_UP", "back_hood_up"],
      ["BACK_HOOD_DOWN", "back_hood_down"],
      ["SIDE_45", "side_45"],
      ["SIDE_90", "side_90"],
    ];
    for (const [token, view] of cases) expect(viewOf(token)).toBe(view);
  });

  it("keeps hood views away from the plain back slot", () => {
    // The bug this exists to prevent: BACK_HOOD_UP contains "back", so a naive
    // back-marker test files hood-up and hood-down as the same view and one
    // silently overwrites the other.
    expect(viewOf("AXISM_7395_BLACK_BACK_HOOD_UP_CLEAN.png")).toBe("back_hood_up");
    expect(viewOf("AXISM_7395_BLACK_BACK_HOOD_DOWN_CLEAN.png")).toBe("back_hood_down");
    expect(viewOf("AXISM_7395_BLACK_BACK_CLEAN.png")).toBe("back");
  });

  it("says nothing rather than guessing", () => {
    expect(viewOf("BLACK")).toBeNull();
    expect(viewOf("7395 — OVERSIZED HEAVY HOODIE 12 OZ")).toBeNull();
  });
});

describe("parseLibraryPath", () => {
  it("reads the real hoodie layout", () => {
    expect(parseLibraryPath("7395 — OVERSIZED HEAVY HOODIE 12 OZ/BLACK/BACK_HOOD_DOWN/AXISM_7395_BLACK_BACK_HOOD_DOWN_CLEAN.png"))
      .toEqual({ colorFolder: "BLACK", view: "back_hood_down" });
  });

  it("reads a colour folder dragged on its own", () => {
    expect(parseLibraryPath("JET_BLACK/FRONT/COTTON_COLLECTIVE_JET_BLACK_FRONT_CLEAN.png"))
      .toEqual({ colorFolder: "JET_BLACK", view: "front" });
  });

  it("handles the tee layout, where view folders are title case", () => {
    expect(parseLibraryPath("AXISM_7010_COMPLETE_CLEAN/Almond/Front/7010 Almond FRONT clean.png"))
      .toEqual({ colorFolder: "Almond", view: "front" });
  });

  it("falls back to the filename when there is no view folder", () => {
    expect(parseLibraryPath("BLACK/AXISM_7395_BLACK_FRONT_CLEAN.png"))
      .toEqual({ colorFolder: "BLACK", view: "front" });
  });

  it("returns null for a flat drop, so the old parser still gets its turn", () => {
    expect(parseLibraryPath("7102-Grey-Heather.png")).toBeNull();
    expect(parseLibraryPath("loose/7102-Grey-Heather.png")).toBeNull();
  });

  it("is not fooled by a two-word supplier in the filename", () => {
    // COTTON_COLLECTIVE has an underscore, so no style-number strip finds the
    // colour. The folder does.
    const p = parseLibraryPath("HEAVY CREW 15 OZ/BRIGHT_WHITE/FRONT/COTTON_COLLECTIVE_BRIGHT_WHITE_FRONT_CLEAN.png");
    expect(p?.colorFolder).toBe("BRIGHT_WHITE");
  });
});

describe("readLibraryDrop", () => {
  const colors = [color("Jet Black"), color("Bright White"), color("Cub")];

  it("matches colour folders to colourways however they are punctuated", () => {
    const r = readLibraryDrop(
      [file("PANT/JET_BLACK/FRONT/a.png"), file("PANT/Bright White/FRONT/b.png")],
      colors,
    );
    expect(r.matched.map((m) => m.color.color_name).sort()).toEqual(["Bright White", "Jet Black"]);
    expect(r.newColors).toHaveLength(0);
  });

  it("reports a colour the library has and the database does not", () => {
    const r = readLibraryDrop([file("HOODIE/VINTAGE_SUNFLOWER/FRONT/a.png")], colors);
    expect(r.matched).toHaveLength(0);
    expect(r.newColors).toEqual([
      { colorFolder: "VINTAGE_SUNFLOWER", colorSlug: "vintagesunflower", views: ["front"] },
    ]);
  });

  it("collects every view of a new colour under one entry", () => {
    const r = readLibraryDrop(
      [file("H/SUNFLOWER/FRONT/a.png"), file("H/SUNFLOWER/BACK_HOOD_UP/b.png")],
      colors,
    );
    expect(r.newColors[0].views).toEqual(["front", "back_hood_up"]);
  });

  it("names the colourways the library has nothing for", () => {
    const r = readLibraryDrop([file("P/JET_BLACK/FRONT/a.png")], colors);
    expect(r.missingColors.map((c) => c.color_name).sort()).toEqual(["Bright White", "Cub"]);
  });

  it("hands non-library files back rather than swallowing them", () => {
    const r = readLibraryDrop([file("7102-Grey-Heather.png")], colors);
    expect(r.unparsed).toHaveLength(1);
    expect(r.matched).toHaveLength(0);
  });
});

describe("storableField", () => {
  it("puts front and back where the schema can hold them", () => {
    expect(storableField("front")).toBe("image_url");
    expect(storableField("back")).toBe("image_url_back");
    expect(storableField("back_hood_down")).toBe("image_url_back");
  });

  it("admits that the other three views have nowhere to go yet", () => {
    // Two URL columns, six views. This is the honest answer until the images
    // table lands, and the caller must report it rather than drop the files.
    expect(storableField("back_hood_up")).toBeNull();
    expect(storableField("side_45")).toBeNull();
    expect(storableField("side_90")).toBeNull();
  });
});

describe("planStorage", () => {
  const black = color("Jet Black", "c1");

  const matched = (view: LibraryView, c = black) => ({
    file: file(`X/${c.color_name}/${view}/a.png`),
    colorFolder: c.color_name,
    colorSlug: "jetblack",
    view,
    color: c,
  });

  it("stores front and parks hood-up", () => {
    const plan = planStorage([matched("front"), matched("back_hood_up")]);
    expect(plan.storable.map((s) => s.view)).toEqual(["front"]);
    expect(plan.parked).toEqual([{ view: "back_hood_up", count: 1 }]);
  });

  it("gives the back slot to hood-down, not to whichever file came first", () => {
    // Order reversed on purpose: the decision must not depend on iteration.
    const plan = planStorage([matched("back"), matched("back_hood_down")]);
    expect(plan.storable.map((s) => s.view)).toEqual(["back_hood_down"]);
    expect(plan.parked).toEqual([{ view: "back", count: 1 }]);
  });

  it("never writes two files to one field", () => {
    const plan = planStorage([matched("front"), matched("front"), matched("back")]);
    const keys = plan.storable.map((s) => `${s.color.id}:${s.field}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps colours independent of each other", () => {
    const white = color("Bright White", "c2");
    const plan = planStorage([matched("front"), matched("front", white)]);
    expect(plan.storable).toHaveLength(2);
    expect(plan.parked).toHaveLength(0);
  });

  it("counts parked files by view so the report can name them", () => {
    const plan = planStorage([
      matched("back_hood_up"),
      matched("back_hood_up", color("Bright White", "c2")),
      matched("side_45"),
    ]);
    expect(plan.parked).toEqual([
      { view: "back_hood_up", count: 2 },
      { view: "side_45", count: 1 },
    ]);
  });
});

describe("prettyColorName", () => {
  it("turns a folder name into something a person would write", () => {
    expect(prettyColorName("VINTAGE_SUNFLOWER")).toBe("Vintage Sunflower");
    expect(prettyColorName("BLUE_HAZE_OIL_WASH")).toBe("Blue Haze Oil Wash");
    expect(prettyColorName("Jet Black")).toBe("Jet Black");
    expect(prettyColorName("STRING-TAN")).toBe("String Tan");
  });
});
