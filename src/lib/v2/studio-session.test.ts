import { describe, expect, it } from "vitest";
import {
  activeProduct,
  adjustedColors,
  applyToAll,
  addProduct,
  emptySession,
  isEmptySession,
  isFullySaved,
  markSaved,
  needsPlacement,
  isAdjusted,
  newProduct,
  placementFor,
  resetToShared,
  setPlacement,
  orderedColors,
  removeProduct,
  sessionNeedsPlacement,
  sessionSize,
  sessionVariants,
  setActive,
  setMaster,
  toggleColor,
  updateActive,
  updateProduct,
} from "./studio-session";
import type { Blank } from "./types";
import type { PlacedDesign } from "./placement-geometry";

const place = (id = "x"): PlacedDesign[] => [
  { id, designId: "d1", surface: "front", box: { x: 30, y: 22, w: 40, h: 40 }, rotation: 0, zoneId: null, zoneLabel: null },
];

const blank = (id: string, name: string, colors: string[]): Blank =>
  ({
    id,
    name,
    imageUrl: "https://example.test/garment.png",
    colors: colors.map((c) => ({ id: `${id}-${c}`, name: c, hex: null, imageUrl: "https://example.test/c.png", imageUrlBack: null, available: true })),
    sizes: [],
  }) as unknown as Blank;

const hoodie = blank("hoodie", "Heavy Hoodie", ["Cream", "Black", "Shadow"]);
const pants = blank("pants", "Baggy Pant", ["Black", "Cream"]);
const blanks = new Map([
  ["hoodie", hoodie],
  ["pants", pants],
]);

function sessionWithHoodie() {
  const s = emptySession("e1");
  return addProduct(s, newProduct({ blankId: "hoodie", colorName: "Cream", placed: place(), key: "k1" }));
}

describe("a session starts empty and fills up", () => {
  it("is empty before anything is chosen", () => {
    expect(isEmptySession(emptySession("e1"))).toBe(true);
  });

  it("focuses a product as soon as it is added", () => {
    const s = sessionWithHoodie();
    expect(activeProduct(s)?.blankId).toBe("hoodie");
  });

  it("keeps the master colour selected from the start", () => {
    expect(activeProduct(sessionWithHoodie())?.colorNames).toEqual(["Cream"]);
  });
});

describe("A PLACEMENT BELONGS TO A PRODUCT", () => {
  it("does not give a newly added product the previous one's arrangement", () => {
    // The bug this whole module exists for: a hoodie's chest hit is a
    // sweatpants thigh hit.
    const s = addProduct(sessionWithHoodie(), newProduct({ blankId: "pants", colorName: "Black", key: "k2" }));
    expect(activeProduct(s)?.placed).toEqual([]);
    expect(needsPlacement(activeProduct(s)!)).toBe(true);
  });

  it("flags every product still waiting for one", () => {
    const s = addProduct(sessionWithHoodie(), newProduct({ blankId: "pants", key: "k2" }));
    expect(sessionNeedsPlacement(s).map((p) => p.blankId)).toEqual(["pants"]);
  });

  it("editing one product's placement leaves the others alone", () => {
    let s = addProduct(sessionWithHoodie(), newProduct({ blankId: "pants", colorName: "Black", placed: place("y"), key: "k2" }));
    s = updateProduct(s, "k1", (p) => ({ ...p, placed: place("changed") }));
    expect(s.products[0].placed[0].id).toBe("changed");
    expect(s.products[1].placed[0].id).toBe("y");
  });

  it("gives every colourway of ONE product that product's placement", () => {
    let s = sessionWithHoodie();
    s = updateActive(s, (p) => toggleColor(toggleColor(p, "Black"), "Shadow"));
    const variants = sessionVariants(s, blanks);
    expect(variants).toHaveLength(3);
    expect(variants.every((v) => v.placed === variants[0].placed)).toBe(true);
  });

  it("gives two products two different placements", () => {
    const s = addProduct(sessionWithHoodie(), newProduct({ blankId: "pants", colorName: "Black", placed: place("y"), key: "k2" }));
    const variants = sessionVariants(s, blanks);
    expect(variants[0].placed[0].id).toBe("x");
    expect(variants[1].placed[0].id).toBe("y");
  });
});

