// The naming rules are shared with the Drive indexer edge function, so this
// test covers both runtimes at once.
import { describe, expect, it } from "vitest";
import {
  normalizeColor, normalizeName, productNameOf, styleNumberOf,
  viewFromFilename, viewTypeOf,
} from "../../../supabase/functions/_shared/drive-naming";

describe("normalizeName", () => {
  it("treats the library's em dash as a separator", () => {
    expect(normalizeName("7601 — FULL ZIP UP HOOD 10 OZ")).toBe("7601 FULL ZIP UP HOOD 10 OZ");
  });
  it("flattens case, underscores and repeated spaces", () => {
    expect(normalizeName("special_hoodie   14  oz")).toBe("SPECIAL HOODIE 14 OZ");
  });
});

describe("normalizeColor", () => {
  it("makes punctuation irrelevant", () => {
    expect(normalizeColor("VINTAGE_BLACK")).toBe("VINTAGEBLACK");
    expect(normalizeColor("Vintage Black")).toBe(normalizeColor("VINTAGE-BLACK"));
  });
});

describe("viewTypeOf", () => {
  it("reads a view folder exactly", () => {
    expect(viewTypeOf("BACK_HOOD_UP")).toBe("BACK_HOOD_UP");
    expect(viewTypeOf("Front")).toBe("FRONT");
    expect(viewTypeOf("back hood down")).toBe("BACK_HOOD_DOWN");
  });
  it("refuses a colour folder rather than guessing", () => {
    expect(viewTypeOf("BLACK")).toBeNull();
    expect(viewTypeOf("VINTAGE_SUNFLOWER")).toBeNull();
  });
});

describe("viewFromFilename", () => {
  it("keeps hood-up and hood-down out of the plain back slot", () => {
    expect(viewFromFilename("AXISM_7395_BLACK_BACK_HOOD_UP_CLEAN.png")).toBe("BACK_HOOD_UP");
    expect(viewFromFilename("AXISM_7395_BLACK_BACK_HOOD_DOWN_CLEAN.png")).toBe("BACK_HOOD_DOWN");
    expect(viewFromFilename("AXISM_7395_BLACK_BACK_CLEAN.png")).toBe("BACK");
  });
  it("reads a front through a two-word supplier", () => {
    expect(viewFromFilename("COTTON_COLLECTIVE_JET_BLACK_FRONT_CLEAN.png")).toBe("FRONT");
  });
  it("returns null when the name says nothing", () => {
    expect(viewFromFilename("IMG_2841.png")).toBeNull();
  });
});

describe("styleNumberOf", () => {
  it("takes long vendor codes", () => {
    expect(styleNumberOf("7601 — FULL ZIP UP HOOD 10 OZ")).toBe("7601");
    expect(styleNumberOf("CCHOD475 GARMENT WASH HOODIE")).toBe("CCHOD475");
    expect(styleNumberOf("PRM4600QZ QUARTER ZIP")).toBe("PRM4600QZ");
  });
  it("never reads a fabric weight as an identifier", () => {
    expect(styleNumberOf("HEAVY CREW 15 OZ")).toBeNull();
    expect(styleNumberOf("OVERSIZED BOX S-S TEE 7.5 OZ")).toBeNull();
  });
  it("strips the code off the name", () => {
    expect(productNameOf("7601 — FULL ZIP UP HOOD 10 OZ")).toBe("FULL ZIP UP HOOD 10 OZ");
  });
});
