// AX OS V2 — organising saved mockups.
//
// The rules are deliberately identical to the Design shelf: folders lead, a
// folder's first member is its cover, dragging one item onto another creates a
// folder, and folders are purely organisational — moving a mockup into one
// changes nothing about the mockup itself.
//
// This is a separate module rather than a generic shared with design-groups.ts
// because the two shelves hold different objects with different actions, and
// the shared part is a dozen lines of ordering. Making design-groups.ts generic
// to save those lines would put the Designs shelf — which works and is covered
// by 21 tests — at risk for no functional gain. The rules are mirrored here on
// purpose; if they ever diverge, that will be a decision rather than a drift.

import type { Mockup, MockupFolder } from "./types";

export type MockupShelfItem =
  | { kind: "mockup"; key: string; sortOrder: number; mockup: Mockup }
  | { kind: "folder"; key: string; sortOrder: number; folder: MockupFolder; mockups: Mockup[] };

/**
 * Cover resolution. Null cover means "use the first member", which is what
 * makes reordering inside a folder also choose its cover.
 */
export function coverOf(folder: MockupFolder, members: Mockup[]): Mockup | null {
  if (folder.coverMockupId) {
    const explicit = members.find((m) => m.id === folder.coverMockupId);
    if (explicit) return explicit;
  }
  return members[0] ?? null;
}

/**
 * Build the shelf: folders first, then loose mockups, each band ordered by its
 * own sort_order so creating a folder never renumbers the mockups below it.
 */
export function buildMockupShelf(mockups: Mockup[], folders: MockupFolder[]): MockupShelfItem[] {
  const byFolder = new Map<string, Mockup[]>();
  const loose: MockupShelfItem[] = [];

  for (const m of mockups) {
    if (m.folderId) {
      byFolder.set(m.folderId, [...(byFolder.get(m.folderId) ?? []), m]);
    } else {
      loose.push({ kind: "mockup", key: m.id, sortOrder: m.sortOrder, mockup: m });
    }
  }

  for (const [id, members] of byFolder) {
    byFolder.set(id, [...members].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)));
  }

  const folderItems: MockupShelfItem[] = folders
    // An empty folder is not shown; taking the last mockup out cleans it up.
    .filter((f) => (byFolder.get(f.id) ?? []).length > 0)
    .map((f) => ({
      kind: "folder" as const,
      key: f.id,
      sortOrder: f.sortOrder,
      folder: f,
      mockups: byFolder.get(f.id) ?? [],
    }));

  const byOrder = (a: MockupShelfItem, b: MockupShelfItem) =>
    a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.key.localeCompare(b.key);

  return [...folderItems.sort(byOrder), ...loose.sort(byOrder)];
}

/** Move the item at `from` so it sits at index `to`. Pure. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

export interface MockupOrderWrite {
  kind: "mockup" | "folder";
  id: string;
  sortOrder: number;
}

/**
 * Only the rows whose position actually changed, numbered per band.
 *
 * Folders and loose mockups are numbered independently because they render as
 * two bands; sharing one sequence would make the first loose mockup's order
 * depend on how many folders happen to exist.
 */
export function orderWrites(items: MockupShelfItem[]): MockupOrderWrite[] {
  const writes: MockupOrderWrite[] = [];
  let folderIndex = 0;
  let mockupIndex = 0;
  for (const item of items) {
    const index = item.kind === "folder" ? folderIndex++ : mockupIndex++;
    if (item.sortOrder === index) continue;
    writes.push({
      kind: item.kind,
      id: item.kind === "folder" ? item.folder.id : item.mockup.id,
      sortOrder: index,
    });
  }
  return writes;
}

/** Ordering writes for the mockups inside one open folder. */
export function memberOrderWrites(members: Mockup[]): MockupOrderWrite[] {
  const writes: MockupOrderWrite[] = [];
  members.forEach((m, index) => {
    if (m.sortOrder === index) return;
    writes.push({ kind: "mockup", id: m.id, sortOrder: index });
  });
  return writes;
}

export type MockupDropIntent =
  | { type: "reorder"; toIndex: number }
  | { type: "group-with"; targetKey: string }
  | { type: "add-to-folder"; folderId: string }
  | { type: "none" };

export function dropIntent(
  dragged: MockupShelfItem | null,
  target: MockupShelfItem,
  targetIndex: number,
  zone: "before" | "onto",
): MockupDropIntent {
  if (!dragged || dragged.key === target.key) return { type: "none" };
  if (zone === "before") return { type: "reorder", toIndex: targetIndex };
  // Folders never nest — dropping a folder onto anything just reorders it.
  if (dragged.kind === "folder") return { type: "reorder", toIndex: targetIndex };
  if (target.kind === "folder") return { type: "add-to-folder", folderId: target.folder.id };
  return { type: "group-with", targetKey: target.key };
}

/**
 * The name suggested when two mockups are dropped together.
 *
 * Mockups carry operator-typed titles far more often than designs do, so the
 * first member's name is usually a good folder name — unlike design filenames,
 * which are generator noise.
 */
export function suggestFolderName(first: Mockup): string {
  const t = first.title.trim();
  if (!t || /^untitled/i.test(t)) return "New folder";
  return t;
}

/** Free-text search across the fields an operator would actually type. */
export function searchMockups(mockups: Mockup[], query: string): Mockup[] {
  const q = query.trim().toLowerCase();
  if (!q) return mockups;
  return mockups.filter((m) =>
    [m.title, m.blankName, m.colorName].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
  );
}
