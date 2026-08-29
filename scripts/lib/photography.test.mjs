import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  classifyView,
  colorsWithoutImages,
  driveThumbUrl,
  inferGarmentType,
  keyOf,
  parseStyleFolder,
  prettyName,
} from "./photography.mjs";

describe("prettyName", () => {
  it("turns a Drive folder name into something readable", () => {
    expect(prettyName("VINTAGE_WOOD_CAMO")).toBe("Vintage Wood Camo");
    expect(prettyName("SPECIAL HOODIE 14 OZ")).toBe("Special Hoodie 14 OZ");
  });

  it("keeps weight units upper-case", () => {
    expect(prettyName("HEAVY CREW 15 OZ")).toBe("Heavy Crew 15 OZ");
  });

  it("preserves the supplier's own spelling rather than correcting it", () => {
    // AXISM's README documents "Sulpher Brown". Correcting it would put the
    // catalog out of step with the supplier.
    expect(prettyName("Sulpher_Brown")).toBe("Sulpher Brown");
  });

  it("is safe for nothing", () => {
    expect(prettyName(null)).toBe("");
    expect(prettyName("")).toBe("");
  });
});

describe("parseStyleFolder", () => {
  it("splits AXISM's code-first naming", () => {
    expect(parseStyleFolder("7010 — DRI EASE OVERSIZED TEE")).toMatchObject({
      styleCode: "7010",
      name: "DRI EASE OVERSIZED TEE",
    });
  });

  it("handles a plain hyphen as well as an em dash", () => {
    expect(parseStyleFolder("5102 - WOMENS CROP HOODIE 10 OZ").styleCode).toBe("5102");
  });

  it("leaves a name-only folder without inventing a style code", () => {
    // An invented code would match nothing in Shopify and look authoritative.
    expect(parseStyleFolder("SPECIAL HOODIE 14 OZ")).toMatchObject({
      styleCode: null,
      name: "SPECIAL HOODIE 14 OZ",
    });
  });
});

describe("classifyView", () => {
  it("reads the plain surfaces", () => {
    expect(classifyView("FRONT")).toMatchObject({ viewType: "front", isPrimary: true });
    expect(classifyView("Back")).toMatchObject({ viewType: "back", isPrimary: true });
  });

  it("makes hood-down the canonical back and keeps hood-up as secondary", () => {
    expect(classifyView("BACK_HOOD_DOWN")).toMatchObject({ viewType: "back", variant: "hood_down", isPrimary: true });
    expect(classifyView("BACK_HOOD_UP")).toMatchObject({ viewType: "back", variant: "hood_up", isPrimary: false });
  });

  it("degrades to the right surface for an unknown variant", () => {
    expect(classifyView("BACK_SOMETHING_NEW").viewType).toBe("back");
  });

  it("returns no surface for a folder that is not a view", () => {
    expect(classifyView("CONTACT_SHEETS").viewType).toBeNull();
  });
});

describe("inferGarmentType", () => {
  it("recognises the range", () => {
    expect(inferGarmentType("SPECIAL HOODIE 14 OZ")).toBe("hoodie");
    expect(inferGarmentType("HEAVY CREW 15 OZ")).toBe("crewneck");
    expect(inferGarmentType("OVERSIZED BOX S-S TEE 7.5 OZ")).toBe("tee");
    expect(inferGarmentType("BAGGY PANT 12.5 OZ")).toBe("sweatpants");
    expect(inferGarmentType("5-Panel Trucker Hat")).toBe("hat");
  });

  it("prefers zip hoodie over hoodie when both could match", () => {
    expect(inferGarmentType("FULL ZIP UP HOOD 10 OZ")).toBe("zip_hoodie");
  });

  it("returns null rather than defaulting, so an oddity is visible", () => {
    expect(inferGarmentType("MYSTERY ITEM")).toBeNull();
    expect(inferGarmentType(null)).toBeNull();
  });
});

describe("driveThumbUrl", () => {
  it("builds a renderable public URL", () => {
    expect(driveThumbUrl("ABC123")).toBe("https://drive.google.com/thumbnail?id=ABC123&sz=w1600");
  });
});

/* ------------------------------------------------------------- buildCatalog */

const entry = (style, color, view, fileId, supplier = "COTTON COLLECTIVE") => ({
  supplier: { id: `sup-${supplier}`, title: supplier },
  styleFolder: { id: `style-${style}`, title: style },
  colorFolder: { id: `color-${style}-${color}`, title: color },
  viewFolder: { id: `view-${style}-${color}-${view}`, title: view },
  file: { id: fileId, title: `${fileId}.png`, mimeType: "image/png", modifiedTime: "2026-08-21T00:00:00Z" },
});

