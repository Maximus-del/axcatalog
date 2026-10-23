import { describe, expect, it } from "vitest";
import { DRIVE_STAGES, driveHref, lockerIsOpen, lockerSlugOf, readDrive, stageFor } from "./test-drive";
import { portalLink } from "@/components/portal/mooney/navigation";

const ID = "972f0aa1-e9d7-490e-b73d-4644bbe2eacb";

describe("test drive addresses", () => {
  it("sends pre-portal stages to the drive page", () => {
    expect(driveHref(ID, "team", "questions", "proactive")).toBe(`/test-drive/${ID}?role=team&stage=questions`);
  });
  it("sends portal stages to View-as with the role", () => {
    expect(driveHref(ID, "owner", "brand", "x")).toBe(`/portal/analytics?as=${ID}&drive=1`);
    expect(driveHref(ID, "team", "gear", "x")).toBe(`/portal/products?as=${ID}&drive=1&view=team`);
    expect(driveHref(ID, "team", "portal", "x")).toBe(`/portal?as=${ID}&drive=1&view=team`);
  });
  it("sends the customer to the locker", () => {
    expect(driveHref(ID, "customer", "invite", "proactive")).toBe(`/l/proactive?drive=1&entity=${ID}`);
  });
  it("never gives a role a stage it doesn't have", () => {
    expect(stageFor("team", "brand")).toBe("invite");
    expect(stageFor("owner", "gear")).toBe("invite");
    expect(stageFor("customer", "portal")).toBe("locker");
    expect(DRIVE_STAGES.team.map((s) => s.value)).not.toContain("brand");
  });
});

describe("reading the drive back", () => {
  it("round-trips every stage of every role", () => {
    for (const role of ["owner", "team", "customer"] as const) {
      for (const { value } of DRIVE_STAGES[role]) {
        const href = driveHref(ID, role, value, "proactive");
        const url = new URL(href, "https://x.test");
        const routeId = url.pathname.startsWith("/test-drive/") ? ID : undefined;
        expect(readDrive(url.pathname, url.search, routeId)).toEqual({ entityId: ID, role, stage: value });
      }
    }
  });
  it("is null outside a drive", () => {
    expect(readDrive("/portal", `?as=${ID}`)).toBeNull();
    expect(readDrive("/l/proactive", "")).toBeNull();
  });
  it("survives clicking around the portal", () => {
    const next = portalLink("/portal/content", `?as=${ID}&drive=1&view=team`);
    expect(next).toBe(`/portal/content?as=${ID}&view=team&drive=1`);
    expect(portalLink("/portal/content", "?drive=1")).toBe("/portal/content");
  });
});

describe("locker address", () => {
  it("prefers the chosen slug, then the record slug", () => {
    expect(lockerSlugOf({ public_locker: { slug: "proactive" } }, "proactive-sports-performance")).toBe("proactive");
    expect(lockerSlugOf({}, "proactive-sports-performance")).toBe("proactive-sports-performance");
    expect(lockerIsOpen({ public_locker: { enabled: true } })).toBe(true);
    expect(lockerIsOpen(null)).toBe(false);
  });
});
