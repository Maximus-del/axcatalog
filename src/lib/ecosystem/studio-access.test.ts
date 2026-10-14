import { describe, expect, it } from "vitest";
import { studioAccessFor } from "./studio-access";

describe("studio access, phase one", () => {
  it("lets operators through", () => {
    const a = studioAccessFor({ kind: "operator" });
    expect(a.allowed).toBe(true);
    expect(a.teaser).toBe(false);
  });

  it("teases athletes on their own profile rather than hiding it", () => {
    const a = studioAccessFor({ kind: "athlete", ownsSubject: true });
    expect(a.allowed).toBe(false);
    expect(a.teaser).toBe(true);
    expect(a.upsell).toBeTruthy();
  });

  it("does not even tease an athlete on someone else's products", () => {
    const a = studioAccessFor({ kind: "athlete", ownsSubject: false });
    expect(a.allowed).toBe(false);
    expect(a.teaser).toBe(false);
  });

  it("treats a follower as unpaid", () => {
    const a = studioAccessFor({ kind: "fan", tier: "follower" });
    expect(a.allowed).toBe(false);
    expect(a.teaser).toBe(true);
    expect(a.upsell?.cta).toMatch(/membership/i);
  });

  it("still withholds it from paying members in phase one, but says so kindly", () => {
    const a = studioAccessFor({ kind: "fan", tier: "subscriber" });
    expect(a.allowed).toBe(false);
    expect(a.teaser).toBe(true);
    expect(a.upsell?.body).toMatch(/idea|upload/i);
  });

  it("shows guests the locked door", () => {
    const a = studioAccessFor({ kind: "guest" });
    expect(a.allowed).toBe(false);
    expect(a.teaser).toBe(true);
  });

  it("never leaves a blocked case without a reason to show", () => {
    const actors = [
      { kind: "athlete", ownsSubject: true },
      { kind: "athlete", ownsSubject: false },
      { kind: "fan", tier: "none" },
      { kind: "fan", tier: "vip" },
      { kind: "guest" },
    ] as const;
    for (const actor of actors) {
      const a = studioAccessFor(actor);
      expect(a.reason.length).toBeGreaterThan(0);
      if (a.teaser) expect(a.upsell).toBeTruthy();
    }
  });
});
