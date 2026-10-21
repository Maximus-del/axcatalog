import { describe, expect, it } from "vitest";
import { briefFor, briefProblem, parseLinks } from "./studio-start";

describe("studio starts", () => {
  it("fresh keeps the old title shape", () => {
    expect(briefFor({ start: "fresh", kindLabel: "New Merch", idea: "Gym tee", details: "" })).toEqual({ title: "New Merch: Gym tee", details: null });
  });
  it("remix names the design it starts from", () => {
    const b = briefFor({ start: "remix", kindLabel: "New Merch", idea: "Make it a hoodie", details: "Black", design: { title: "Strength Club", designNumber: "D-12" } });
    expect(b.title).toBe("Remix #D-12 Strength Club: Make it a hoodie");
    expect(b.details).toBe("Starting from: Strength Club (#D-12)\nBlack");
  });
  it("inspiration carries its links", () => {
    const b = briefFor({ start: "inspire", kindLabel: "Collection", idea: "The font", details: "", links: ["https://pin.it/abc"] });
    expect(b.title).toBe("Inspired by · Collection: The font");
    expect(b.details).toContain("Links: https://pin.it/abc");
  });
  it("finds links in pasted text", () => {
    expect(parseLinks("look https://a.com/x, and\nhttps://b.com/y https://a.com/x")).toEqual(["https://a.com/x", "https://b.com/y"]);
  });
  it("asks for the right first thing", () => {
    expect(briefProblem({ start: "remix", idea: "x", hasDesign: false, uploads: 0, links: 0 })).toMatch(/Pick one/);
    expect(briefProblem({ start: "inspire", idea: "x", hasDesign: false, uploads: 0, links: 1 })).toBeNull();
    expect(briefProblem({ start: "fresh", idea: " ", hasDesign: false, uploads: 0, links: 0 })).toMatch(/idea/);
  });
});
