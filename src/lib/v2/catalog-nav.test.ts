import { describe, expect, it } from "vitest";
import {
  blankHref,
  catalogHref,
  catalogTitle,
  defaultColorway,
  resolveColorway,
  sourcingName,
} from "./catalog-nav";
import type { Blank, BlankColor } from "./types";

const color = (name: string, front: string | null = "f", available = true): BlankColor => ({
  id: `id-${name}`,
  name,
  hex: "#111",
  imageUrl: front,
  imageUrlBack: null,
  available,
});

const blank = (over: Partial<Blank> = {}): Blank => ({
  id: "b1",
  name: "Premium Fleece Hoodie",
  brand: "Cotton Collective",
  styleNumber: "CCHOD475",
  sku: null,
  garmentType: "hoodie",
  imageUrl: "hero",
  cost: null,
  priceAthlete: null,
  priceCorporate: null,
  priceStandard: null,
  availability: "available",
  colors: [color("Cool Blue"), color("Sand")],
  sizes: [],
  assortments: [],
  missingCost: true,
  missingPhoto: false,
  missingAssortment: false,
  ...over,
});

describe("catalogHref", () => {
  it("is the bare path when nothing is filtered", () => {
    expect(catalogHref()).toBe("/admin-v2/commerce");
  });

  it("carries the shelf you were looking at", () => {
    expect(catalogHref({ tab: "blanks", audience: "client", access: "all", filter: "missing_photo", q: " tee " })).toBe(
      "/admin-v2/commerce?tab=blanks&audience=client&access=all&filter=missing_photo&q=tee",
    );
  });

  it("omits the default slice so the common URL stays short", () => {
    expect(catalogHref({ access: "in", q: "   " })).toBe("/admin-v2/commerce");
  });
});

describe("blankHref", () => {
  it("addresses a blank", () => {
    expect(blankHref("b1")).toBe("/admin-v2/commerce/blanks/b1");
  });

  it("addresses one colourway by name, encoded", () => {
    expect(blankHref("b1", "Cool Blue")).toBe("/admin-v2/commerce/blanks/b1?color=Cool+Blue");
  });

  it("carries the back surface only when it is the back", () => {
    expect(blankHref("b1", "Sand", "back")).toBe("/admin-v2/commerce/blanks/b1?color=Sand&surface=back");
    expect(blankHref("b1", "Sand", "front")).toBe("/admin-v2/commerce/blanks/b1?color=Sand");
  });
});

describe("resolveColorway", () => {
  it("matches the exact stored name", () => {
    expect(resolveColorway(blank(), "Cool Blue")?.name).toBe("Cool Blue");
  });

  it("still lands when case or separators drift", () => {
    expect(resolveColorway(blank(), "cool_blue")?.name).toBe("Cool Blue");
    expect(resolveColorway(blank(), "COOLBLUE")?.name).toBe("Cool Blue");
  });

  it("accepts a row id, because older links carry one", () => {
    expect(resolveColorway(blank(), "id-Sand")?.name).toBe("Sand");
  });

  it("returns nothing for an unknown colour rather than guessing", () => {
    expect(resolveColorway(blank(), "Chartreuse")).toBeNull();
    expect(resolveColorway(blank(), null)).toBeNull();
    expect(resolveColorway(null, "Sand")).toBeNull();
  });
});

describe("defaultColorway", () => {
  it("prefers a colourway that has been photographed", () => {
    const b = blank({ colors: [color("Sand", null), color("Cool Blue", "f")] });
    expect(defaultColorway(b)?.name).toBe("Cool Blue");
  });

  it("prefers an available colourway over a discontinued one", () => {
    const b = blank({ colors: [color("Retired", "f", false), color("Sand", "f")] });
    expect(defaultColorway(b)?.name).toBe("Sand");
  });

  it("falls back to an unphotographed colour rather than showing nothing", () => {
    const b = blank({ colors: [color("Sand", null)] });
    expect(defaultColorway(b)?.name).toBe("Sand");
  });

  it("is null when the blank has no colours at all", () => {
    expect(defaultColorway(blank({ colors: [] }))).toBeNull();
  });
});

describe("catalogTitle / sourcingName", () => {
  it("shows the manufacturer name when no client name is set", () => {
    const b = blank();
    expect(catalogTitle(b)).toBe("Premium Fleece Hoodie");
    expect(sourcingName(b)).toBeNull();
  });

  it("promotes the client name and keeps the manufacturer name visible beneath it", () => {
    const b = blank({ displayName: "AX Heavyweight Hoodie" });
    expect(catalogTitle(b)).toBe("AX Heavyweight Hoodie");
    expect(sourcingName(b)).toBe("Premium Fleece Hoodie");
  });

  it("does not repeat itself when the two names agree", () => {
    const b = blank({ displayName: "Premium Fleece Hoodie" });
    expect(sourcingName(b)).toBeNull();
  });
});
