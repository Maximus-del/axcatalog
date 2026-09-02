import { describe, expect, it } from "vitest";
import { ENTITY_SECTIONS, entityCartHref, entityHref, entityLibraryHref, isEntitySection } from "./entity-nav";

describe("an athlete's addresses", () => {
  it("keeps the overview at the bare route, so every existing link still lands", () => {
    expect(entityHref("e1")).toBe("/admin-v2/people/e1");
  });

  it("puts the full pipeline under /library", () => {
    expect(entityLibraryHref("e1")).toBe("/admin-v2/people/e1/library");
  });

  it("writes no query string when there is nothing to say", () => {
    expect(entityLibraryHref("e1")).not.toContain("?");
  });

  it("carries the section to scroll to", () => {
    expect(entityLibraryHref("e1", { focus: "mockups" })).toBe("/admin-v2/people/e1/library?focus=mockups");
  });

  it("still opens a mockup by id, which is what the old deep links did", () => {
    expect(entityLibraryHref("e1", { mockup: "m1" })).toBe("/admin-v2/people/e1/library?mockup=m1");
  });

  it("opens the builder", () => {
    expect(entityLibraryHref("e1", { build: true })).toBe("/admin-v2/people/e1/library?build=1");
  });

  it("combines targets without dropping any", () => {
    const href = entityLibraryHref("e1", { focus: "mockups", vary: "m9" });
    expect(href).toContain("focus=mockups");
    expect(href).toContain("vary=m9");
  });

  it("has its own address for the cart", () => {
    expect(entityCartHref("e1")).toBe("/admin-v2/people/e1/cart");
  });
});

describe("section names", () => {
  it("recognises the five pipeline steps", () => {
    for (const s of ENTITY_SECTIONS) expect(isEntitySection(s)).toBe(true);
  });

  it("rejects anything else, so a stale ?focus= cannot scroll to nowhere", () => {
    expect(isEntitySection("orders")).toBe(false);
    expect(isEntitySection(null)).toBe(false);
    expect(isEntitySection("")).toBe(false);
  });
});

describe("landing on the right design shelf", () => {
  it("carries the shelf so View all does not dump you on 'All'", () => {
    expect(entityLibraryHref("e1", { focus: "designs", shelf: "concept" })).toContain("shelf=concept");
    expect(entityLibraryHref("e1", { focus: "designs", shelf: "ready" })).toContain("shelf=ready");
  });

  it("omits the default, so the common link stays clean", () => {
    expect(entityLibraryHref("e1", { focus: "designs", shelf: "all" })).not.toContain("shelf=");
  });

  it("still carries the section it was going to anyway", () => {
    expect(entityLibraryHref("e1", { focus: "designs", shelf: "concept" })).toContain("focus=designs");
  });
});
