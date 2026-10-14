import { describe, expect, it } from "vitest";
import { DEFAULT_SPLIT, RUN_PRESETS, distribute, runTotal, sizesFor, splitTotal } from "./size-run";

describe("the house split", () => {
  it("totals 100%", () => {
    expect(splitTotal(DEFAULT_SPLIT)).toBe(100);
  });

  it("is the run Chase actually orders: S5 M15 L25 XL30 2XL20 3XL5", () => {
    expect(DEFAULT_SPLIT.map((s) => `${s.size}${s.percent}`)).toEqual([
      "S5",
      "M15",
      "L25",
      "XL30",
      "2XL20",
      "3XL5",
    ]);
  });

  it("peaks at XL, because that is what sells to a team", () => {
    const biggest = [...DEFAULT_SPLIT].sort((a, b) => b.percent - a.percent)[0];
    expect(biggest.size).toBe("XL");
  });
});

describe("distributing a run", () => {
  it("gives back EXACTLY the number asked for", () => {
    for (const total of [...RUN_PRESETS, 1, 7, 13, 36, 99, 137, 250]) {
      expect(runTotal(distribute(total))).toBe(total);
    }
  });

  it("splits 100 straight down the percentages", () => {
    expect(distribute(100)).toEqual({ S: 5, M: 15, L: 25, XL: 30, "2XL": 20, "3XL": 5 });
  });

  it("does not lose a unit to rounding on 25", () => {
    // Naive per-size rounding produces 24 here, and an operator who asks for
    // 25 and is quoted 24 has to go hunting for the missing one.
    const run = distribute(25);
    expect(runTotal(run)).toBe(25);
    expect(run.XL).toBeGreaterThanOrEqual(run.S);
  });

  it("puts a rounding crumb on a big size, not a small one", () => {
    const run = distribute(10);
    expect(runTotal(run)).toBe(10);
    expect(run.L + run.XL).toBeGreaterThan(run.S + run["3XL"]);
  });

  it("keeps the shape of the curve at every preset", () => {
    for (const total of RUN_PRESETS) {
      const run = distribute(total);
      expect(run.XL).toBeGreaterThanOrEqual(run.M);
      expect(run.L).toBeGreaterThanOrEqual(run.S);
    }
  });

  it("is all zeroes for nothing, rather than a stray unit", () => {
    expect(distribute(0)).toEqual({ S: 0, M: 0, L: 0, XL: 0, "2XL": 0, "3XL": 0 });
    expect(runTotal(distribute(0))).toBe(0);
  });

  it("ignores a negative or fractional ask", () => {
    expect(runTotal(distribute(-5))).toBe(0);
    expect(runTotal(distribute(12.9))).toBe(12);
  });

  it("honours a different split without assuming the house one", () => {
    const evens = [
      { size: "S", percent: 50 },
      { size: "L", percent: 50 },
    ];
    expect(distribute(10, evens)).toEqual({ S: 5, L: 5 });
  });

  it("does not divide by zero on a split that totals nothing", () => {
    const broken = [{ size: "S", percent: 0 }];
    expect(distribute(10, broken)).toEqual({ S: 0 });
  });
});

describe("which sizes a garment offers", () => {
  it("uses the garment's own sizes when it lists them", () => {
    expect(sizesFor(["S", "M", "L"])).toEqual(["S", "M", "L"]);
  });

  it("falls back to the standard run, because V2 has no size table yet", () => {
    expect(sizesFor([])).toEqual(["S", "M", "L", "XL", "2XL", "3XL"]);
    expect(sizesFor(null)).toEqual(["S", "M", "L", "XL", "2XL", "3XL"]);
  });

  it("drops blank entries rather than rendering an unnamed column", () => {
    expect(sizesFor(["S", "  ", "L"])).toEqual(["S", "L"]);
  });
});
