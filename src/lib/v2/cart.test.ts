import { describe, expect, it } from "vitest";
import {
  addableLines,
  cartUnits,
  gridUnits,
  groupCartLines,
  groupKey,
  lineKey,
  planAdd,
  rowUnits,
  sizesForRun,
  sortSizes,
  type CartLine,
} from "./cart";
import { quoteCart } from "./bulk-pricing";

const line = (over: Partial<CartLine> & Pick<CartLine, "id" | "size">): CartLine => ({
  mockupId: "m1",
  blankId: "b1",
  title: "Tee",
  colorName: "Black",
  quantity: 1,
  unitRetail: 30,
  imageUrl: null,
  ...over,
});

describe("cart identity", () => {
  it("treats the same mockup, colour and size as one line", () => {
    expect(lineKey("m1", "Black", "L")).toBe(lineKey("m1", "Black", "L"));
  });

  it("keeps colours apart", () => {
    expect(lineKey("m1", "Black", "L")).not.toBe(lineKey("m1", "White", "L"));
  });

  it("does not collide a missing colour with a colour literally called that", () => {
    // Both halves are joined with a separator that cannot appear in a uuid or
    // a colour name, so "no-colour||L" cannot be produced two ways.
    expect(lineKey("m1", null, "L")).not.toBe(lineKey("m1||no", "colour", "L"));
  });

  it("groups by mockup and colourway", () => {
    expect(groupKey("m1", "Black")).not.toBe(groupKey("m1", "White"));
  });
});

describe("sizes read in apparel order", () => {
  it("sorts a normal run", () => {
    const sizes = ["2XL", "S", "XL", "M", "L", "XS"];
    expect(sortSizes(sizes, (s) => s)).toEqual(["XS", "S", "M", "L", "XL", "2XL"]);
  });

  it("treats XXL and 2XL as the same rung", () => {
    const sorted = sortSizes(["3XL", "XXL", "L"], (s) => s);
    expect(sorted[0]).toBe("L");
    expect(sorted.slice(1)).toContain("XXL");
  });

  it("parks sizes it does not know at the end instead of dropping them", () => {
    const sorted = sortSizes(["Youth M", "L", "S"], (s) => s);
    expect(sorted).toEqual(["S", "L", "Youth M"]);
  });

  it("is case-insensitive about the ladder", () => {
    expect(sortSizes(["xl", "s"], (s) => s)).toEqual(["s", "xl"]);
  });
});

describe("grouping", () => {
  const lines = [
    line({ id: "1", size: "L", quantity: 4 }),
    line({ id: "2", size: "S", quantity: 2 }),
    line({ id: "3", size: "M", quantity: 3, colorName: "White" }),
  ];

  it("makes one card per mockup and colourway", () => {
    expect(groupCartLines(lines)).toHaveLength(2);
  });

  it("orders each card's sizes for reading, not alphabetically", () => {
    const black = groupCartLines(lines)[0];
    expect(black.lines.map((l) => l.size)).toEqual(["S", "L"]);
  });

  it("totals units and retail per card", () => {
    const black = groupCartLines(lines)[0];
    expect(black.units).toBe(6);
    expect(black.retail).toBe(180);
  });

  it("keeps the order the mockups were added in", () => {
    expect(groupCartLines(lines).map((g) => g.colorName)).toEqual(["Black", "White"]);
  });

  it("counts the whole cart", () => {
    expect(cartUnits(lines)).toBe(9);
  });
});

describe("what may be written", () => {
  it("drops zero and negative quantities, which the table's check would reject", () => {
    expect(addableLines([{ size: "S", quantity: 0 }, { size: "M", quantity: -3 }, { size: "L", quantity: 2 }])).toEqual([
      { size: "L", quantity: 2 },
    ]);
  });

  it("drops a blank size rather than writing an empty string", () => {
    expect(addableLines([{ size: "  ", quantity: 5 }])).toEqual([]);
  });

  it("truncates fractional quantities instead of sending them to Postgres", () => {
    expect(addableLines([{ size: "L", quantity: 2.7 }])).toEqual([{ size: "L", quantity: 2 }]);
  });
});

