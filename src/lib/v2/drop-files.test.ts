import { describe, expect, it } from "vitest";
import {
  MAX_DROP_FILES,
  extensionOf,
  isAcceptedImage,
  isJunk,
  planDrop,
  titleFromFilename,
} from "./drop-files";

const f = (name: string, over: { size?: number; type?: string } = {}) => ({ name, ...over });

describe("what counts as artwork", () => {
  it("takes the image types AX stores", () => {
    for (const n of ["logo.png", "shot.jpg", "art.jpeg", "mark.webp", "vector.svg", "loop.gif"]) {
      expect(isAcceptedImage(f(n))).toBe(true);
    }
  });

  it("refuses things that are not images", () => {
    expect(isAcceptedImage(f("brief.pdf"))).toBe(false);
    expect(isAcceptedImage(f("sizes.xlsx"))).toBe(false);
    expect(isAcceptedImage(f("notes.txt"))).toBe(false);
  });

  it("believes the mime type when the browser gives one", () => {
    expect(isAcceptedImage(f("nameless", { type: "image/png" }))).toBe(true);
  });

  it("falls back to the extension when the browser is vague", () => {
    // Some file managers drop with an empty type; refusing a valid PNG because
    // the OS said nothing is the wrong failure.
    expect(isAcceptedImage(f("logo.PNG", { type: "" }))).toBe(true);
  });

  it("reads the extension off a nested path", () => {
    expect(extensionOf("folder/sub/mark.SVG")).toBe("svg");
    expect(extensionOf("noextension")).toBe("");
  });
});

describe("junk a folder brings with it", () => {
  it("skips the operating system's leftovers silently", () => {
    for (const n of [".DS_Store", "__MACOSX", "Thumbs.db", "desktop.ini", ".hidden"]) {
      expect(isJunk(n)).toBe(true);
    }
  });

  it("does not mistake a real file for junk", () => {
    expect(isJunk("logo.png")).toBe(false);
    expect(isJunk("folder/mark.svg")).toBe(false);
  });
});

describe("planning a drop", () => {
  it("accepts the images and itemises what it refused", () => {
    const plan = planDrop([f("a.png"), f("brief.pdf"), f("b.jpg")]);
    expect(plan.accepted.map((x) => x.name)).toEqual(["a.png", "b.jpg"]);
    // Named, not counted: "3 files were skipped" sends somebody hunting.
    expect(plan.rejected).toEqual([{ name: "brief.pdf", reason: "not an image AX can store" }]);
  });

  it("drops junk without complaining about it", () => {
    const plan = planDrop([f(".DS_Store"), f("a.png")]);
    expect(plan.accepted).toHaveLength(1);
    expect(plan.rejected).toEqual([]);
  });

  it("refuses a file that is too large, and says so", () => {
    const plan = planDrop([f("huge.png", { size: 40 * 1024 * 1024 })]);
    expect(plan.accepted).toEqual([]);
    expect(plan.rejected[0].reason).toMatch(/25MB/);
  });

  it("caps a runaway folder rather than creating a hundred records", () => {
    const many = Array.from({ length: MAX_DROP_FILES + 15 }, (_, i) => f(`art-${i}.png`));
    const plan = planDrop(many);
    expect(plan.accepted).toHaveLength(MAX_DROP_FILES);
    expect(plan.trimmed).toBe(true);
  });

  it("does not claim it trimmed when everything fitted", () => {
    expect(planDrop([f("a.png")]).trimmed).toBe(false);
  });

  it("handles an empty drop", () => {
    expect(planDrop([])).toEqual({ accepted: [], rejected: [], trimmed: false });
  });
});

describe("a filename as a design title", () => {
  it("drops the extension", () => {
    expect(titleFromFilename("mwrld-logo.png")).toBe("mwrld logo");
  });

  it("turns separators into spaces", () => {
    expect(titleFromFilename("mooney_world_globe.svg")).toBe("mooney world globe");
  });

  it("strips a duplicate marker", () => {
    expect(titleFromFilename("logo (2).png")).toBe("logo");
    expect(titleFromFilename("logo copy.png")).toBe("logo");
  });

  it("reads through a folder path", () => {
    expect(titleFromFilename("Inspo/Fall/globe-mark.png")).toBe("globe mark");
  });

  it("gives back nothing when nothing survives, so the caller can name it", () => {
    expect(titleFromFilename(".png")).toBe("");
  });
});
