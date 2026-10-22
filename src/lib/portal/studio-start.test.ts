import { describe, expect, it } from "vitest";
import { briefFor, briefProblem, parseLinks } from "./studio-start";

describe("studio brief", () => {
  it("keeps the title shape", () => {
    expect(briefFor({ kindLabel: "New Merch", idea: "Gym tee", details: "" })).toEqual({ title: "New Merch: Gym tee", details: null });
  });
  it("carries pasted inspiration links ahead of the details", () => {
    const b = briefFor({ kindLabel: "Collection", idea: "The font", details: "Black and gold", links: ["https://pin.it/abc"] });
    expect(b.title).toBe("Collection: The font");
    expect(b.details).toBe("Inspiration links: https://pin.it/abc\nBlack and gold");
  });
  it("finds links in pasted text", () => {
    expect(parseLinks("look https://a.com/x, and\nhttps://b.com/y https://a.com/x")).toEqual(["https://a.com/x", "https://b.com/y"]);
  });
  it("only needs the idea", () => {
    expect(briefProblem({ idea: " " })).toMatch(/idea/);
    expect(briefProblem({ idea: "Gym tee" })).toBeNull();
  });
});
