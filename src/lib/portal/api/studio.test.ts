import { describe, expect, it } from "vitest";
import { toProject, uploadProblem } from "./studio";

describe("project shape", () => {
  const raw = {
    id: "p1",
    title: "Giants Inspired",
    kind: "new_merch",
    destinationId: "new-york",
    status: "feedback",
    version: 3,
    brief: { idea: "Giants hoodie", vibes: ["Streetwear"] },
    updatedAt: "2026-10-15T06:00:00Z",
    unread: true,
    concepts: [
      { id: "c2", conceptKey: "k", version: 2, title: "Giants Hoodie", decision: null },
      { id: "c9", conceptKey: "k9", version: 1, title: null, decision: "request_changes" },
    ],
  };
  it("maps the server project and attaches signed concept URLs", () => {
    const p = toProject(raw, { c2: "https://signed/c2" });
    expect(p).toMatchObject({ id: "p1", status: "feedback", version: 3, destinationId: "new-york", unread: true });
    expect(p.concepts[0]).toMatchObject({ id: "c2", version: 2, imageUrl: "https://signed/c2" });
  });
  it("an image that could not be signed is an empty string, not a broken URL", () => {
    expect(toProject(raw, {}).concepts[1].imageUrl).toBe("");
  });
  it("carries the exact version a decision must quote", () => {
    const p = toProject(raw);
    expect(p.version).toBe(3);
    expect(p.concepts.map((c) => c.version)).toEqual([2, 1]);
  });
});

describe("upload pre-check", () => {
  it("accepts the allowed types up to 10 MB", () => {
    expect(uploadProblem({ type: "image/png", size: 2048 })).toBeNull();
    expect(uploadProblem({ type: "application/pdf", size: 10 * 1024 * 1024 })).toBeNull();
  });
  it("explains what is wrong", () => {
    expect(uploadProblem({ type: "image/svg+xml", size: 10 })).toMatch(/PNG/);
    expect(uploadProblem({ type: "image/png", size: 10 * 1024 * 1024 + 1 })).toMatch(/10 MB/);
    expect(uploadProblem({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
});