describe("buildCatalog", () => {
  it("creates a blank per style folder, named as the Drive names it", () => {
    const cat = buildCatalog([entry("SPECIAL HOODIE 14 OZ", "AQUA", "FRONT", "f1")]);
    expect(cat.blanks).toHaveLength(1);
    expect(cat.blanks[0]).toMatchObject({
      name: "SPECIAL HOODIE 14 OZ",
      style_code: null,
      supplier: "Cotton Collective",
      garment_type: "hoodie",
      drive_folder_id: "style-SPECIAL HOODIE 14 OZ",
    });
  });

  it("keeps the style code when the folder carries one", () => {
    const cat = buildCatalog([entry("7010 — DRI EASE OVERSIZED TEE", "BLACK", "FRONT", "f1", "AXISM")]);
    expect(cat.blanks[0]).toMatchObject({ style_code: "7010", name: "DRI EASE OVERSIZED TEE", garment_type: "tee" });
  });

  it("stores the colour verbatim and a readable version alongside", () => {
    const cat = buildCatalog([entry("S", "VINTAGE_WOOD_CAMO", "FRONT", "f1")]);
    expect(cat.colors[0]).toMatchObject({ name: "VINTAGE_WOOD_CAMO", display_name: "Vintage Wood Camo" });
  });

  it("does not create a second blank for a second colour of the same style", () => {
    const cat = buildCatalog([
      entry("S", "AQUA", "FRONT", "f1"),
      entry("S", "SAND", "FRONT", "f2"),
    ]);
    expect(cat.blanks).toHaveLength(1);
    expect(cat.colors).toHaveLength(2);
  });

  it("identifies a blank by folder id, so a rename updates rather than duplicates", () => {
    const a = entry("OLD NAME", "AQUA", "FRONT", "f1");
    const b = { ...entry("NEW NAME", "AQUA", "FRONT", "f2"), styleFolder: a.styleFolder };
    const cat = buildCatalog([a, b]);
    expect(cat.blanks).toHaveLength(1);
  });

  it("collects every view of a colourway", () => {
    const cat = buildCatalog([
      entry("S", "AQUA", "FRONT", "f1"),
      entry("S", "AQUA", "BACK_HOOD_DOWN", "b1"),
      entry("S", "AQUA", "BACK_HOOD_UP", "b2"),
    ]);
    expect(cat.images).toHaveLength(3);
    expect(cat.images.filter((i) => i.view_type === "back")).toHaveLength(2);
    expect(cat.images.filter((i) => i.is_primary).map((i) => i.drive_file_id).sort()).toEqual(["b1", "f1"]);
  });

  it("skips folders that are not views and reports them", () => {
    const cat = buildCatalog([entry("S", "AQUA", "CONTACT_SHEETS", "x1")]);
    expect(cat.images).toHaveLength(0);
    expect(cat.skippedViews).toHaveLength(1);
    // The colourway still exists — it just has no usable photograph yet.
    expect(cat.colors).toHaveLength(1);
  });

  it("orders colourways alphabetically per blank, stably between runs", () => {
    const cat = buildCatalog([
      entry("S", "SAND", "FRONT", "f1"),
      entry("S", "AQUA", "FRONT", "f2"),
      entry("S", "MAHOGANY", "FRONT", "f3"),
    ]);
    expect(cat.colors.map((c) => c.display_name)).toEqual(["Aqua", "Mahogany", "Sand"]);
    expect(cat.colors.map((c) => c.sort_order)).toEqual([0, 1, 2]);
  });

  it("restarts colour ordering per blank", () => {
    const cat = buildCatalog([
      entry("S1", "SAND", "FRONT", "f1"),
      entry("S2", "AQUA", "FRONT", "f2"),
      entry("S2", "ZINC", "FRONT", "f3"),
    ]);
    const byBlank = new Map();
    for (const c of cat.colors) {
      if (!byBlank.has(c.blank_drive_folder_id)) byBlank.set(c.blank_drive_folder_id, []);
      byBlank.get(c.blank_drive_folder_id).push(c.sort_order);
    }
    for (const orders of byBlank.values()) expect(orders[0]).toBe(0);
  });

  it("never carries commerce data — Shopify owns that", () => {
    const cat = buildCatalog([entry("S", "AQUA", "FRONT", "f1")]);
    expect(cat.blanks[0]).not.toHaveProperty("cost");
    expect(cat.blanks[0]).not.toHaveProperty("price");
    expect(cat.colors[0]).not.toHaveProperty("quantity");
  });
});

describe("colorsWithoutImages", () => {
  it("finds colourways that have no usable photograph", () => {
    const cat = buildCatalog([
      entry("S", "AQUA", "FRONT", "f1"),
      entry("S", "SAND", "CONTACT_SHEETS", "x1"),
    ]);
    expect(colorsWithoutImages(cat).map((c) => c.display_name)).toEqual(["Sand"]);
  });

  it("is empty when everything is shot", () => {
    expect(colorsWithoutImages(buildCatalog([entry("S", "AQUA", "FRONT", "f1")]))).toEqual([]);
  });
});

describe("keyOf", () => {
  it("brings folder spellings together for de-duplication", () => {
    expect(keyOf("VINTAGE_WOOD_CAMO")).toBe(keyOf("Vintage Wood Camo"));
  });
});
