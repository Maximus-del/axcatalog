import { describe, expect, it } from "vitest";
import {
  LIFECYCLE,
  LIFECYCLE_ORDER,
  applyLifecycleFilter,
  canSetManually,
  countByLifecycle,
  isLifecycle,
  toLifecycle,
} from "./mockup-lifecycle";

describe("toLifecycle", () => {
  it("accepts every real stage", () => {
    for (const s of LIFECYCLE_ORDER) expect(toLifecycle(s)).toBe(s);
  });

  it("falls back to the bin for anything unrecognised", () => {
    // Least-progressed is the safe default: never assert progress that has not
    // happened because a value was unexpected.
    expect(toLifecycle("nonsense")).toBe("bin");
    expect(toLifecycle(null)).toBe("bin");
    expect(toLifecycle(undefined)).toBe("bin");
    expect(toLifecycle("")).toBe("bin");
  });
});

describe("isLifecycle", () => {
  it("narrows correctly", () => {
    expect(isLifecycle("ready")).toBe(true);
    expect(isLifecycle("Ready")).toBe(false);
    expect(isLifecycle(null)).toBe(false);
  });
});

describe("canSetManually", () => {
  it("refuses 'converted', which must be earned rather than claimed", () => {
    // Converted means assets actually exist. Letting it be set by hand would
    // make the state a claim instead of a fact.
    expect(canSetManually("converted")).toBe(false);
  });

  it("allows the stages an operator genuinely decides", () => {
    for (const s of ["bin", "in_progress", "ready", "archived"] as const) {
      expect(canSetManually(s)).toBe(true);
    }
  });
});

describe("countByLifecycle", () => {
  it("counts every stage, including the empty ones", () => {
    const counts = countByLifecycle([
      { lifecycle: "bin" },
      { lifecycle: "bin" },
      { lifecycle: "ready" },
      { lifecycle: "junk" },
    ]);
    expect(counts).toEqual({ bin: 3, in_progress: 0, ready: 1, converted: 0, archived: 0 });
  });
});

describe("applyLifecycleFilter", () => {
  const items = [
    { id: "a", lifecycle: "bin" },
    { id: "b", lifecycle: "ready" },
    { id: "c", lifecycle: "archived" },
  ];

  it("hides archived mockups from the default view", () => {
    // Archiving has to actually get something out of the way, or it means nothing.
    expect(applyLifecycleFilter(items, "all").map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("shows archived only when explicitly asked for", () => {
    expect(applyLifecycleFilter(items, "archived").map((i) => i.id)).toEqual(["c"]);
  });

  it("filters to a single stage", () => {
    expect(applyLifecycleFilter(items, "ready").map((i) => i.id)).toEqual(["b"]);
  });
});

describe("LIFECYCLE labels", () => {
  it("describes every stage", () => {
    for (const s of LIFECYCLE_ORDER) {
      expect(LIFECYCLE[s].label.length).toBeGreaterThan(0);
      expect(LIFECYCLE[s].blurb.length).toBeGreaterThan(0);
    }
  });
});