describe("colourways", () => {
  it("ticks and unticks", () => {
    let p = newProduct({ blankId: "hoodie", colorName: "Cream", key: "k" });
    p = toggleColor(p, "Black");
    expect(p.colorNames).toEqual(["Cream", "Black"]);
    p = toggleColor(p, "Black");
    expect(p.colorNames).toEqual(["Cream"]);
  });

  it("refuses to untick the colour the placement was judged against", () => {
    const p = toggleColor(newProduct({ blankId: "hoodie", colorName: "Cream", key: "k" }), "Cream");
    expect(p.colorNames).toEqual(["Cream"]);
  });

  it("selects a colour when it is made the master", () => {
    const p = setMaster(newProduct({ blankId: "hoodie", colorName: "Cream", key: "k" }), "Shadow");
    expect(p.masterColor).toBe("Shadow");
    expect(p.colorNames).toContain("Shadow");
  });
});

describe("what the session would save", () => {
  it("skips a product that has no placement yet", () => {
    const s = addProduct(sessionWithHoodie(), newProduct({ blankId: "pants", colorName: "Black", key: "k2" }));
    expect(sessionVariants(s, blanks).map((v) => v.blankId)).toEqual(["hoodie"]);
  });

  it("still produces one mockup for a product with no colour chosen", () => {
    const s = addProduct(emptySession("e1"), newProduct({ blankId: "hoodie", placed: place(), key: "k" }));
    const variants = sessionVariants(s, blanks);
    expect(variants).toHaveLength(1);
    expect(variants[0].colorName).toBeNull();
  });

  it("never produces the same garment and colour twice", () => {
    let s = sessionWithHoodie();
    s = updateActive(s, (p) => ({ ...p, colorNames: ["Cream", "Cream", "Black"] }));
    expect(sessionSize(s, blanks)).toBe(2);
  });

  it("marks a colourway with no photography of its own", () => {
    let s = sessionWithHoodie();
    s = updateActive(s, (p) => toggleColor(p, "Unphotographed"));
    const variant = sessionVariants(s, blanks).find((v) => v.colorName === "Unphotographed");
    // Falls back to the blank's catalogue shot, which still counts as having
    // something to render — the warning is about it not being ITS colour.
    expect(variant).toBeTruthy();
  });

  it("counts nothing for an empty session", () => {
    expect(sessionSize(emptySession("e1"), blanks)).toBe(0);
  });
});

describe("moving around the session", () => {
  it("switches which product the editor shows", () => {
    const s = setActive(addProduct(sessionWithHoodie(), newProduct({ blankId: "pants", key: "k2" })), "k1");
    expect(activeProduct(s)?.key).toBe("k1");
  });

  it("ignores a key that is not in the session", () => {
    const s = sessionWithHoodie();
    expect(setActive(s, "nope").activeKey).toBe("k1");
  });

  it("hands focus to a neighbour when the active product is removed", () => {
    const s = removeProduct(addProduct(sessionWithHoodie(), newProduct({ blankId: "pants", key: "k2" })), "k2");
    expect(s.activeKey).toBe("k1");
    expect(s.products).toHaveLength(1);
  });

  it("leaves focus alone when a different product is removed", () => {
    let s = addProduct(sessionWithHoodie(), newProduct({ blankId: "pants", key: "k2" }));
    s = setActive(s, "k2");
    s = removeProduct(s, "k1");
    expect(s.activeKey).toBe("k2");
  });

  it("empties focus when the last product goes", () => {
    expect(removeProduct(sessionWithHoodie(), "k1").activeKey).toBeNull();
  });

  it("lets the same blank appear twice with different arrangements", () => {
    const s = addProduct(sessionWithHoodie(), newProduct({ blankId: "hoodie", colorName: "Black", placed: place("second"), key: "k2" }));
    expect(s.products).toHaveLength(2);
    expect(s.products[0].placed[0].id).not.toBe(s.products[1].placed[0].id);
  });
});

describe("colourway order", () => {
  it("puts the master first, because it is the one on the canvas", () => {
    let p = newProduct({ blankId: "hoodie", colorName: "Cream", key: "k" });
    p = toggleColor(toggleColor(p, "Black"), "Shadow");
    p = setMaster(p, "Shadow");
    expect(orderedColors(p)).toEqual(["Shadow", "Cream", "Black"]);
  });

  it("handles a product with no master yet", () => {
    const p = { ...newProduct({ blankId: "hoodie", key: "k" }), colorNames: ["Black"] };
    expect(orderedColors(p)).toEqual(["Black"]);
  });
});

