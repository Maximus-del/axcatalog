// The prompt compiler is the load-bearing pure logic of the creative system:
// every generation session an operator runs comes out of it. These lock down
// substitution, the "don't silently blank a token" rule, and the guarantee that
// isolated-artwork output requirements are always present.
import { describe, it, expect } from "vitest";
import {
  DEFAULT_OUTPUT_REQUIREMENTS,
  DIRECTION_MODES,
  applyTokens,
  compilePrompt,
  extractTokens,
  missingVariables,
  parseRecipe,
  pickCurrentPrompt,
  resolveAthleteVariables,
  suggestConceptName,
  type TemplatePrompt,
} from "./creative";

const darnell = {
  full_name: "Darnell Mooney",
  first_name: "Darnell",
  last_name: "Mooney",
  jersey_number: 1,
  position: "WR",
  league: "NFL",
};

const team = { name: "Falcons", city: "Atlanta", primary_color: "#A71930", secondary_color: "#000000" };

describe("resolveAthleteVariables", () => {
  it("fills everything the system already knows", () => {
    const v = resolveAthleteVariables({ athlete: darnell, team, year: 2026 });
    expect(v.ATHLETE_NAME).toBe("Darnell Mooney");
    expect(v.LAST_NAME).toBe("Mooney");
    expect(v.NUMBER).toBe("1");
    expect(v.POSITION).toBe("WR");
    expect(v.SPORT).toBe("NFL");
    expect(v.CITY).toBe("Atlanta");
    expect(v.TEAM).toBe("Falcons");
    expect(v.COLOR_PALETTE).toBe("#A71930, #000000");
    expect(v.YEAR).toBe("2026");
  });

  it("builds a full name when the record only has parts", () => {
    const v = resolveAthleteVariables({ athlete: { ...darnell, full_name: null } });
    expect(v.ATHLETE_NAME).toBe("Darnell Mooney");
  });

  it("lets an operator override an auto-resolved value", () => {
    const v = resolveAthleteVariables({ athlete: darnell, team, overrides: { TEAM: "Tulane" } });
    expect(v.TEAM).toBe("Tulane");
  });

  it("ignores blank overrides rather than erasing good data", () => {
    const v = resolveAthleteVariables({ athlete: darnell, team, overrides: { TEAM: "   " } });
    expect(v.TEAM).toBe("Falcons");
  });

  it("omits empty values entirely so 'present' means 'usable'", () => {
    const v = resolveAthleteVariables({ athlete: { ...darnell, position: null }, team: null });
    expect(v.POSITION).toBeUndefined();
    expect(v.CITY).toBeUndefined();
    expect(v.COLOR_PALETTE).toBeUndefined();
  });

  it("treats jersey number 0 as a real value", () => {
    const v = resolveAthleteVariables({ athlete: { ...darnell, jersey_number: 0 } });
    expect(v.NUMBER).toBe("0");
  });
});

describe("tokens", () => {
  it("extracts unique tokens and tolerates inner whitespace", () => {
    expect(extractTokens("{{ATHLETE_NAME}} wears {{NUMBER}}, {{ ATHLETE_NAME }}")).toEqual(["ATHLETE_NAME", "NUMBER"]);
  });

  it("substitutes what it has", () => {
    expect(applyTokens("Graphic for {{ATHLETE_NAME}}", { ATHLETE_NAME: "Darnell Mooney" })).toBe("Graphic for Darnell Mooney");
  });

  it("leaves unresolved tokens visible instead of blanking the sentence", () => {
    expect(applyTokens("Number {{NUMBER}}", {})).toBe("Number {{NUMBER}}");
  });

  it("reports required tokens that have no value yet", () => {
    expect(missingVariables("Use {{NUMBER}} and {{CITY}}", ["PHRASE"], { NUMBER: "1" }).sort()).toEqual(["CITY", "PHRASE"]);
  });
});

