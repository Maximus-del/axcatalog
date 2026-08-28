// AX OS V2 — Design Groups.
//
// A Group is organisational only. It never merges, rewrites or deletes the
// underlying design assets: grouping is a `group_id` on the per-entity
// `design_athletes` link, so the same design can sit in one group for Darnell
// and none at all for another entity, and V1's `designs.design_collection_id`
// folder assignment is left completely alone.
//
// Everything in this file is pure so the ordering rules can be tested without
// a database.

import type { Design } from "./types";

export interface DesignGroup {
  id: string;
  name: string;
  entityId: string | null;
  sortOrder: number;
  /** Explicit cover. Null means "use the first member" — see coverOf(). */
  coverDesignId: string | null;
}

/** One row of the shelf: either a loose design or a group of them. */
export type ShelfItem =
  | { kind: "design"; key: string; sortOrder: number; design: Design }
  | { kind: "group"; key: string; sortOrder: number; group: DesignGroup; designs: Design[] };

/**
 * Cover resolution, in one place so adding explicit cover selection later is a
 * one-line change at the call site and nothing else.
 */
export function coverOf(group: DesignGroup, members: Design[]): Design | null {
  if (group.coverDesignId) {
    const explicit = members.find((d) => d.id === group.coverDesignId);
    if (explicit) return explicit;
  }
  return members[0] ?? null;
}

/**
 * Build the ordered shelf from the flat data the query returns.
 *
 * Groups and loose designs share one `sort_order` sequence at the top level, so
 * an operator can drag a group in between two designs.
 */
export function buildShelf(
  designs: Design[],
  groups: DesignGroup[],
  membership: Map<string, { groupId: string | null; sortOrder: number }>,
): ShelfItem[] {
  const byGroup = new Map<string, Design[]>();
  const loose: ShelfItem[] = [];

  for (const d of designs) {
    const m = membership.get(d.id);
    const groupId = m?.groupId ?? null;
    if (groupId) {
      byGroup.set(groupId, [...(byGroup.get(groupId) ?? []), d]);
    } else {
      loose.push({ kind: "design", key: d.id, sortOrder: m?.sortOrder ?? 0, design: d });
    }
  }

  // Members are ordered within their group by the same sort_order field.
  for (const [gid, members] of byGroup) {
    byGroup.set(
      gid,
      [...members].sort(
        (a, b) => (membership.get(a.id)?.sortOrder ?? 0) - (membership.get(b.id)?.sortOrder ?? 0),
      ),
    );
  }

  const groupItems: ShelfItem[] = groups
    // A group with no members left is not shown; ungrouping cleans it up.
    .filter((g) => (byGroup.get(g.id) ?? []).length > 0)
    .map((g) => ({
      kind: "group" as const,
      key: g.id,
      sortOrder: g.sortOrder,
      group: g,
      designs: byGroup.get(g.id) ?? [],
    }));

  return [...loose, ...groupItems].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.key.localeCompare(b.key);
  });
}

/** Move the item at `from` so it sits at index `to`. Pure; returns a new array. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/**
 * The sort_order writes an ordering implies. Only rows whose position actually
 * changed are returned, so a drag that moves one card does not rewrite thirty
 * database rows.
 */
export interface OrderWrite {
  kind: "design" | "group";
  id: string;
  sortOrder: number;
}

export function orderWrites(items: ShelfItem[]): OrderWrite[] {
  const writes: OrderWrite[] = [];
  items.forEach((item, index) => {
    if (item.sortOrder === index) return;
    writes.push({
      kind: item.kind === "group" ? "group" : "design",
      id: item.kind === "group" ? item.group.id : item.design.id,
      sortOrder: index,
    });
  });
  return writes;
}

/** Same idea for the designs inside one group. */
export function memberOrderWrites(
  members: Design[],
  membership: Map<string, { groupId: string | null; sortOrder: number }>,
): OrderWrite[] {
  const writes: OrderWrite[] = [];
  members.forEach((d, index) => {
    if ((membership.get(d.id)?.sortOrder ?? -1) === index) return;
    writes.push({ kind: "design", id: d.id, sortOrder: index });
  });
  return writes;
}

/**
 * The name AX suggests when two designs are dropped together. Generator
 * filenames make terrible group names, so those fall back to a neutral label
 * the operator can rename in place.
 */
export function suggestGroupName(entityName: string | null | undefined, first: Design): string {
  const base = usableTitle(first.title);
  if (base) return base;
  return entityName ? `${entityName} — new group` : "New group";
}

function usableTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.trim();
  if (/^(chatgpt|dall[- ]?e|midjourney|pasted|image|untitled|screenshot|img[_-]?\d)/i.test(t)) return null;
  if (/^\d[\d\s._-]*$/.test(t)) return null;
  return t;
}

/** What a drop does, decided from what is being dragged onto what. */
export type DropIntent =
  | { type: "reorder"; toIndex: number }
  | { type: "group-with"; targetKey: string }
  | { type: "add-to-group"; groupId: string }
  | { type: "none" };

export function dropIntent(
  dragged: ShelfItem | null,
  target: ShelfItem,
  targetIndex: number,
  zone: "before" | "onto",
): DropIntent {
  if (!dragged || dragged.key === target.key) return { type: "none" };
  if (zone === "before") return { type: "reorder", toIndex: targetIndex };
  // Groups are never nested — dropping a group onto anything just reorders it.
  if (dragged.kind === "group") return { type: "reorder", toIndex: targetIndex };
  if (target.kind === "group") return { type: "add-to-group", groupId: target.group.id };
  return { type: "group-with", targetKey: target.key };
}
