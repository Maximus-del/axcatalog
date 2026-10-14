// AX OS V2 — the pure parts of design triage.
//
// Everything here is geometry, set arithmetic or storage. None of it touches
// React or Supabase, so the interaction rules that are easy to get subtly
// wrong — which cards a marquee caught, which designs a drag is actually
// carrying — are testable without a DOM.

export const DRAG_MIME = "application/x-ax-designs";

/** The operator's working tray of destinations, per browser. */
const TRAY_KEY = "ax.v2.inbox.tray";

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A rectangle from two corners, in either order. */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): Box {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    right: Math.max(x0, x1),
    bottom: Math.max(y0, y1),
  };
}

/**
 * Touching counts.
 *
 * A marquee that only catches cards it fully contains means dragging across a
 * row of eight selects nothing, because a loose gesture never encloses the
 * first and last. Every file manager uses intersection for this reason.
 */
export function intersects(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Cards the marquee is currently over, in grid order. */
export function hitTest(rect: Box, boxes: Array<{ id: string; box: Box }>): string[] {
  return boxes.filter((c) => intersects(rect, c.box)).map((c) => c.id);
}

/** A drag that has not travelled is a click. Below this, no marquee starts. */
export const DRAG_THRESHOLD = 4;

export function movedEnough(x0: number, y0: number, x1: number, y1: number): boolean {
  return Math.abs(x1 - x0) >= DRAG_THRESHOLD || Math.abs(y1 - y0) >= DRAG_THRESHOLD;
}

/**
 * Shift-click fills in from the last card clicked.
 *
 * The range is taken over the order the operator can SEE — the filtered,
 * sorted array — not insertion order, because "everything between these two"
 * means the two on screen.
 */
export function rangeBetween(order: string[], anchor: string | null, target: string): string[] {
  if (!anchor) return [target];
  const a = order.indexOf(anchor);
  const b = order.indexOf(target);
  if (a === -1 || b === -1) return [target];
  const [from, to] = a <= b ? [a, b] : [b, a];
  return order.slice(from, to + 1);
}

export function union(a: string[], b: string[]): string[] {
  const seen = new Set(a);
  return [...a, ...b.filter((id) => !seen.has(id))];
}

/**
 * What a drag is carrying.
 *
 * Finder's rule, and it matters: dragging a card that is part of the selection
 * moves the whole selection, dragging one that is not moves only that card. The
 * alternative — always moving the selection — files six designs onto somebody
 * when the operator meant one, and the operator does not find out until they
 * look at that person's library.
 */
export function dragPayload(selected: string[], draggedId: string): string[] {
  return selected.includes(draggedId) ? selected : [draggedId];
}

/** "Assign 6 designs to Darnell Mooney" / "Assign this design to …". */
export function dropLabel(count: number, entityName: string): string {
  return count === 1 ? `Assign 1 design to ${entityName}` : `Assign ${count} designs to ${entityName}`;
}

/* ------------------------------------------------------------------ the tray */

/**
 * The pinned destinations, as ids only.
 *
 * Ids, never entity objects: a name or an avatar cached here would go stale the
 * first time somebody is renamed, and the picker already has the live records.
 */
export function readTray(): string[] {
  try {
    const raw = localStorage.getItem(TRAY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0).slice(0, 12);
  } catch {
    // A private window, cleared site data, or storage that throws on read.
    // The tray is a convenience; losing it must never break the page.
    return [];
  }
}

export function writeTray(ids: string[]): void {
  try {
    localStorage.setItem(TRAY_KEY, JSON.stringify(ids.slice(0, 12)));
  } catch {
    /* ignore */
  }
}

/** Read the design ids off a drag, tolerating a drag that carries something else. */
export function readDragIds(getData: (mime: string) => string): string[] {
  try {
    const raw = getData(DRAG_MIME);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}
