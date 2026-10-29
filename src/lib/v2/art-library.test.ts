import { describe, expect, it } from "vitest";
import { countByRole, filterArt, inferRole, pairFor, studioCode, type ArtItem } from "./art-library";

const item = (o: Partial<ArtItem>): ArtItem => ({
  fileId: "f", designId: "d", designTitle: "Ice Man", role: "front", inferred: false, bucket: "b", path: "p", fileName: "x.png", createdAt: "2026-10-01", url: null, ...o,
});

describe("art library", () => {
  it("reads roles from tags first, then file names", () => {
    expect(inferRole("whatever.png", "back")).toEqual({ role: "back", inferred: false });
    expect(inferRole("PSP_ICEMAN_V1_PRINT-FRONT_v01.png").role).toBe("front");
    expect(inferRole("PSP_ICEMAN_V1_PRINT-BACK_v01.png").role).toBe("back");
    expect(inferRole("proactive_logo_white.png").role).toBe("logo");
    expect(inferRole("feedback.png").role).toBe("other");
    expect(inferRole("background.png").role).toBe("other");
  });

  it("pairs a front with the newest back of the same design", () => {
    const items = [
      item({ fileId: "1", role: "front" }),
      item({ fileId: "2", role: "back", createdAt: "2026-09-01" }),
      item({ fileId: "3", role: "back", createdAt: "2026-10-20" }),
      item({ fileId: "4", role: "back", designId: "other" }),
    ];
    expect(pairFor(items[0], items)?.fileId).toBe("3");
    expect(pairFor(items[2], items)?.fileId).toBe("1");
    expect(pairFor(item({ role: "logo" }), items)).toBeNull();
  });

  it("filters by tab and search, counts per tab", () => {
    const items = [item({ role: "logo", designTitle: "PSP Logo" }), item({ role: "front" }), item({ role: "back" })];
    expect(filterArt(items, "logo")).toHaveLength(1);
    expect(filterArt(items, "all", "ice")).toHaveLength(2);
    expect(countByRole(items)).toMatchObject({ all: 3, logo: 1, front: 1, back: 1, other: 0 });
  });

  it("builds a review code from client + product", () => {
    expect(studioCode("proactive", "Logo Sweats")).toBe("PROACTIVE-LOGO-SWEATS");
    expect(studioCode("Proactive Sports Performance", "Tee")).toBe("PROACTIVE-SPORTS-TEE");
  });
});
