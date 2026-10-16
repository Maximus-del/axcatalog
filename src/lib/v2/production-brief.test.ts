import { describe, expect, it } from "vitest";
import { MASTER_PROMPT, baseThree, blankLabel, buildBrief, designFolder, fullMessage, garmentWord, ownerFromName } from "./production-brief";

describe("production brief", () => {
  it("names folders and owners the library way", () => {
    expect(designFolder("atl", "Strength Club")).toBe("ATL — STRENGTH CLUB");
    expect(designFolder("", "Rise Up 1")).toBe("RISE UP 1");
    expect(ownerFromName("Darnell Mooney")).toBe("MOONEY");
    expect(blankLabel("Cotton Collective", "CCHOD475")).toBe("CC HOD475");
    expect(blankLabel("Axism", "7010")).toBe("AXISM 7010");
    expect(garmentWord("tee")).toBe("TEE");
    expect(garmentWord(null, "BOMBER JACKET")).toBe("JACKET");
  });

  it("picks the base 3 from the blank's own color names", () => {
    expect(baseThree(["White", "Black", "Graphite", "Tobacco Brown", "Navy"])).toEqual(["Black", "Graphite", "Tobacco Brown"]);
    expect(baseThree(["BLACK WHITE", "VINTAGE BLACK", "CHARCOAL OIL WASH", "CHOCOLATE OIL WASH"])).toEqual(["VINTAGE BLACK", "CHARCOAL OIL WASH", "CHOCOLATE OIL WASH"]);
    expect(baseThree(["White"])).toEqual([]);
  });

  it("builds Chase's ATL brief exactly", () => {
    const brief = buildBrief({
      owner: "atl",
      lineCode: "ATL",
      designName: "Strength Club",
      garments: [
        { garment: "TEE", blank: "AXISM 7010", colors: ["Black", "Graphite", "Mocha"] },
        { garment: "HOODIE", blank: "CC HOD475", colors: ["Black", "Graphite", "Mocha"] },
      ],
      placement: "front left chest + full back",
      numberVariants: "",
      notes: "",
    });
    expect(brief).toBe(
      [
        "Owner: ATL",
        "Design folder: ATL — STRENGTH CLUB",
        "Garments + blanks: TEE — AXISM 7010, HOODIE — CC HOD475",
        "Colors: Black, Graphite, Mocha",
        "Placement: front left chest + full back",
        "Number variants: none",
        "Notes: ",
      ].join("\n"),
    );
  });

  it("lists colors per garment when they differ, and the new-chat message drops the wait line", () => {
    const input = {
      owner: "MOONEY",
      lineCode: "MW",
      designName: "Comic Book",
      garments: [
        { garment: "TEE", blank: "AXISM 7010", colors: ["Black", "Graphite"] },
        { garment: "HOODIE", blank: "CC HOD475", colors: ["VINTAGE BLACK"] },
      ],
      placement: "full back only",
      numberVariants: "#11",
      notes: "keep the crescent gold",
    };
    expect(buildBrief(input)).toContain("  HOODIE — CC HOD475: VINTAGE BLACK");
    const msg = fullMessage(input);
    expect(msg.startsWith(MASTER_PROMPT.slice(0, 40))).toBe(true);
    expect(msg).not.toContain('Reply "Ready"');
    expect(msg).toContain("Design folder: MW — COMIC BOOK");
  });
});
