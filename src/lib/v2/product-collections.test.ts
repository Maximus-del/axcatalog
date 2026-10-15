import { describe, expect, it } from "vitest";
import { sortOptions, toCollectionOption } from "./product-collections";

describe("collection tagging options", () => {
  it("uses the client-facing destination label and accent", () => {
    const o = toCollectionOption({
      id: "c1",
      name: "Darnell Mooney x Falcons",
      athlete_id: "a",
      status: "active",
      metadata: { portal_destination: { label: "Atlanta", accent: "#EF233C" } },
    });
    expect(o.label).toBe("Atlanta");
    expect(o.accent).toBe("#EF233C");
  });

  it("ignores a malformed accent and missing config", () => {
    const o = toCollectionOption({ id: "c2", name: "Plain", metadata: { portal_destination: { accent: "red" } } });
    expect(o.accent).toBeNull();
    expect(o.label).toBeNull();
  });

  it("orders the client's lockers first, then by name", () => {
    const out = sortOptions([
      { id: "z", name: "Zeta", metadata: {} },
      { id: "ny", name: "Giants", metadata: { portal_destination: { sort: 30 } } },
      { id: "atl", name: "Falcons", metadata: { portal_destination: { sort: 10 } } },
      { id: "a", name: "Alpha", metadata: {} },
    ]);
    expect(out.map((o) => o.id)).toEqual(["atl", "ny", "a", "z"]);
  });
});