describe("compilePrompt", () => {
  const base = {
    templateName: "Collegiate 01",
    promptBody: "Create an original apparel graphic for {{ATHLETE_NAME}} using the Collegiate 01 visual system.",
    variables: resolveAthleteVariables({ athlete: darnell, team }),
  };

  it("substitutes the athlete into the master prompt", () => {
    expect(compilePrompt(base)).toContain("apparel graphic for Darnell Mooney");
  });

  it("always appends output requirements, even with nothing else set", () => {
    expect(compilePrompt(base)).toContain(DEFAULT_OUTPUT_REQUIREMENTS);
    expect(compilePrompt({ templateName: "X", promptBody: "Do a thing.", variables: {} })).toContain("transparent background");
  });

  it("prefers a template's custom output requirements when set", () => {
    const out = compilePrompt({ ...base, outputRequirements: "CUSTOM RULES ONLY" });
    expect(out).toContain("CUSTOM RULES ONLY");
    expect(out).not.toContain(DEFAULT_OUTPUT_REQUIREMENTS);
  });

  it("includes an athlete details block built from resolved variables", () => {
    const out = compilePrompt(base);
    expect(out).toContain("ATHLETE DETAILS");
    expect(out).toContain("Number: 1");
    expect(out).toContain("Team / school: Falcons");
  });

  it("carries the athlete's own direction through", () => {
    const out = compilePrompt({ ...base, athleteDirection: "Moon and star imagery, vintage feel." });
    expect(out).toContain("CREATIVE DIRECTION");
    expect(out).toContain("Moon and star imagery");
  });

  it("falls back to the athlete idea variable when no direction is typed", () => {
    const out = compilePrompt({ ...base, variables: { ...base.variables, ATHLETE_IDEA: "stars and moons" } });
    expect(out).toContain("stars and moons");
  });

  it("produces genuinely different emphasis per direction mode", () => {
    const outs = DIRECTION_MODES.map((m) => compilePrompt({ ...base, directionMode: m.value }));
    expect(new Set(outs).size).toBe(3);
    expect(outs[1]).toContain("personal story");
    expect(outs[2]).toContain("fashion-forward");
  });

  it("adds reference guidance only when references are actually attached", () => {
    expect(compilePrompt(base)).not.toContain("REFERENCES");
    const withRefs = compilePrompt({ ...base, referenceSetName: "Vintage Collegiate", referenceCount: 4 });
    expect(withRefs).toContain("REFERENCES — Vintage Collegiate (4 images)");
    expect(withRefs).toContain("do not reproduce");
  });

  it("singularizes a one-image reference set", () => {
    expect(compilePrompt({ ...base, referenceCount: 1 })).toContain("(1 image)");
  });

  it("orders sections style-first so the style system carries the most weight", () => {
    const out = compilePrompt({ ...base, athleteDirection: "moons", referenceCount: 3, directionMode: "athlete" });
    const idx = (s: string) => out.indexOf(s);
    expect(idx("Collegiate 01 visual system")).toBeLessThan(idx("ATHLETE DETAILS"));
    expect(idx("ATHLETE DETAILS")).toBeLessThan(idx("CREATIVE DIRECTION"));
    expect(idx("CREATIVE DIRECTION")).toBeLessThan(idx("EMPHASIS"));
    expect(idx("EMPHASIS")).toBeLessThan(idx("REFERENCES"));
    expect(idx("REFERENCES")).toBeLessThan(idx("OUTPUT REQUIREMENTS"));
  });
});

describe("pickCurrentPrompt", () => {
  const p = (over: Partial<TemplatePrompt>): TemplatePrompt => ({
    id: "x", organization_id: null, template_id: "t", variation: "classic", version: 1,
    title: null, body: "b", output_requirements: null, required_variables: [],
    is_current_best: false, notes: null, created_at: "2026-01-01", ...over,
  });

  it("prefers the version marked current best over the newest", () => {
    const picked = pickCurrentPrompt([p({ id: "v2", version: 2 }), p({ id: "v1", version: 1, is_current_best: true })]);
    expect(picked?.id).toBe("v1");
  });

  it("falls back to the first available when nothing is marked", () => {
    expect(pickCurrentPrompt([p({ id: "v2", version: 2 }), p({ id: "v1" })])?.id).toBe("v2");
  });

  it("falls back across variations rather than returning nothing", () => {
    const picked = pickCurrentPrompt([p({ id: "c", variation: "classic" })], "experimental");
    expect(picked?.id).toBe("c");
  });

  it("returns null when there are no prompts at all", () => {
    expect(pickCurrentPrompt([], "classic")).toBeNull();
  });
});

describe("recipe + naming", () => {
  it("parses a stored recipe and drops malformed slots", () => {
    const r = parseRecipe({ designs: [{ name: "Primary" }, { nope: 1 }], products: ["Tee", 5] });
    expect(r.designs).toHaveLength(1);
    expect(r.products).toEqual(["Tee"]);
  });

  it("returns empty structures for junk input", () => {
    expect(parseRecipe(null)).toEqual({ designs: [], products: [], notes: undefined });
  });

  it("suggests a concept name without the template's version number", () => {
    expect(suggestConceptName("Mooney", "Collegiate 01")).toBe("MOONEY COLLEGIATE");
    expect(suggestConceptName("Bosa", "Vintage Sports")).toBe("BOSA VINTAGE SPORTS");
  });
});