describe("adding to a cart that already has some of it", () => {
  const existing = [line({ id: "a", size: "L", quantity: 4 })];

  it("raises the quantity of a size already there", () => {
    const plan = planAdd(existing, { mockupId: "m1", colorName: "Black", lines: [{ size: "L", quantity: 2 }] });
    expect(plan.inserts).toEqual([]);
    expect(plan.increments).toEqual([{ id: "a", quantity: 6 }]);
  });

  it("inserts a size that is not there yet", () => {
    const plan = planAdd(existing, { mockupId: "m1", colorName: "Black", lines: [{ size: "M", quantity: 3 }] });
    expect(plan.inserts).toEqual([{ size: "M", quantity: 3 }]);
    expect(plan.increments).toEqual([]);
  });

  it("does not merge across colourways", () => {
    const plan = planAdd(existing, { mockupId: "m1", colorName: "White", lines: [{ size: "L", quantity: 2 }] });
    expect(plan.inserts).toEqual([{ size: "L", quantity: 2 }]);
  });

  it("does not merge across mockups", () => {
    const plan = planAdd(existing, { mockupId: "m2", colorName: "Black", lines: [{ size: "L", quantity: 2 }] });
    expect(plan.inserts).toEqual([{ size: "L", quantity: 2 }]);
  });
});

describe("quoting a cart of mixed garments", () => {
  const breaks = [
    { minQty: 25, discountPct: 5 },
    { minQty: 50, discountPct: 10 },
    { minQty: 100, discountPct: 15 },
  ];

  it("applies the break the WHOLE cart earns, not the break each mockup earns", () => {
    // 20 tees and 30 hoodies is a fifty-unit order.
    const quote = quoteCart([{ quantity: 20, unitPrice: 30 }, { quantity: 30, unitPrice: 60 }], breaks);
    expect(quote.units).toBe(50);
    expect(quote.discountPct).toBe(10);
  });

  it("discounts the unit price and then multiplies, so the page adds up", () => {
    const quote = quoteCart([{ quantity: 50, unitPrice: 29.99 }], breaks);
    expect(quote.lines[0].discountedUnitPrice).toBe(26.99);
    expect(quote.lines[0].lineSubtotal).toBe(1349.5);
    expect(quote.subtotal).toBe(1349.5);
  });

  it("reports the saving against the undiscounted retail", () => {
    const quote = quoteCart([{ quantity: 100, unitPrice: 20 }], breaks);
    expect(quote.retailEquivalent).toBe(2000);
    expect(quote.subtotal).toBe(1700);
    expect(quote.savings).toBe(300);
  });

  it("quotes no discount, and the gap to the first break, on a small cart", () => {
    const quote = quoteCart([{ quantity: 10, unitPrice: 40 }], breaks);
    expect(quote.discountPct).toBe(0);
    expect(quote.subtotal).toBe(400);
    expect(quote.nextBreak).toEqual({ minQty: 25, discountPct: 5, unitsAway: 15 });
  });

  it("is empty rather than NaN when the cart is", () => {
    const quote = quoteCart([], breaks);
    expect(quote.units).toBe(0);
    expect(quote.subtotal).toBe(0);
    expect(quote.savings).toBe(0);
  });

  it("treats an unpriced blank as zero rather than poisoning the total", () => {
    const quote = quoteCart([{ quantity: 5, unitPrice: 30 }, { quantity: 5, unitPrice: Number.NaN }], breaks);
    expect(quote.subtotal).toBe(150);
  });

  it("does not depend on the breaks arriving in order", () => {
    const shuffled = [...breaks].reverse();
    expect(quoteCart([{ quantity: 60, unitPrice: 10 }], shuffled).discountPct).toBe(10);
  });
});

describe("the builder's quantity grid", () => {
  const grid = { 0: { S: 2, L: 4 }, 1: { M: 3 } };

  it("totals the whole run", () => {
    expect(gridUnits(grid)).toBe(9);
  });

  it("totals one colourway", () => {
    expect(rowUnits(grid, 0)).toBe(6);
    expect(rowUnits(grid, 1)).toBe(3);
  });

  it("reads an untouched colourway as zero rather than undefined", () => {
    expect(rowUnits(grid, 7)).toBe(0);
    expect(gridUnits({})).toBe(0);
  });

  it("ignores blanked-out and negative entries", () => {
    expect(gridUnits({ 0: { S: 0, M: -2, L: 3 } })).toBe(3);
  });
});

describe("the sizes a run offers", () => {
  const sizesOf = (id: string) => (id === "tee" ? ["S", "M", "L", "XL"] : ["M", "L", "XL", "2XL"]);

  it("unions them, so a run does not lose a size one garment lacks", () => {
    const run = [{ blankId: "tee" }, { blankId: "hoodie" }];
    expect(sizesForRun(run, sizesOf)).toEqual(["S", "M", "L", "XL", "2XL"]);
  });

  it("does not repeat a size two garments share", () => {
    const run = [{ blankId: "tee" }, { blankId: "tee" }];
    expect(sizesForRun(run, sizesOf)).toEqual(["S", "M", "L", "XL"]);
  });

  it("is empty when nothing lists its sizes, rather than inventing a ladder", () => {
    expect(sizesForRun([{ blankId: "x" }], () => [])).toEqual([]);
  });
});