describe("saving mid-session does not duplicate", () => {
  it("stops offering a colourway once it has been written", () => {
    let s = sessionWithHoodie();
    s = updateActive(s, (p) => toggleColor(p, "Black"));
    expect(sessionSize(s, blanks)).toBe(2);

    s = markSaved(s, [
      { productKey: "k1", colorName: "Cream" },
      { productKey: "k1", colorName: "Black" },
    ]);
    expect(sessionSize(s, blanks)).toBe(0);
  });

  it("still offers a colourway added after the save", () => {
    let s = markSaved(sessionWithHoodie(), [{ productKey: "k1", colorName: "Cream" }]);
    s = updateActive(s, (p) => toggleColor(p, "Shadow"));
    const variants = sessionVariants(s, blanks);
    expect(variants.map((v) => v.colorName)).toEqual(["Shadow"]);
  });

  it("records a colourless save so it is not repeated either", () => {
    let s = addProduct(emptySession("e1"), newProduct({ blankId: "hoodie", placed: place(), key: "k" }));
    s = markSaved(s, [{ productKey: "k", colorName: null }]);
    expect(sessionSize(s, blanks)).toBe(0);
  });

  it("leaves other products alone", () => {
    let s = addProduct(sessionWithHoodie(), newProduct({ blankId: "pants", colorName: "Black", placed: place("y"), key: "k2" }));
    s = markSaved(s, [{ productKey: "k1", colorName: "Cream" }]);
    expect(sessionVariants(s, blanks).map((v) => v.blankId)).toEqual(["pants"]);
  });

  it("knows when a product is finished", () => {
    const s = markSaved(sessionWithHoodie(), [{ productKey: "k1", colorName: "Cream" }]);
    expect(isFullySaved(s.products[0])).toBe(true);
  });

  it("does not call a product finished while a colour is still pending", () => {
    let s = updateActive(sessionWithHoodie(), (p) => toggleColor(p, "Black"));
    s = markSaved(s, [{ productKey: "k1", colorName: "Cream" }]);
    expect(isFullySaved(s.products[0])).toBe(false);
  });
});

describe("the acceptance flow, at the model", () => {
  it("walks hoodie -> sweatpants -> tee without ever sharing a placement", () => {
    // 1-4: a hoodie in three colours, one arrangement.
    let s = emptySession("e1");
    s = addProduct(s, newProduct({ blankId: "hoodie", colorName: "Cream", placed: place("hoodie-art"), key: "h" }));
    s = updateActive(s, (p) => toggleColor(toggleColor(p, "Black"), "Shadow"));
    expect(sessionVariants(s, blanks)).toHaveLength(3);
    expect(new Set(sessionVariants(s, blanks).map((v) => v.placed[0].id))).toEqual(new Set(["hoodie-art"]));

    // 5: save.
    s = markSaved(s, sessionVariants(s, blanks).map((v) => ({ productKey: v.productKey, colorName: v.colorName })));
    expect(sessionSize(s, blanks)).toBe(0);

    // 6-8: add sweatpants. It must arrive WITHOUT the hoodie's placement.
    s = addProduct(s, newProduct({ blankId: "pants", colorName: "Black", key: "p" }));
    expect(needsPlacement(activeProduct(s)!)).toBe(true);
    expect(sessionSize(s, blanks)).toBe(0);

    // 9-10: place artwork and pick two colours.
    s = updateActive(s, (p) => ({ ...p, placed: place("pants-art") }));
    s = updateActive(s, (p) => toggleColor(p, "Cream"));
    const pants = sessionVariants(s, blanks);
    expect(pants).toHaveLength(2);
    expect(pants.every((v) => v.placed[0].id === "pants-art")).toBe(true);

    // 11: save. 21: the whole session is still there, with its history.
    s = markSaved(s, pants.map((v) => ({ productKey: v.productKey, colorName: v.colorName })));
    expect(s.products).toHaveLength(2);
    expect(s.products.every(isFullySaved)).toBe(true);
    expect(s.products[0].placed[0].id).toBe("hoodie-art");
    expect(s.products[1].placed[0].id).toBe("pants-art");
  });
});

