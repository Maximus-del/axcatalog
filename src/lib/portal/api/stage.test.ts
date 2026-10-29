import { describe, expect, it } from "vitest";
import { toDestination, type CollectionRow } from "./destinations";
import { parseWorld } from "../portal-theme";

const row = (cfg: Record<string, unknown>): CollectionRow => ({
  id: "c1", name: "Darnell Mooney x Bears", slug: "bears", status: "active", athlete_id: "a",
  metadata: { portal_destination: cfg }, team: null,
});

describe("home room stage", () => {
  it("keeps a collection on stage unless it says otherwise", () => {
    expect(toDestination(row({ key: "football-tour" }), 6)?.onStage).toBe(true);
    expect(toDestination(row({ key: "chicago", on_stage: false }), 16)?.onStage).toBe(false);
  });
  it("a filter-only collection is still a destination (My Gear chip); hidden is not", () => {
    expect(toDestination(row({ key: "chicago", on_stage: false }), 16)?.id).toBe("chicago");
    expect(toDestination(row({ key: "x", hidden: true }), 1)).toBeNull();
  });
});

describe("phone room photo", () => {
  it("reads a safe portrait photo and drops anything else", () => {
    expect(parseWorld({ heroUrl: "/mooney/wrld/room.webp", heroMobileUrl: "/mooney/wrld/room-mobile.webp" }).heroMobileUrl).toBe("/mooney/wrld/room-mobile.webp");
    expect(parseWorld({ heroMobileUrl: "javascript:alert(1)" }).heroMobileUrl).toBe("");
    expect(parseWorld({}).heroMobileUrl).toBe("");
  });
});
