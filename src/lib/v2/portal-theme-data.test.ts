import { describe, expect, it } from "vitest";
import { teamPreset } from "./portal-theme-data";

// Real team colours from the `teams` rows Darnell Mooney's memberships point at.
describe("teamPreset", () => {
  it("puts the darker colour in the header and the other on the accent", () => {
    const bears = teamPreset("Bears", "#0B162A", "#C83803")!;
    expect(bears.theme.header).toBe("#0b162a");
    expect(bears.theme.accent).toBe("#c83803");
    // Order in the row does not matter.
    const flipped = teamPreset("Bears", "#C83803", "#0B162A")!;
    expect(flipped.theme.header).toBe("#0b162a");
  });

  it("Falcons red/black gives a black header and red accent", () => {
    const falcons = teamPreset("Falcons", "#A71930", "#000000")!;
    expect(falcons.theme.header).toBe("#000000");
    expect(falcons.theme.accent).toBe("#a71930");
  });

  it("does not make a black-on-black theme from two near-black colours", () => {
    const p = teamPreset("Raiders", "#000000", "#0a0a0a")!;
    expect(p.theme.accent).toBe("#000000");
    expect(p.theme.header).toBe("#0d0d0d");
  });

  it("uses one colour as the accent when that is all there is, and skips teams with none", () => {
    expect(teamPreset("Giants", "#0B2265", null)!.theme.accent).toBe("#0b2265");
    expect(teamPreset("Nobody", null, "not a colour")).toBeNull();
  });
});