describe("colourways can be hand-tuned, because photography is not pixel-aligned", () => {
  const base = place("shared");
  const tuned = place("tuned");

  function threeColours() {
    let s = sessionWithHoodie();
    s = updateActive(s, (p) => toggleColor(toggleColor(p, "Black"), "Shadow"));
    return s;
  }

  it("inherits the shared arrangement until a colour is adjusted", () => {
    const p = newProduct({ blankId: "hoodie", colorName: "Cream", placed: base, key: "k" });
    expect(placementFor(p, "Cream")).toBe(base);
    expect(placementFor(p, "Shadow")).toBe(base);
    expect(isAdjusted(p, "Shadow")).toBe(false);
  });

  it("sends the FIRST placement to the shared slot, so later colours inherit it", () => {
    let p = newProduct({ blankId: "hoodie", colorName: "Cream", key: "k" });
    p = setPlacement(p, "Cream", base);
    expect(p.placed).toBe(base);
    expect(p.overrides).toEqual({});
    // A colour added afterwards still gets it.
    expect(placementFor(toggleColor(p, "Shadow"), "Shadow")).toBe(base);
  });

  it("keeps every later drag local to the colour on screen", () => {
    let p = newProduct({ blankId: "hoodie", colorName: "Cream", placed: base, key: "k" });
    p = toggleColor(p, "Shadow");
    p = setPlacement(p, "Shadow", tuned);

    expect(placementFor(p, "Shadow")).toBe(tuned);
    // The one somebody already approved does not move.
    expect(placementFor(p, "Cream")).toBe(base);
    expect(isAdjusted(p, "Shadow")).toBe(true);
    expect(isAdjusted(p, "Cream")).toBe(false);
  });

  it("lists which colourways were hand-tuned", () => {
    let p = newProduct({ blankId: "hoodie", colorName: "Cream", placed: base, key: "k" });
    p = setPlacement(p, "Shadow", tuned);
    expect(adjustedColors(p)).toEqual(["Shadow"]);
  });

  it("applies one colourway's arrangement to all of them on request", () => {
    let p = newProduct({ blankId: "hoodie", colorName: "Cream", placed: base, key: "k" });
    p = setPlacement(p, "Shadow", tuned);
    p = applyToAll(p, "Shadow");

    expect(p.placed).toBe(tuned);
    // Cleared, so the next shared edit actually reaches everything.
    expect(p.overrides).toEqual({});
    expect(placementFor(p, "Cream")).toBe(tuned);
  });

  it("puts one colourway back on the shared arrangement", () => {
    let p = newProduct({ blankId: "hoodie", colorName: "Cream", placed: base, key: "k" });
    p = setPlacement(p, "Shadow", tuned);
    p = resetToShared(p, "Shadow");
    expect(placementFor(p, "Shadow")).toBe(base);
    expect(isAdjusted(p, "Shadow")).toBe(false);
  });

  it("is a no-op to reset a colourway that was never adjusted", () => {
    const p = newProduct({ blankId: "hoodie", colorName: "Cream", placed: base, key: "k" });
    expect(resetToShared(p, "Shadow")).toBe(p);
  });

  it("saves each colourway with the arrangement it actually shows", () => {
    let s = threeColours();
    s = updateActive(s, (p) => ({ ...p, placed: base }));
    s = updateActive(s, (p) => setPlacement(p, "Shadow", tuned));

    const variants = sessionVariants(s, blanks);
    const byColour = new Map(variants.map((v) => [v.colorName, v.placed]));
    expect(byColour.get("Shadow")).toBe(tuned);
    expect(byColour.get("Cream")).toBe(base);
    expect(byColour.get("Black")).toBe(base);
  });

  it("still counts as placed when only an override exists", () => {
    let p = newProduct({ blankId: "hoodie", colorName: "Cream", key: "k" });
    p = { ...p, overrides: { Cream: tuned } };
    expect(needsPlacement(p)).toBe(false);
  });

  it("never leaks an adjustment to another product", () => {
    let s = addProduct(sessionWithHoodie(), newProduct({ blankId: "pants", colorName: "Black", placed: place("pants"), key: "k2" }));
    s = updateProduct(s, "k1", (p) => setPlacement(p, "Cream", tuned));
    expect(s.products[1].overrides).toEqual({});
    expect(placementFor(s.products[1], "Black")[0].id).toBe("pants");
  });
});
