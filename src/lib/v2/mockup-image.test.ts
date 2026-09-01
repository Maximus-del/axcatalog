import { describe, expect, it } from "vitest";
import { hasStalePreview, mockupCover, needsComposite } from "./mockup-image";

const garment = "https://drive.google.com/thumbnail?id=1abc";

describe("which picture is the mockup", () => {
  it("uses the composite when one has been rendered", () => {
    const cover = mockupCover({ imageUrl: garment, imageBucket: "mockups", imagePath: "m1/composite.jpg" });
    expect(cover.bucket).toBe("mockups");
    expect(cover.path).toBe("m1/composite.jpg");
    expect(cover.isComposite).toBe(true);
  });

  it("withholds the garment url when a composite exists", () => {
    // The whole bug: AssetImage prefers `url`, so passing both showed the
    // blank and never signed the composite path.
    const cover = mockupCover({ imageUrl: garment, imageBucket: "mockups", imagePath: "m1/composite.jpg" });
    expect(cover.url).toBeUndefined();
  });

  it("falls back to the garment photograph when nothing has been flattened yet", () => {
    const cover = mockupCover({ imageUrl: garment, imageBucket: null, imagePath: null });
    expect(cover.url).toBe(garment);
    expect(cover.isComposite).toBe(false);
  });

  it("needs both halves of the storage pair before it trusts it", () => {
    expect(mockupCover({ imageUrl: garment, imageBucket: "mockups", imagePath: null }).isComposite).toBe(false);
    expect(mockupCover({ imageUrl: garment, imageBucket: null, imagePath: "m1/x.jpg" }).isComposite).toBe(false);
  });

  it("survives a mockup with no image at all", () => {
    const cover = mockupCover({});
    expect(cover.url).toBeNull();
    expect(cover.isComposite).toBe(false);
  });
});

describe("spotting a mockup whose preview was never built", () => {
  it("flags one with no composite", () => {
    expect(needsComposite({ imageUrl: garment })).toBe(true);
  });

  it("leaves a finished one alone", () => {
    expect(needsComposite({ imageBucket: "mockups", imagePath: "m1/c.jpg" })).toBe(false);
  });
});

describe("spotting a preview built before the garment could be drawn", () => {
  const withComposite = { imageBucket: "mockups", imagePath: "m1/c.jpg" };

  it("flags a composite rendered before the fix", () => {
    expect(hasStalePreview({ ...withComposite, previewGeneratedAt: "2026-08-31T19:39:51Z" })).toBe(true);
  });

  it("leaves a composite rendered afterwards alone", () => {
    expect(hasStalePreview({ ...withComposite, previewGeneratedAt: "2026-09-02T10:00:00Z" })).toBe(false);
  });

  it("treats a composite with no timestamp as stale — it predates the column", () => {
    expect(hasStalePreview({ ...withComposite, previewGeneratedAt: null })).toBe(true);
  });

  it("does not flag a mockup that has no composite at all", () => {
    // It falls back to the garment photograph, which is honest, not broken.
    expect(hasStalePreview({ imageUrl: "https://drive.google.com/thumbnail?id=1" })).toBe(false);
  });

  it("treats an unparseable timestamp as stale rather than trusting it", () => {
    expect(hasStalePreview({ ...withComposite, previewGeneratedAt: "not a date" })).toBe(true);
  });
});
