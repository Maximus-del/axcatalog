import { describe, expect, it } from "vitest";
import { entityVoice, initialsOf, shortNameOf, type VoiceInput } from "./entity-voice";

/** The three non-person entities that hold live rows in `athletes` today. */
const DASH_LETICS: VoiceInput = {
  display_name: "Dash Letics",
  first_name: "Dashletics",
  last_name: ".",
  full_name: "Dashletics .",
  entity_type: "organization",
  roles: ["client", "partner"],
};
const ABBOTSFORD: VoiceInput = {
  display_name: "Abbotsford Senior Secondary",
  first_name: "Abbotsford Senior Secondary",
  last_name: "",
  full_name: "Abbotsford Senior Secondary ",
  entity_type: "school",
  roles: ["client"],
};
const MOONEY: VoiceInput = {
  display_name: null,
  first_name: "Darnell",
  last_name: "Mooney",
  full_name: "Darnell Mooney",
  entity_type: "person",
  roles: ["athlete"],
  position: "WR",
};

describe("names", () => {
  it("prefers display_name over the generated full_name", () => {
    // full_name is generated from first + last, so Dash Letics reads
    // "Dashletics ." everywhere the portal concatenated instead of asking.
    expect(entityVoice(DASH_LETICS).name).toBe("Dash Letics");
    expect(entityVoice(DASH_LETICS).name).not.toContain(".");
  });

  it("drops the trailing space a null last_name leaves behind", () => {
    expect(entityVoice(ABBOTSFORD).name).toBe("Abbotsford Senior Secondary");
  });

  it("still resolves an ordinary athlete", () => {
    expect(entityVoice(MOONEY).name).toBe("Darnell Mooney");
  });

  it("never renders 'undefined' for a missing entity", () => {
    const v = entityVoice(null);
    expect(v.name).toBe("Unnamed");
    expect(v.initials).toBe("AX");
  });
});

describe("initials", () => {
  it("takes one letter from each of the first two words", () => {
    expect(initialsOf("Darnell Mooney")).toBe("DM");
    expect(initialsOf("Abbotsford Senior Secondary")).toBe("AS");
  });

  it("takes two letters from a single-word name", () => {
    expect(initialsOf("Dashletics")).toBe("DA");
  });

  it("ignores punctuation-only words rather than printing a dot", () => {
    expect(initialsOf("Dashletics .")).toBe("DA");
  });
});

describe("subtitle", () => {
  it("shows an athlete's position", () => {
    expect(entityVoice(MOONEY).subtitle).toBe("WR");
  });

  it("falls back to Athlete for a person with no position", () => {
    expect(entityVoice({ ...MOONEY, position: null }).subtitle).toBe("Athlete");
  });

  it("says what an organisation is instead of calling it an athlete", () => {
    expect(entityVoice(DASH_LETICS).subtitle).toBe("Organization");
    expect(entityVoice(ABBOTSFORD).subtitle).toBe("School");
  });
});

describe("what applies to whom", () => {
  it("offers jersey personalisation to athletes only", () => {
    expect(entityVoice(MOONEY).supportsJerseyPersonalisation).toBe(true);
    expect(entityVoice(ABBOTSFORD).supportsJerseyPersonalisation).toBe(false);
    expect(entityVoice(DASH_LETICS).supportsJerseyPersonalisation).toBe(false);
  });

  it("shows the athlete tier ladder to athletes only", () => {
    expect(entityVoice(MOONEY).showsAthleteTier).toBe(true);
    expect(entityVoice(ABBOTSFORD).showsAthleteTier).toBe(false);
  });

  it("treats a person with no roles recorded as an athlete", () => {
    // The portal's original case. Most person rows predate the roles column.
    const v = entityVoice({ first_name: "Ana", last_name: "Ruiz", entity_type: "person", roles: [] });
    expect(v.isAthlete).toBe(true);
    expect(v.supportsJerseyPersonalisation).toBe(true);
  });

  it("does not treat a client-only person as an athlete", () => {
    const v = entityVoice({ first_name: "Sam", last_name: "Ray", entity_type: "person", roles: ["client"] });
    expect(v.isAthlete).toBe(false);
    expect(v.showsAthleteTier).toBe(false);
  });

  it("treats a team AX works with as an athlete-role entity but not a person", () => {
    const v = entityVoice({ display_name: "Proactive", entity_type: "team", roles: ["athlete", "client"] });
    expect(v.isAthlete).toBe(true);
    expect(v.isPerson).toBe(false);
    expect(v.supportsJerseyPersonalisation).toBe(false);
  });

  it("defaults an unknown entity_type to a neutral label rather than Athlete", () => {
    expect(entityVoice({ display_name: "X", entity_type: "consortium" }).kindLabel).toBe("Partner");
  });
});

describe("possessive", () => {
  it("adds 's", () => {
    expect(entityVoice(MOONEY).possessive).toBe("Darnell Mooney's");
  });

  it("adds a bare apostrophe after a trailing s", () => {
    expect(entityVoice({ display_name: "Dallas", entity_type: "team" }).possessive).toBe("Dallas'");
  });
});

describe("brandHeading", () => {
  it("says Brand to an athlete and Account to everyone else", () => {
    expect(entityVoice(MOONEY).brandHeading).toBe("Your Brand");
    expect(entityVoice(ABBOTSFORD).brandHeading).toBe("Your Account");
  });
});

describe("shortNameOf", () => {
  it("uses a first name for a person", () => {
    expect(shortNameOf(MOONEY)).toBe("Darnell");
  });

  it("uses the whole name for an organisation — 'Dashletics' is not a first name", () => {
    expect(shortNameOf(DASH_LETICS)).toBe("Dash Letics");
    expect(shortNameOf(ABBOTSFORD)).toBe("Abbotsford Senior Secondary");
  });
});
