import { describe, expect, it } from "vitest";
import {
  isAcceptedReference,
  MAX_REFERENCE_BYTES,
  REFERENCE_BUCKET,
  referenceObjectPath,
  referenceSummary,
  referenceToast,
  safeFileName,
} from "./studio-uploads";

describe("isAcceptedReference", () => {
  it("accepts an image within the size cap", () => {
    expect(isAcceptedReference({ name: "a.jpg", size: 1000, type: "image/jpeg" })).toBe(true);
  });

  it("rejects non-images", () => {
    expect(isAcceptedReference({ name: "a.pdf", size: 1000, type: "application/pdf" })).toBe(false);
  });

  it("rejects empty files", () => {
    expect(isAcceptedReference({ name: "a.jpg", size: 0, type: "image/jpeg" })).toBe(false);
  });

  it("rejects anything over the cap", () => {
    expect(isAcceptedReference({ name: "a.jpg", size: MAX_REFERENCE_BYTES + 1, type: "image/png" })).toBe(false);
    expect(isAcceptedReference({ name: "a.jpg", size: MAX_REFERENCE_BYTES, type: "image/png" })).toBe(true);
  });
});

describe("safeFileName", () => {
  it("lowercases and hyphenates", () => {
    expect(safeFileName("My Cool Ref.JPG")).toBe("my-cool-ref.jpg");
  });

  it("strips characters that would break a storage key", () => {
    expect(safeFileName("a/b\\c?d#e.png")).toBe("a-b-c-d-e.png");
  });

  it("survives a name that is all punctuation", () => {
    expect(safeFileName("???.png")).toBe("reference.png");
  });

  it("handles a name with no extension", () => {
    expect(safeFileName("screenshot")).toBe("screenshot");
  });

  it("truncates a very long stem", () => {
    const out = safeFileName(`${"x".repeat(200)}.jpg`);
    expect(out.length).toBeLessThanOrEqual(53);
    expect(out.endsWith(".jpg")).toBe(true);
  });
});

describe("referenceObjectPath", () => {
  it("namespaces by athlete and thread", () => {
    expect(referenceObjectPath("ath-1", "thr-2", 0, "Ref One.png")).toBe(
      "portal/ath-1/thr-2/01-ref-one.png",
    );
  });

  it("orders past nine without reordering as a string", () => {
    const paths = [0, 9, 10].map((i) => referenceObjectPath("a", "t", i, "x.png"));
    expect(paths).toEqual([
      "portal/a/t/01-x.png",
      "portal/a/t/10-x.png",
      "portal/a/t/11-x.png",
    ]);
    expect([...paths].sort()).toEqual(paths);
  });

  it("keeps two clients' identically named files apart", () => {
    expect(referenceObjectPath("a1", "t1", 0, "photo.jpg")).not.toBe(
      referenceObjectPath("a2", "t1", 0, "photo.jpg"),
    );
  });
});

describe("referenceSummary", () => {
  it("is null when nothing was attached", () => {
    expect(referenceSummary({ uploaded: [], failed: [] })).toBeNull();
  });

  it("lists the urls so the operator can open them", () => {
    const out = referenceSummary({ uploaded: ["https://x/1.png", "https://x/2.png"], failed: [] });
    expect(out).toContain("Reference images (2)");
    expect(out).toContain("https://x/1.png");
    expect(out).toContain("https://x/2.png");
  });

  it("names a partial failure rather than rounding it up", () => {
    const out = referenceSummary({ uploaded: ["https://x/1.png"], failed: ["bad.png"] });
    expect(out).toContain("Reference images (1)");
    expect(out).toContain("1 reference image failed to upload: bad.png");
  });

  it("reports a total failure with no url list", () => {
    const out = referenceSummary({ uploaded: [], failed: ["a.png", "b.png"] });
    expect(out).not.toContain("Reference images (");
    expect(out).toContain("2 reference images failed to upload: a.png, b.png");
  });
});

describe("referenceToast", () => {
  it("says nothing when everything landed", () => {
    expect(referenceToast({ uploaded: ["u"], failed: [] })).toBeNull();
    expect(referenceToast({ uploaded: [], failed: [] })).toBeNull();
  });

  it("tells the client when nothing landed", () => {
    expect(referenceToast({ uploaded: [], failed: ["a"] })).toContain("didn't upload");
  });

  it("tells the client when some landed", () => {
    expect(referenceToast({ uploaded: ["u"], failed: ["a", "b"] })).toContain("2 reference images");
  });
});

describe("REFERENCE_BUCKET", () => {
  it("is the references bucket, never a design bucket", () => {
    expect(REFERENCE_BUCKET).toBe("design-references");
    expect(REFERENCE_BUCKET).not.toBe("design-files");
    expect(REFERENCE_BUCKET).not.toBe("design-previews");
  });
});
