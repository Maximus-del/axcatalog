// AX OS V2 — dropping a folder of artwork onto a section.
//
// The workflow this exists for: a design lands as a folder from the Drive, a
// phone, or a designer's export — six files in a directory, not six separate
// picks through a file dialog. A file input cannot take a directory in any
// portable way; a DROP can, because DataTransferItem exposes the filesystem
// entry and directories can be walked.
//
// Everything that decides WHAT to accept is pure and tested here. The walking
// itself needs the browser and is kept to one small function so the rules are
// not buried inside an event handler.

/** What AX will take as artwork. Anything else is refused by name, out loud. */
export const ACCEPTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  "image/avif",
];

const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "svg", "gif", "avif"];

/**
 * A cap, and it is deliberate.
 *
 * Each file becomes a designs row, a storage object and a design_files row.
 * Dropping a hundred-file folder by accident should not silently create a
 * hundred records somebody then has to delete one at a time.
 */
export const MAX_DROP_FILES = 40;

/** Per file. Artwork is big; a 40MB PSD export is not what this is for. */
export const MAX_DROP_BYTES = 25 * 1024 * 1024;

export function extensionOf(name: string): string {
  const bare = name.split(/[\\/]/).pop() ?? name;
  const dot = bare.lastIndexOf(".");
  return dot === -1 ? "" : bare.slice(dot + 1).toLowerCase();
}

/**
 * Is this an image AX can store?
 *
 * Checks the type when the browser gives one and falls back to the extension
 * when it does not — a drop from some file managers arrives with an empty
 * mime type, and refusing a valid PNG because the OS was vague is the wrong
 * failure.
 */
export function isAcceptedImage(file: { name: string; type?: string }): boolean {
  if (file.type && ACCEPTED_IMAGE_TYPES.includes(file.type)) return true;
  if (file.type && file.type.startsWith("image/")) return true;
  return ACCEPTED_EXTENSIONS.includes(extensionOf(file.name));
}

/** Files macOS, Windows and design tools leave lying around in a folder. */
const JUNK = /^(\.|__MACOSX|Thumbs\.db$|desktop\.ini$|\.DS_Store$)/i;

export function isJunk(name: string): boolean {
  const bare = name.split(/[\\/]/).pop() ?? name;
  return JUNK.test(bare);
}

export interface DropPlan<T extends { name: string; size?: number; type?: string }> {
  accepted: T[];
  /** Rejected, with the reason in words an operator can act on. */
  rejected: Array<{ name: string; reason: string }>;
  /** True when the cap trimmed the list. */
  trimmed: boolean;
}

/**
 * Decide what to do with a dropped set.
 *
 * Rejections are itemised rather than counted, because "3 files were skipped"
 * sends somebody hunting through a folder to work out which three.
 */
export function planDrop<T extends { name: string; size?: number; type?: string }>(files: T[]): DropPlan<T> {
  const accepted: T[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];

  for (const file of files) {
    if (isJunk(file.name)) continue;
    if (!isAcceptedImage(file)) {
      rejected.push({ name: file.name, reason: "not an image AX can store" });
      continue;
    }
    if (typeof file.size === "number" && file.size > MAX_DROP_BYTES) {
      rejected.push({ name: file.name, reason: "larger than 25MB" });
      continue;
    }
    accepted.push(file);
  }

  const trimmed = accepted.length > MAX_DROP_FILES;
  return { accepted: trimmed ? accepted.slice(0, MAX_DROP_FILES) : accepted, rejected, trimmed };
}

/**
 * A filename, as a design title.
 *
 * Strips the extension and the noise a camera, a generator or a duplicate
 * leaves behind, because "ChatGPT Image Aug 16, 2026, 03 11 02 PM (1)" is not
 * a name anybody searches for. When nothing survives, the caller names it.
 */
export function titleFromFilename(name: string): string {
  const bare = (name.split(/[\\/]/).pop() ?? name).replace(/\.[^.]+$/, "");
  const cleaned = bare
    .replace(/[_-]+/g, " ")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/\s+copy$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned;
}

/**
 * Flatten a drop into a list of files, walking any directories.
 *
 * webkitGetAsEntry is the only portable way to see a dropped DIRECTORY; it is
 * prefixed but universally supported. When it is unavailable the plain file
 * list is used, so a browser that cannot walk folders still accepts a
 * multi-file drop rather than doing nothing.
 */
export async function filesFromDrop(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter(Boolean) as FileSystemEntry[];

  if (entries.length === 0) return Array.from(dataTransfer.files ?? []);

  const out: File[] = [];
  const walk = async (entry: FileSystemEntry, depth: number): Promise<void> => {
    // A cap on depth as well as count: a dropped home directory is a mistake,
    // not an instruction, and it should not take the tab down.
    if (out.length >= MAX_DROP_FILES * 2 || depth > 5) return;

    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
      });
      if (file) out.push(file);
      return;
    }

    if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns at most ~100 at a time and must be called until
      // it comes back empty, which is the part everyone gets wrong.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve) => {
          reader.readEntries(resolve, () => resolve([]));
        });
        if (batch.length === 0) break;
        for (const child of batch) await walk(child, depth + 1);
      }
    }
  };

  for (const entry of entries) await walk(entry, 0);
  return out;
}
