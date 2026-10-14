import { describe, expect, it } from "vitest";
import {
  PNG_CREATION_DEFAULT,
  PNG_CREATION_KEY,
  SYSTEM_PROMPT_DEFAULTS,
  composeSystemPrompt,
  productionPngState,
} from "./prompts";

describe("PNG Creation prompt", () => {
  it("is registered under its key", () => {
    expect(SYSTEM_PROMPT_DEFAULTS[PNG_CREATION_KEY]).toBe(PNG_CREATION_DEFAULT);
    expect(PNG_CREATION_DEFAULT.name).toBe("PNG Creation");
    expect(PNG_CREATION_DEFAULT.category).toBe("Production Utility");
  });

  it("asks for extraction, not a new design", () => {
    const body = PNG_CREATION_DEFAULT.body;
    expect(body).toContain("Extract the primary apparel graphic");
    expect(body).toContain("Do not redesign, reinterpret, modernize, or add new creative elements");
    expect(body).toContain("Transparent background");
    expect(body).toContain("Reconstruct any areas of the design");
  });

  it("names the things that must come out of the image", () => {
    for (const removed of ["Shirt or garment", "Model/person", "Folds", "Wrinkles", "Hangers", "Tags"]) {
      expect(PNG_CREATION_DEFAULT.body).toContain(removed);
    }
  });
});

describe("composeSystemPrompt", () => {
  const body = "MASTER BODY";

  it("returns the master text untouched when nothing is added", () => {
    expect(composeSystemPrompt({ body })).toBe("MASTER BODY");
  });

  it("appends rather than edits, so the master is never rewritten per use", () => {
    const out = composeSystemPrompt({
      body,
      designName: "Abbotsford Collegiate Crest",
      additionalInstructions: "Keep the cream distressing.",
    });
    expect(out.startsWith("MASTER BODY")).toBe(true);
    expect(out).toContain("DESIGN NAME\nAbbotsford Collegiate Crest");
    expect(out).toContain("ADDITIONAL INSTRUCTIONS\nKeep the cream distressing.");
    expect(out.indexOf("DESIGN NAME")).toBeLessThan(out.indexOf("ADDITIONAL INSTRUCTIONS"));
  });

  it("ignores blank extras instead of emitting an empty heading", () => {
    const out = composeSystemPrompt({ body, designName: "   ", additionalInstructions: "\n " });
    expect(out).toBe("MASTER BODY");
  });
});

describe("productionPngState", () => {
  it("is pending until a design is attached", () => {
    expect(productionPngState({})).toBe("pending");
    expect(productionPngState({ designs: [] })).toBe("pending");
    expect(productionPngState({ designs: null })).toBe("pending");
  });

  it("is ready once one is", () => {
    expect(productionPngState({ designs: [{ design_id: "d1" }] })).toBe("ready");
  });
});
