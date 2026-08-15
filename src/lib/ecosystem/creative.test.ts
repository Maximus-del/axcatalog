// The prompt compiler is the load-bearing pure logic of the creative system:
// every generation session an operator runs comes out of it. These lock down
// substitution, the "don't silently blank a token" rule, and the guarantee that
// isolated-artwork output requirements are always present.
import { describe, it, expect } from "vitest";
import {
  DEFAULT_OUTPUT_REQUIREMENTS,
  DIRECTION_MODES,
  applyTokens,
  buildPromptExtractionRequest,
  compilePrompt,
  draftPromptFromNotes,
  parseExtractionReply,
  extractTokens,
  missingVariables,
  nextPromptVersion,
  packagedReferences,
  parseRecipe,
  pickCurrentPrompt,
  pickSetPrompt,
  referenceSetReadiness,
  resolveAthleteVariables,
  suggestConceptName,
  templateReadiness,
  type ReferenceImage,
  type ReferenceSet,
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
    expect(withRefs).toContain("Do not reproduce");
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

const p = (over: Partial<TemplatePrompt>): TemplatePrompt => ({
  id: "x", organization_id: null, template_id: "t", reference_set_id: null, role: "master",
  variation: "classic", version: 1, title: null, body: "b", output_requirements: null,
  required_variables: [], is_current_best: false, master_candidate: false,
  notes: null, created_at: "2026-01-01", ...over,
});

describe("pickCurrentPrompt", () => {

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

describe("reference set prompts", () => {
  const setA = "set-a";
  const setB = "set-b";
  const prompts = [
    p({ id: "m1", version: 2 }),
    p({ id: "a-primary", reference_set_id: setA, role: "primary", version: 1 }),
    p({ id: "a-primary-2", reference_set_id: setA, role: "primary", version: 2, is_current_best: true }),
    p({ id: "a-backup", reference_set_id: setA, role: "backup", version: 1 }),
    p({ id: "b-primary", reference_set_id: setB, role: "primary", version: 1 }),
  ];

  it("picks the current-best prompt for a set and role", () => {
    expect(pickSetPrompt(prompts, setA, "primary")?.id).toBe("a-primary-2");
    expect(pickSetPrompt(prompts, setA, "backup")?.id).toBe("a-backup");
  });

  it("does not leak one set's prompts into another", () => {
    expect(pickSetPrompt(prompts, setB, "backup")).toBeNull();
  });

  it("keeps master prompts out of set lookups and vice versa", () => {
    expect(pickSetPrompt(prompts, setA, "primary")?.reference_set_id).toBe(setA);
    expect(pickCurrentPrompt(prompts)?.id).toBe("m1");
  });

  it("versions independently per scope", () => {
    expect(nextPromptVersion(prompts, { reference_set_id: setA, role: "primary" })).toBe(3);
    expect(nextPromptVersion(prompts, { reference_set_id: setA, role: "backup" })).toBe(2);
    expect(nextPromptVersion(prompts, { reference_set_id: setB, role: "backup" })).toBe(1);
    expect(nextPromptVersion(prompts, { variation: "classic" })).toBe(3);
  });
});

const img = (id: string, recommended = false): ReferenceImage => ({
  id, reference_set_id: "s", url: `https://x/${id}.png`, storage_bucket: null,
  storage_path: null, title: null, sort_order: 0, is_recommended: recommended,
});

const refSet = (over: Partial<ReferenceSet> = {}): ReferenceSet => ({
  id: "s", organization_id: null, template_id: "t", name: "Vintage Collegiate",
  description: null, recommended_min: 3, recommended_max: 5, is_default: false,
  style_notes: {}, reference_dependency: "high", images: [], ...over,
});

describe("packagedReferences", () => {
  it("sends only the marked-recommended images when any are marked", () => {
    const s = refSet({ images: [img("a"), img("b", true), img("c", true)] });
    expect(packagedReferences(s).map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("falls back to the first few when nothing is marked", () => {
    const s = refSet({ images: [img("a"), img("b"), img("c")], recommended_max: 2 });
    expect(packagedReferences(s).map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("handles an empty or missing set", () => {
    expect(packagedReferences(refSet())).toEqual([]);
    expect(packagedReferences(null)).toEqual([]);
  });
});

describe("referenceSetReadiness", () => {
  const s = refSet({ images: [img("a", true), img("b")] });

  it("reports a set with both prompts as fully ready", () => {
    const prompts = [
      p({ reference_set_id: "s", role: "primary" }),
      p({ reference_set_id: "s", role: "backup" }),
    ];
    const r = referenceSetReadiness(s, prompts);
    expect(r.label).toBe("Primary + Backup ready");
    expect(r.ready).toBe(true);
  });

  it("distinguishes primary-only from no prompt at all", () => {
    expect(referenceSetReadiness(s, [p({ reference_set_id: "s", role: "primary" })]).label).toBe("Primary ready");
    expect(referenceSetReadiness(s, []).label).toBe("Needs prompt");
    expect(referenceSetReadiness(s, []).ready).toBe(false);
  });

  it("counts recommended images separately from total", () => {
    const r = referenceSetReadiness(s, []);
    expect(r.imageCount).toBe(2);
    expect(r.recommendedCount).toBe(1);
  });

  it("ignores another set's prompts", () => {
    expect(referenceSetReadiness(s, [p({ reference_set_id: "other", role: "primary" })]).ready).toBe(false);
  });
});

describe("templateReadiness", () => {
  it("is production ready only when every piece is in place", () => {
    const full = templateReadiness({
      masterPrompt: true, referenceSets: 3, setsWithPrimary: 3, setsWithBackup: 3,
      hasRecipe: true, hasStyleDna: true,
    });
    expect(full.productionReady).toBe(true);
    expect(full.done).toBe(full.total);
  });

  it("does not credit prompts when only some sets have them", () => {
    const partial = templateReadiness({
      masterPrompt: true, referenceSets: 3, setsWithPrimary: 2, setsWithBackup: 0,
      hasRecipe: true, hasStyleDna: true,
    });
    expect(partial.productionReady).toBe(false);
    expect(partial.items.find((i) => i.label === "Primary prompts")?.done).toBe(false);
  });

  it("does not credit prompt coverage when there are no sets at all", () => {
    const none = templateReadiness({
      masterPrompt: true, referenceSets: 0, setsWithPrimary: 0, setsWithBackup: 0,
      hasRecipe: false, hasStyleDna: false,
    });
    expect(none.items.find((i) => i.label === "Primary prompts")?.done).toBe(false);
  });
});

describe("draftPromptFromNotes", () => {
  const notes = { typography: "Block varsity", texture: "Heavy distress", mood: "Old campus bookstore" };

  it("turns observations into a prompt scaffold with tokens", () => {
    const out = draftPromptFromNotes({ templateName: "Collegiate 01", setName: "Vintage Collegiate", notes });
    expect(out).toContain("Vintage Collegiate interpretation of the Collegiate 01");
    expect(out).toContain("TYPOGRAPHY");
    expect(out).toContain("Block varsity");
    expect(out).toContain("{{ATHLETE_NAME}}");
    expect(out).toContain("ORIGINALITY");
  });

  it("omits fields with no observation rather than emitting empty headings", () => {
    const out = draftPromptFromNotes({ templateName: "T", setName: "S", notes });
    expect(out).not.toContain("COMPOSITION");
    expect(out).not.toContain("COLOR\n\n");
  });

  it("gives the backup role a different strategy, not a reword", () => {
    const primary = draftPromptFromNotes({ templateName: "T", setName: "S", notes, role: "primary" });
    const backup = draftPromptFromNotes({ templateName: "T", setName: "S", notes, role: "backup" });
    expect(backup).not.toBe(primary);
    expect(backup).toContain("different strategy");
    expect(primary).not.toContain("different strategy");
  });
});

describe("buildPromptExtractionRequest", () => {
  const base = { templateName: "Collegiate 01", setName: "Vintage Collegiate", imageCount: 4 };

  it("asks for the shared language across the group, not one image", () => {
    const out = buildPromptExtractionRequest(base);
    expect(out).toContain("AS A GROUP");
    expect(out).toContain("I do not want a description of any single image");
    expect(out).toContain("Vintage Collegiate");
    expect(out).toContain("4 reference images");
  });

  it("demands the placeholders back so athlete details can slot in later", () => {
    const out = buildPromptExtractionRequest(base);
    expect(out).toContain("{{ATHLETE_NAME}}");
    expect(out).toContain("{{NUMBER}}");
    expect(out).toContain("{{COLOR_PALETTE}}");
  });

  it("carries the output requirements so the returned prompt ends correctly", () => {
    expect(buildPromptExtractionRequest(base)).toContain(DEFAULT_OUTPUT_REQUIREMENTS);
    expect(buildPromptExtractionRequest({ ...base, outputRequirements: "MY RULES" })).toContain("MY RULES");
  });

  it("includes existing observations as a starting point when there are any", () => {
    const withNotes = buildPromptExtractionRequest({ ...base, notes: { texture: "Heavy distress" } });
    expect(withNotes).toContain("ALREADY OBSERVED");
    expect(withNotes).toContain("Heavy distress");
    expect(buildPromptExtractionRequest(base)).not.toContain("ALREADY OBSERVED");
  });

  it("tells the model to take a different angle for a backup prompt", () => {
    expect(buildPromptExtractionRequest({ ...base, role: "backup" })).toContain("BACKUP prompt");
    expect(buildPromptExtractionRequest({ ...base, role: "primary" })).not.toContain("BACKUP prompt");
  });

  it("handles one image without saying '1 images'", () => {
    expect(buildPromptExtractionRequest({ ...base, imageCount: 1 })).toContain("1 reference image.");
  });
});

describe("parseExtractionReply", () => {
  const reply = `=== STYLE NOTES ===
Typography: Older serif with collegiate block
Composition: Small name above large central type
Mood: Old campus bookstore

=== PROMPT ===
Create an original apparel graphic for {{ATHLETE_NAME}}.
Use heavy distress throughout.`;

  it("splits the two sections apart", () => {
    const { notes, prompt } = parseExtractionReply(reply);
    expect(notes.typography).toBe("Older serif with collegiate block");
    expect(notes.mood).toBe("Old campus bookstore");
    expect(prompt.startsWith("Create an original apparel graphic")).toBe(true);
    expect(prompt).not.toContain("STYLE NOTES");
  });

  it("only keeps note lines that map to a known field", () => {
    const { notes } = parseExtractionReply("=== STYLE NOTES ===\nVibe: cool\nTexture: gritty\n=== PROMPT ===\nx");
    expect(notes.texture).toBe("gritty");
    expect(Object.keys(notes)).toHaveLength(1);
  });

  it("strips code fences the model likes to add", () => {
    const { prompt } = parseExtractionReply("=== PROMPT ===\n```\nMake a thing.\n```");
    expect(prompt).toBe("Make a thing.");
  });

  it("treats an unmarked reply as the prompt rather than losing it", () => {
    const { notes, prompt } = parseExtractionReply("Create an original graphic for {{ATHLETE_NAME}}.");
    expect(prompt).toContain("{{ATHLETE_NAME}}");
    expect(notes).toEqual({});
  });

  it("tolerates bulleted note lines", () => {
    const { notes } = parseExtractionReply("=== STYLE NOTES ===\n- Color: cream and navy\n=== PROMPT ===\nx");
    expect(notes.color).toBe("cream and navy");
  });
});

describe("compilePrompt reference modes", () => {
  const base = {
    templateName: "Collegiate 01",
    promptBody: "Make something for {{ATHLETE_NAME}}.",
    variables: { ATHLETE_NAME: "Darnell Mooney" },
    referenceSetName: "Vintage Collegiate",
    referenceCount: 4,
  };

  it("includes mood-board framing when images are attached", () => {
    const out = compilePrompt({ ...base, referenceMode: "with_references" });
    expect(out).toContain("visual mood board");
    expect(out).toContain("REFERENCES — Vintage Collegiate (4 images)");
  });

  it("omits the reference block entirely in prompt-only mode", () => {
    const out = compilePrompt({ ...base, referenceMode: "prompt_only" });
    expect(out).not.toContain("REFERENCES");
    expect(out).not.toContain("mood board");
    expect(out).toContain(DEFAULT_OUTPUT_REQUIREMENTS);
  });

  it("defaults to attaching references when no mode is given", () => {
    expect(compilePrompt(base)).toContain("REFERENCES —");
  });

  it("still forbids copying any single reference", () => {
    expect(compilePrompt({ ...base, referenceMode: "with_references" })).toContain("Do not reproduce");
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
