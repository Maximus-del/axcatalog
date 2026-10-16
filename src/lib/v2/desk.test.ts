import { describe, expect, it } from "vitest";
import { conceptProblem, deskError, filterThreads, toDrop, toLocalInput, toThread, toThreadDetail } from "./desk";

const thread = (o: Record<string, unknown> = {}) =>
  toThread({ id: "t1", athleteId: "a", clientName: "Darnell Mooney", kind: "project", title: "Giants hoodie", waitingOnAx: true, lastMessage: "Here is my idea", ...o });

describe("client desk", () => {
  it("parses a thread, defaulting what the server left out", () => {
    const t = thread();
    expect(t.kind).toBe("project");
    expect(t.waitingOnAx).toBe(true);
    expect(toThread({ id: "x" }).kind).toBe("conversation");
    expect(toThread({ id: "x" }).clientName).toBe("Client");
  });

  it("filters waiting-on-AX and searches client, title and message", () => {
    const list = [thread(), thread({ id: "t2", waitingOnAx: false, clientName: "Keon Coleman", title: "Camp tees", lastMessage: "Sizes?" })];
    expect(filterThreads(list, "waiting", "").map((t) => t.id)).toEqual(["t1"]);
    expect(filterThreads(list, "all", "coleman").map((t) => t.id)).toEqual(["t2"]);
    expect(filterThreads(list, "all", "idea").map((t) => t.id)).toEqual(["t1"]);
  });

  it("puts signed URLs on concepts, inspiration and attachments; unsigned stays null", () => {
    const d = toThreadDetail(
      {
        id: "t1",
        inspiration: [{ id: "u1", name: "ref.png", mime: "image/png" }],
        concepts: [{ id: "c1", version: 2, superseded: false, decision: "request_changes", feedback: "Bigger 17" }],
        messages: [{ id: "m1", body: "hi", fromAx: true, attachments: [{ id: "u2", name: "a.pdf" }] }],
      },
      { u1: "https://s/u1", c1: "https://s/c1" },
    );
    expect(d.inspiration[0].url).toBe("https://s/u1");
    expect(d.concepts[0].url).toBe("https://s/c1");
    expect(d.concepts[0].decision).toBe("request_changes");
    expect(d.messages[0].attachments[0].url).toBeNull();
  });

  it("only accepts preview images as concepts", () => {
    expect(conceptProblem({ type: "image/png", size: 1000 })).toBeNull();
    expect(conceptProblem({ type: "application/pdf", size: 1000 })).toMatch(/PNG/);
    expect(conceptProblem({ type: "image/jpeg", size: 20 * 1024 * 1024 })).toMatch(/15 MB/);
  });

  it("reads field errors and access errors in plain words", () => {
    expect(deskError({ code: "P0422", message: "date", details: '{"scheduledLocal":"Pick a date and time"}' }).message).toBe("Pick a date and time");
    expect(deskError({ code: "42501", message: "Not authorized" }).message).toMatch(/can't/);
    expect(deskError({ code: "P0002", message: "not found" }).message).toMatch(/Not found/);
  });

  it("shows a drop's time in its own zone for editing", () => {
    expect(toLocalInput("2027-06-04T22:00:00Z", "America/New_York")).toBe("2027-06-04T18:00");
    expect(toLocalInput(null, "UTC")).toBe("");
    expect(toDrop({ id: "d", reviewNote: "Move it" }).reviewNote).toBe("Move it");
  });
});
