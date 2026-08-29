import { describe, expect, it } from "vitest";
import {
  awaitingPreview,
  effectiveVisibility,
  groupVisibilitySummary,
  previewReadiness,
  promotableMembers,
  visibilityState,
  visibleCount,
  type ClientVisibility,
} from "./visibility";
import type { Design } from "./types";

function design(over: Partial<Design> = {}): Design {
  return {
    id: "d1",
    title: "Test",
    status: "concept",
    entityId: "e1",
    fileBucket: "design-files",
    filePath: "d1/art.png",
    fileType: "export",
    productionReady: true,
    clientVisibility: "hidden",
    hasPreview: false,
    previewPath: null,
    createdAt: "2026-01-01",
    ...over,
  };
}

describe("effectiveVisibility — the group is a ceiling", () => {
  const cases: Array<[ClientVisibility, ClientVisibility | null, ClientVisibility]> = [
    ["hidden", null, "hidden"],
    ["preview", null, "preview"],
    ["hidden", "hidden", "hidden"],
    ["hidden", "preview", "hidden"],
    ["preview", "hidden", "hidden"],
    ["preview", "preview", "preview"],
  ];

  it.each(cases)("design=%s group=%s -> %s", (d, g, expected) => {
    expect(effectiveVisibility(d, g)).toBe(expected);
  });

  it("never lets a visible group expose a design the operator hid", () => {
    expect(effectiveVisibility("hidden", "preview")).toBe("hidden");
  });

  it("never lets a hidden group leak a visible member", () => {
    expect(effectiveVisibility("preview", "hidden")).toBe("hidden");
  });
});

describe("visibilityState explains itself", () => {
  it("reports the group as the blocker when that is the reason", () => {
    expect(visibilityState("preview", "hidden")).toEqual({
      effective: "hidden",
      reason: "blocked-by-group",
    });
  });

  it("does not blame the group when the design is hidden anyway", () => {
    expect(visibilityState("hidden", "hidden").reason).toBe("hidden");
    expect(visibilityState("hidden", "preview").reason).toBe("hidden");
  });

  it("reports plain visibility for an ungrouped visible design", () => {
    expect(visibilityState("preview", null)).toEqual({ effective: "preview", reason: "visible" });
  });
});

describe("previewReadiness", () => {
  it("is ready only when a rendition exists", () => {
    expect(previewReadiness(design({ hasPreview: true }))).toBe("ready");
  });

  it("is pending when there is artwork but no rendition yet", () => {
    expect(previewReadiness(design({ hasPreview: false, filePath: "d1/art.png" }))).toBe("pending");
  });

  it("distinguishes 'nothing to render from' so the operator is not told to retry", () => {
    expect(previewReadiness(design({ hasPreview: false, filePath: null }))).toBe("no-source");
  });
});

describe("awaitingPreview", () => {
  it("catches designs marked visible that a client still cannot see", () => {
    const designs = [
      design({ id: "a", clientVisibility: "preview", hasPreview: true }),
      design({ id: "b", clientVisibility: "preview", hasPreview: false }),
      design({ id: "c", clientVisibility: "hidden", hasPreview: false }),
    ];
    expect(awaitingPreview(designs, () => null).map((d) => d.id)).toEqual(["b"]);
  });

  it("ignores designs whose group ceiling hides them anyway", () => {
    const designs = [design({ id: "b", clientVisibility: "preview", hasPreview: false })];
    expect(awaitingPreview(designs, () => "hidden")).toEqual([]);
  });
});

describe("promotableMembers", () => {
  it("lists exactly the members a 'make all visible' click would change", () => {
    const members = [
      design({ id: "a", clientVisibility: "preview" }),
      design({ id: "b", clientVisibility: "hidden" }),
      design({ id: "c", clientVisibility: "hidden" }),
    ];
    expect(promotableMembers(members).map((d) => d.id)).toEqual(["b", "c"]);
  });
});

describe("groupVisibilitySummary", () => {
  const visible = design({ clientVisibility: "preview" });
  const hidden = design({ clientVisibility: "hidden" });

  it("is empty for a group with no members", () => {
    expect(groupVisibilitySummary("preview", [])).toBe("empty");
  });

  it("is hidden when the group itself is hidden, whatever the members say", () => {
    expect(groupVisibilitySummary("hidden", [visible, visible])).toBe("hidden");
  });

  it("is hidden when the group is open but no member is visible", () => {
    expect(groupVisibilitySummary("preview", [hidden, hidden])).toBe("hidden");
  });

  it("is mixed when only some members are visible", () => {
    expect(groupVisibilitySummary("preview", [visible, hidden])).toBe("mixed");
  });

  it("is visible only when every member is", () => {
    expect(groupVisibilitySummary("preview", [visible, visible])).toBe("visible");
  });
});

describe("visibleCount", () => {
  it("counts what a client can actually see, not what is merely marked visible", () => {
    const designs = [
      design({ id: "a", clientVisibility: "preview", hasPreview: true }),
      design({ id: "b", clientVisibility: "preview", hasPreview: false }),
      design({ id: "c", clientVisibility: "hidden", hasPreview: true }),
    ];
    expect(visibleCount(designs, () => null)).toBe(1);
  });
});
