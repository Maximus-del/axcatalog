import { describe, expect, it } from "vitest";
import {
  DEFAULT_PORTAL_THEME,
  contrastRatio,
  hasTitleCard,
  hexToHslTriplet,
  mergePortalTheme,
  normalizeHex,
  parsePortalTheme,
  readableOn,
  themeCssVars,
  themeWarnings,
} from "./portal-theme";

// Darnell Mooney's real metadata keys, so the merge is tested against what
// is actually on the row rather than an invented blob.
const MOONEY_METADATA = {
  modules: { studio: true },
  avatar_url: "https://example.test/a.png",
  template_id: "t1",
  notif_defaults: { email: true },
};

const BEARS = { accent: "#C83803", header: "#0B162A", background: "#101a2b", title: "#ffffff" };

describe("parsePortalTheme", () => {
  it("returns the original AX look for nothing stored", () => {
    for (const raw of [undefined, null, "", 42, [], "not json"]) {
      expect(parsePortalTheme(raw)).toEqual(DEFAULT_PORTAL_THEME);
    }
  });

  it("keeps valid fields and defaults the bad ones individually", () => {
    const t = parsePortalTheme({ accent: "#C83803", header: "red", title: "#FFF", background: 12 });
    expect(t.accent).toBe("#c83803");
    expect(t.title).toBe("#ffffff");
    expect(t.header).toBe(DEFAULT_PORTAL_THEME.header);
    expect(t.background).toBe(DEFAULT_PORTAL_THEME.background);
  });

  it("rejects anything that is not a plain hex colour", () => {
    for (const v of ["url(x)", "#12", "#1234567", "rgb(0,0,0)", "#ggg", "expression(alert(1))"]) {
      expect(normalizeHex(v)).toBeNull();
    }
  });

  it("collapses and caps title card text", () => {
    const t = parsePortalTheme({ titleCard: { headline: "  The   Mooney   Era  ", subline: "x".repeat(500) } });
    expect(t.titleCard.headline).toBe("The Mooney Era");
    expect(t.titleCard.subline.length).toBe(80);
    expect(hasTitleCard(t)).toBe(true);
    expect(hasTitleCard(DEFAULT_PORTAL_THEME)).toBe(false);
  });
});

describe("colour maths", () => {
  it("produces the triplets index.css is written in", () => {
    expect(hexToHslTriplet("#2ecc71")).toBe("145 63% 49%");
    expect(hexToHslTriplet("#ffffff")).toBe("0 0% 100%");
    expect(hexToHslTriplet("#0d0d0d")).toBe("0 0% 5%");
  });

  it("default theme reproduces the existing tokens exactly", () => {
    const v = themeCssVars(DEFAULT_PORTAL_THEME);
    expect(v["--accent"]).toBe("145 63% 49%");
    expect(v["--accent-foreground"]).toBe("0 0% 5%");
    expect(v["--dark"]).toBe("0 0% 5%");
    expect(v["--background"]).toBe("0 0% 10%");
  });

  it("picks a readable label colour for whatever accent is chosen", () => {
    expect(readableOn("#2ecc71")).toBe("#0d0d0d");
    expect(readableOn("#0B162A")).toBe("#ffffff");
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
});

describe("themeWarnings", () => {
  it("is quiet for the default and for a sensible team theme", () => {
    expect(themeWarnings(DEFAULT_PORTAL_THEME)).toEqual([]);
    expect(themeWarnings(parsePortalTheme(BEARS))).toEqual([]);
  });

  it("flags a name the client cannot read", () => {
    const t = parsePortalTheme({ ...BEARS, title: "#0B162A" });
    expect(themeWarnings(t)).toContain("The name will be hard to read on the header colour.");
  });
});

describe("mergePortalTheme", () => {
  it("never touches the other metadata keys", () => {
    const out = mergePortalTheme(MOONEY_METADATA, parsePortalTheme(BEARS));
    expect(out.modules).toEqual(MOONEY_METADATA.modules);
    expect(out.avatar_url).toBe(MOONEY_METADATA.avatar_url);
    expect(out.template_id).toBe("t1");
    expect(out.notif_defaults).toEqual(MOONEY_METADATA.notif_defaults);
    expect((out.portal_theme as { accent: string }).accent).toBe("#c83803");
  });

  it("does not mutate the object it was given", () => {
    const input = { ...MOONEY_METADATA };
    mergePortalTheme(input, parsePortalTheme(BEARS));
    expect("portal_theme" in input).toBe(false);
  });

  it("removes the key on reset instead of storing a copy of the defaults", () => {
    const themed = mergePortalTheme(MOONEY_METADATA, parsePortalTheme(BEARS));
    const reset = mergePortalTheme(themed, DEFAULT_PORTAL_THEME);
    expect(reset).toEqual(MOONEY_METADATA);
  });

  it("starts a blob when metadata was null", () => {
    expect(mergePortalTheme(null, parsePortalTheme(BEARS))).toHaveProperty("portal_theme");
  });
});
