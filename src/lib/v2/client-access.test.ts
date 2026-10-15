import { describe, expect, it } from "vitest";
import { EMPTY_ACCESS, handoffText, hasClientLogin, splitAccess, type ClientLogin } from "./client-access";

function link(over: Partial<ClientLogin> = {}): ClientLogin {
  return { userId: "u1", email: "a@b.com", fullName: "A B", role: "client", ...over };
}

describe("splitAccess", () => {
  it("counts a client login as client access", () => {
    const a = splitAccess([link()]);
    expect(a.clients).toHaveLength(1);
    expect(a.operators).toHaveLength(0);
  });

  it("does NOT count an AX admin linked for impersonation", () => {
    // Both existing user_athlete_links rows are AX admin accounts pointed at
    // Darnell. Treating those as "he can log in" would report the job done.
    const a = splitAccess([link({ userId: "ax1", role: "admin" }), link({ userId: "ax2", role: "admin" })]);
    expect(a.clients).toHaveLength(0);
    expect(a.operators).toHaveLength(2);
    expect(hasClientLogin(a)).toBe(false);
  });

  it("does not count an owner either", () => {
    expect(hasClientLogin(splitAccess([link({ role: "owner" })]))).toBe(false);
  });

  it("separates the two when both exist", () => {
    const a = splitAccess([link({ userId: "ax", role: "admin" }), link({ userId: "dm", role: "client" })]);
    expect(a.operators.map((l) => l.userId)).toEqual(["ax"]);
    expect(a.clients.map((l) => l.userId)).toEqual(["dm"]);
    expect(hasClientLogin(a)).toBe(true);
  });

  it("treats a link whose profile is missing as a client rather than hiding it", () => {
    // A link with no user_profiles row still grants portal access, so it must
    // not vanish from the count just because the profile read came back empty.
    expect(hasClientLogin(splitAccess([link({ role: null, email: null })]))).toBe(true);
  });

  it("keeps every link in links, whatever its role", () => {
    expect(splitAccess([link({ role: "admin" }), link({ userId: "b" })]).links).toHaveLength(2);
  });
});

describe("hasClientLogin", () => {
  it("is false for nothing at all", () => {
    expect(hasClientLogin(EMPTY_ACCESS)).toBe(false);
    expect(hasClientLogin(undefined)).toBe(false);
    expect(hasClientLogin(null)).toBe(false);
  });
});

describe("handoffText", () => {
  const out = handoffText("Darnell Mooney", "d@m.com", "AX-1234-abcd", "https://ax.example");

  it("opens with a first name", () => {
    expect(out.startsWith("Darnell — your AX portal is ready.")).toBe(true);
  });

  it("carries the three things they need and nothing else", () => {
    expect(out).toContain("https://ax.example/login");
    expect(out).toContain("d@m.com");
    expect(out).toContain("AX-1234-abcd");
  });

  it("says the password is temporary, because the app will force a change", () => {
    expect(out).toContain("set your own password");
  });

  it("survives a one-word or empty name", () => {
    expect(handoffText("Mooney", "e", "p", "o").startsWith("Mooney —")).toBe(true);
    expect(handoffText("", "e", "p", "o").startsWith("there —")).toBe(true);
  });

  it("stays short enough to paste into a text message", () => {
    expect(out.length).toBeLessThan(260);
  });
});

import { PORTAL_SIGN_IN_URL, loginStage, signInText } from "./client-access";

describe("loginStage", () => {
  it("reads the three states from the two facts auth.users holds", () => {
    expect(loginStage(null, true)).toBe("waiting");
    expect(loginStage("2026-10-15T05:00:00Z", true)).toBe("needs_password");
    expect(loginStage("2026-10-15T05:00:00Z", false)).toBe("active");
  });

  it("a reset after they had signed in puts them back on the one-time password", () => {
    expect(loginStage("2026-10-01T00:00:00Z", true)).toBe("needs_password");
  });
});

describe("signInText", () => {
  it("points at production, never a preview, and carries no password", () => {
    const out = signInText("Darnell Mooney", "d@m.com");
    expect(PORTAL_SIGN_IN_URL).toBe("https://chase-dashboard-phi.vercel.app/login");
    expect(out).toContain(PORTAL_SIGN_IN_URL);
    expect(out).toContain("d@m.com");
    expect(out.toLowerCase()).not.toContain("password");
    expect(out.startsWith("Darnell —")).toBe(true);
  });
});
