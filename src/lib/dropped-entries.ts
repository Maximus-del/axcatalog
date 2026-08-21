// Read a dropped folder.
//
// `dataTransfer.files` is empty when you drag a directory — the browser only
// exposes the contents through the non-standard entries API. So dropping a
// folder appeared to do nothing at all, while the "choose a folder" button
// worked, which is a confusing pair of behaviours to hand someone with 92
// colourways to fill in.
//
// Two things here are easy to get wrong and both bite only on real data:
//
//   1. readEntries() returns AT MOST 100 entries per call. A folder of 184
//      files silently arrives as 100 unless you keep calling until it returns
//      an empty array.
//   2. DataTransfer is neutered as soon as the drop handler returns, so the
//      entries have to be grabbed synchronously and traversed afterwards.

interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (cb: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (cb: (entries: FsEntry[]) => void, err: (e: unknown) => void) => void;
  };
}

/**
 * Grab the entries out of a drop event. MUST be called synchronously inside
 * the handler, before any await.
 */
export function entriesFromDataTransfer(dt: DataTransfer | null): FsEntry[] {
  if (!dt?.items) return [];
  const out: FsEntry[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== "file") continue;
    const getter = (item as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry;
    const entry = typeof getter === "function" ? getter.call(item) : null;
    if (entry) out.push(entry);
  }
  return out;
}

function readAllEntries(reader: NonNullable<FsEntry["createReader"]> extends () => infer R ? R : never): Promise<FsEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FsEntry[] = [];
    const pump = () => {
      reader.readEntries((batch) => {
        // An empty batch is the only signal that the directory is exhausted.
        if (batch.length === 0) { resolve(all); return; }
        all.push(...batch);
        pump();
      }, reject);
    };
    pump();
  });
}

function fileFromEntry(entry: FsEntry): Promise<File | null> {
  return new Promise((resolve) => {
    if (!entry.file) { resolve(null); return; }
    entry.file(
      (f) => {
        // fullPath is "/AX-HOOD-03/black.png"; the rest of the app reads
        // webkitRelativePath, so give it the same shape a folder <input> would.
        const relative = entry.fullPath.replace(/^\//, "");
        try {
          Object.defineProperty(f, "webkitRelativePath", { value: relative, configurable: true });
        } catch { /* some browsers freeze File; the path is a bonus, not required */ }
        resolve(f);
      },
      () => resolve(null),
    );
  });
}

/** Depth guard — a symlink loop would otherwise recurse forever. */
const MAX_DEPTH = 8;

async function walk(entry: FsEntry, depth: number): Promise<File[]> {
  if (entry.isFile) {
    const f = await fileFromEntry(entry);
    return f ? [f] : [];
  }
  if (!entry.isDirectory || depth >= MAX_DEPTH || !entry.createReader) return [];

  const children = await readAllEntries(entry.createReader());
  const nested = await Promise.all(children.map((c) => walk(c, depth + 1)));
  return nested.flat();
}

/**
 * Every file in a drop, folders expanded.
 *
 * Falls back to `dataTransfer.files` when the entries API isn't available, so
 * a plain multi-file drop still works everywhere.
 */
export async function filesFromDrop(dt: DataTransfer | null): Promise<File[]> {
  const entries = entriesFromDataTransfer(dt);
  if (entries.length === 0) return Array.from(dt?.files ?? []);
  const lists = await Promise.all(entries.map((e) => walk(e, 0)));
  const files = lists.flat();
  // A browser without the entries API returns nothing above; don't lose the drop.
  return files.length > 0 ? files : Array.from(dt?.files ?? []);
}

/** Does this drop contain at least one directory? */
export function dropHasFolder(dt: DataTransfer | null): boolean {
  return entriesFromDataTransfer(dt).some((e) => e.isDirectory);
}
