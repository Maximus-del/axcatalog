// Name resolution and role→module mapping are read by every surface. The
// "Abbotsford Senior undefined" class of bug comes from assembling names at call
// sites, so these pin the single resolver's behaviour on every entity shape.
import { describe, it, expect } from "vitest";
import {
  displayNameOf,
  entityTypeOf,
  fieldsFor,
  hasModule,
  hasRole,
  initialsOf,
  matchesFilter,
  modulesFor,
  rolesOf,
} from "./entity";

describe("displayNameOf", () => {
  it("prefers an explicit display name", () => {
    expect(displayNameOf({ display_name: "Goat Farm Media", first_name: "Goat", last_name: "Farm" })).toBe("Goat Farm Media");
  });

  it("falls back to full_name, then to assembled parts", () => {
    expect(displayNameOf({ full_name: "Darnell Mooney" })).toBe("Darnell Mooney");
    expect(displayNameOf({ first_name: "Darnell", last_name: "Mooney" })).toBe("Darnell Mooney");
  });

  it("never emits a dangling undefined or null when there is no last name", () => {
    expect(displayNameOf({ first_name: "Abbotsford Senior Secondary", last_name: null })).toBe("Abbotsford Senior Secondary");
    expect(displayNameOf({ first_name: "Cher", last_name: "" })).toBe("Cher");
    expect(displayNameOf({ display_name: null, full_name: null, first_name: "Prince" })).toBe("Prince");
  });

  it("ignores whitespace-only values rather than rendering blanks", () => {
    expect(displayNameOf({ display_name: "   ", full_name: "Real Name" })).toBe("Real Name");
    expect(displayNameOf({ display_name: "  ", full_name: "  ", first_name: "  ", last_name: "  " })).toBe("Unnamed");
  });

  it("handles a missing entity at all", () => {
    expect(displayNameOf(null)).toBe("Unnamed");
    expect(displayNameOf(undefined)).toBe("Unnamed");
  });
});

describe("initialsOf", () => {
  it("uses two words when available", () => {
    expect(initialsOf({ display_name: "Darnell Mooney" })).toBe("DM");
  });

  it("uses the first two letters of a single-word name", () => {
    expect(initialsOf({ display_name: "Nike" })).toBe("NI");
  });

  it("falls back rather than rendering nothing", () => {
    expect(initialsOf(null)).toBe("AX");
  });
});

describe("roles", () => {
  it("defaults to athlete so existing records behave as before", () => {
    expect(rolesOf({})).toEqual(["athlete"]);
    expect(rolesOf({ roles: [] })).toEqual(["athlete"]);
  });

  it("supports several roles at once", () => {
    const gfm = { roles: ["client", "partner"] };
    expect(hasRole(gfm, "client")).toBe(true);
    expect(hasRole(gfm, "partner")).toBe(true);
    expect(hasRole(gfm, "athlete")).toBe(false);
  });

  it("drops values that are not real roles", () => {
    expect(rolesOf({ roles: ["client", "nonsense"] })).toEqual(["client"]);
  });
});

describe("entityTypeOf", () => {
  it("defaults to person and normalizes unknown types", () => {
    expect(entityTypeOf({})).toBe("person");
    expect(entityTypeOf({ entity_type: "school" })).toBe("school");
    expect(entityTypeOf({ entity_type: "spaceship" })).toBe("other");
  });
});

describe("modulesFor", () => {
  it("gives an athlete the fan-facing modules", () => {
    const a = { roles: ["athlete"] };
    expect(hasModule(a, "fan_profile")).toBe(true);
    expect(hasModule(a, "drops")).toBe(true);
    expect(hasModule(a, "orders")).toBe(false);
  });

  it("gives a client commerce modules but not a fan profile", () => {
    const c = { roles: ["client"], entity_type: "organization" };
    expect(hasModule(c, "orders")).toBe(true);
    expect(hasModule(c, "projects")).toBe(true);
    expect(hasModule(c, "fan_profile")).toBe(false);
  });

  it("unions modules when an entity holds several roles", () => {
    const both = { roles: ["athlete", "client"] };
    expect(hasModule(both, "fan_profile")).toBe(true);
    expect(hasModule(both, "orders")).toBe(true);
  });

  it("adds contacts for organizations and schools regardless of role", () => {
    expect(hasModule({ roles: ["client"], entity_type: "school" }, "contacts")).toBe(true);
    expect(hasModule({ roles: ["client"], entity_type: "person" }, "contacts")).toBe(false);
  });

  it("lets an explicit capability switch a module on or off", () => {
    expect(hasModule({ roles: ["client"], capabilities: { access: true } }, "access")).toBe(true);
    expect(hasModule({ roles: ["athlete"], capabilities: { access: false } }, "access")).toBe(false);
  });

  it("returns a stable set with no duplicates across roles", () => {
    const mods = modulesFor({ roles: ["athlete", "client"] });
    expect(new Set(mods).size).toBe(mods.length);
  });
});

describe("fieldsFor", () => {
  it("asks a person for a surname and athletic details", () => {
    const f = fieldsFor("person");
    expect(f.showLastName).toBe(true);
    expect(f.showAthleticFields).toBe(true);
    expect(f.nameLabel).toBe("First name");
  });

  it("never asks an organization for a surname or a jersey number", () => {
    for (const t of ["organization", "school", "brand", "facility"]) {
      const f = fieldsFor(t);
      expect(f.showLastName).toBe(false);
      expect(f.showAthleticFields).toBe(false);
      expect(f.nameLabel).toBe("Name");
    }
  });
});

describe("matchesFilter", () => {
  const darnell = { roles: ["athlete", "client"], entity_type: "person" };
  const goatFarm = { roles: ["client", "partner"], entity_type: "organization" };
  const school = { roles: ["client"], entity_type: "school" };

  it("puts a dual-role person in both directories, as the same record", () => {
    expect(matchesFilter(darnell, "athletes")).toBe(true);
    expect(matchesFilter(darnell, "clients")).toBe(true);
  });

  it("keeps an organization out of the athletes directory", () => {
    expect(matchesFilter(goatFarm, "athletes")).toBe(false);
    expect(matchesFilter(goatFarm, "clients")).toBe(true);
    expect(matchesFilter(goatFarm, "organizations")).toBe(true);
  });

  it("filters by entity type where the tab is type-based", () => {
    expect(matchesFilter(school, "schools")).toBe(true);
    expect(matchesFilter(goatFarm, "schools")).toBe(false);
  });

  it("passes everything through the all tab", () => {
    for (const e of [darnell, goatFarm, school]) expect(matchesFilter(e, "all")).toBe(true);
  });
});
