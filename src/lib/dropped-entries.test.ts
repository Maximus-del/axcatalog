import { describe, expect, it } from "vitest";
import { dropHasFolder, filesFromDrop } from "./dropped-entries";

// Minimal stand-ins for the non-standard entries API.
interface FakeEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (cb: (f: File) => void) => void;
  createReader?: () => { readEntries: (cb: (e: FakeEntry[]) => void) => void };
}

function fileEntry(path: string): FakeEntry {
  const name = path.split("/").pop()!;
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath: path,
    file: (cb) => cb(new File([new Uint8Array([1])], name, { type: "image/png" })),
  };
}

/** Mimics the real API's 100-entries-per-call cap. */
function dirEntry(path: string, children: FakeEntry[], batchSize = 100): FakeEntry {
  let cursor = 0;
  return {
    isFile: false,
    isDirectory: true,
    name: path.split("/").pop()!,
    fullPath: path,
    createReader: () => ({
      readEntries: (cb) => {
        const batch = children.slice(cursor, cursor + batchSize);
        cursor += batch.length;
        cb(batch);
      },
    }),
  };
}

function dataTransfer(entries: FakeEntry[], files: File[] = []): DataTransfer {
  return {
    items: entries.map((e) => ({ kind: "file", webkitGetAsEntry: () => e })),
    files,
  } as unknown as DataTransfer;
}

describe("filesFromDrop", () => {
  it("expands a dropped folder", async () => {
    const dt = dataTransfer([dirEntry("/AX-HOOD-03", [fileEntry("/AX-HOOD-03/black.png"), fileEntry("/AX-HOOD-03/sand.png")])]);
    const files = await filesFromDrop(dt);
    expect(files.map((f) => f.name).sort()).toEqual(["black.png", "sand.png"]);
  });

  it("keeps reading past the 100-entry cap", async () => {
    // The bug this guards: readEntries returns at most 100 per call, so a
    // folder of 184 colourway files silently arrives as 100.
    const children = Array.from({ length: 184 }, (_, i) => fileEntry(`/AX-TRK-01/c${i}.png`));
    const files = await filesFromDrop(dataTransfer([dirEntry("/AX-TRK-01", children)]));
    expect(files).toHaveLength(184);
  });

  it("recurses into nested folders", async () => {
    const dt = dataTransfer([
      dirEntry("/clean", [
        dirEntry("/clean/AX-HOOD-03", [fileEntry("/clean/AX-HOOD-03/black.png")]),
        fileEntry("/clean/loose.png"),
      ]),
    ]);
    const files = await filesFromDrop(dt);
    expect(files.map((f) => f.name).sort()).toEqual(["black.png", "loose.png"]);
  });

  it("gives each file the path a folder input would have", async () => {
    const dt = dataTransfer([dirEntry("/AX-HOOD-03", [fileEntry("/AX-HOOD-03/black.png")])]);
    const [file] = await filesFromDrop(dt);
    expect((file as File & { webkitRelativePath: string }).webkitRelativePath).toBe("AX-HOOD-03/black.png");
  });

  it("falls back to plain files when the entries API is absent", async () => {
    const plain = new File([new Uint8Array([1])], "loose.png", { type: "image/png" });
    const dt = { items: undefined, files: [plain] } as unknown as DataTransfer;
    expect(await filesFromDrop(dt)).toHaveLength(1);
  });

  it("is safe on an empty drop", async () => {
    expect(await filesFromDrop(null)).toEqual([]);
  });
});

describe("dropHasFolder", () => {
  it("distinguishes a folder drop from a file drop", () => {
    expect(dropHasFolder(dataTransfer([dirEntry("/AX-HOOD-03", [])]))).toBe(true);
    expect(dropHasFolder(dataTransfer([fileEntry("/black.png")]))).toBe(false);
    expect(dropHasFolder(null)).toBe(false);
  });
});
