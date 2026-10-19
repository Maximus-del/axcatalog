import { describe, expect, it } from "vitest";
import { STUDIO_NAV, isLibraryTab, sectionOf } from "./studio-nav";

describe("sectionOf", () => {
  it("maps every existing V2 address to a section", () => {
    expect(sectionOf("/admin-v2")).toBe("today");
    expect(sectionOf("/admin-v2/")).toBe("today");
    expect(sectionOf("/admin-v2/work")).toBe("work");
    expect(sectionOf("/admin-v2/desk")).toBe("work");
    expect(sectionOf("/admin-v2/people")).toBe("clients");
    expect(sectionOf("/admin-v2/people/abc/library")).toBe("clients");
    expect(sectionOf("/admin-v2/people/abc/pricing")).toBe("clients");
    expect(sectionOf("/admin-v2/creative")).toBe("studio");
    expect(sectionOf("/admin-v2/creative", "?tab=prompts")).toBe("studio");
    expect(sectionOf("/admin-v2/library")).toBe("library");
    expect(sectionOf("/admin-v2/releases")).toBe("releases");
    expect(sectionOf("/admin-v2/commerce")).toBe("business");
    expect(sectionOf("/admin-v2/commerce/blanks/x")).toBe("business");
    expect(sectionOf("/admin-v2/orders")).toBe("business");
    expect(sectionOf("/admin-v2/products/p1")).toBe("business");
  });

  it("treats the old Creative shelf links as the Library", () => {
    expect(sectionOf("/admin-v2/creative", "?tab=mockups")).toBe("library");
    expect(sectionOf("/admin-v2/creative", "?tab=designs&q=x")).toBe("library");
    // Overview's Action Required sends a bare stage filter.
    expect(sectionOf("/admin-v2/creative", "?stage=awaiting_approval")).toBe("library");
  });

  it("keeps unknown addresses inside the shell", () => {
    expect(sectionOf("/admin-v2/nope")).toBe("today");
  });
});

describe("STUDIO_NAV", () => {
  it("lists the seven approved sections in order", () => {
    expect(STUDIO_NAV.map((n) => n.label)).toEqual([
      "Today",
      "Projects & Tasks",
      "Client Spaces",
      "Creative Studio",
      "Asset Library",
      "Releases",
      "Business",
    ]);
  });

  it("only end-matches the index route", () => {
    expect(STUDIO_NAV.filter((n) => n.end).map((n) => n.to)).toEqual(["/admin-v2"]);
  });

  it("recognises library tabs", () => {
    expect(isLibraryTab("designs")).toBe(true);
    expect(isLibraryTab("prompts")).toBe(false);
    expect(isLibraryTab(null)).toBe(false);
  });
});
