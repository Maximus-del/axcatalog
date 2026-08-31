// AX OS V2 — the mockup builder's unsaved work.
//
// THE PROBLEM THIS SOLVES IS SMALL AND CONSTANT.
//
// Building a mockup is five decisions and a positioning job. All of it lived in
// component state, so a refresh, a mis-aimed Escape, a closed tab or a browser
// crash threw the lot away — and the operator's instinct after losing it twice
// is to save half-finished mockups as insurance, which fills the library with
// junk. Losing five minutes of work is annoying; teaching someone to work
// defensively around a tool is worse.
//
// WHY LOCAL STORAGE AND NOT A TABLE.
// A draft is one person's in-progress thought at one keyboard. It has no
// audience, no history worth keeping, and no meaning to anyone else — writing
// it to Postgres would mean rows nobody reads, RLS to scope them, and a
// question about when to delete them. The browser already has exactly the right
// lifetime.
//
// Everything here is defensive: storage can be unavailable (private windows,
// blocked site data), the payload can be from an older shape, and a draft can
// outlive the design or blank it refers to. None of those may throw, and none
// of them may hand back something half-restored.

import type { Guides, PlacedDesign } from "./placement-geometry";

export const BUILDER_STEPS = ["flow", "design", "blank", "color", "placement", "confirm"] as const;
export type BuilderStep = (typeof BUILDER_STEPS)[number];

export type BuilderFlow = "design_first" | "blank_first";

/** Bump when the shape changes. An older draft is discarded, never migrated. */
export const DRAFT_VERSION = 2;

export interface MockupDraft {
  version: number;
  entityId: string;
  /** ISO timestamp, so the interface can say how old the restored work is. */
  savedAt: string;
  flow: BuilderFlow | null;
  step: BuilderStep;
  /** Ids, not objects — the objects come back from the queries that own them. */
  designId: string | null;
  blankId: string | null;
  colorName: string | null;
  extraColors: string[];
  extraBlanks: Record<string, string[]>;
  placed: PlacedDesign[];
  guides: Record<string, Guides>;
  surface: "front" | "back";
  title: string;
  notes: string;
  collectionId: string;
}

export function draftKey(entityId: string): string {
  return `ax.v2.mockup-draft.${entityId}`;
}

/**
 * Is there anything here worth restoring?
 *
 * Opening the builder and closing it again should not leave a draft that
 * greets you next time. A draft counts once a real decision has been made —
 * artwork placed, a garment or a design chosen, or something typed.
 */
export function isMeaningful(draft: Pick<MockupDraft, "designId" | "blankId" | "placed" | "title" | "notes">): boolean {
  return Boolean(
    draft.designId ||
      draft.blankId ||
      (draft.placed?.length ?? 0) > 0 ||
      draft.title?.trim() ||
      draft.notes?.trim(),
  );
}

function isStep(value: unknown): value is BuilderStep {
  return typeof value === "string" && (BUILDER_STEPS as readonly string[]).includes(value);
}

/**
 * Parse a stored payload into a draft, or null.
 *
 * Separate from the storage read so it can be tested without a browser, and so
 * every rejection reason lives in one place: wrong version, wrong entity, not
 * an object, or nothing worth restoring.
 */
export function parseDraft(raw: unknown, entityId: string): MockupDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<MockupDraft>;
  if (d.version !== DRAFT_VERSION) return null;
  if (d.entityId !== entityId) return null;

  const draft: MockupDraft = {
    version: DRAFT_VERSION,
    entityId,
    savedAt: typeof d.savedAt === "string" ? d.savedAt : new Date().toISOString(),
    flow: d.flow === "design_first" || d.flow === "blank_first" ? d.flow : null,
    step: isStep(d.step) ? d.step : "flow",
    designId: typeof d.designId === "string" ? d.designId : null,
    blankId: typeof d.blankId === "string" ? d.blankId : null,
    colorName: typeof d.colorName === "string" ? d.colorName : null,
    extraColors: Array.isArray(d.extraColors) ? d.extraColors.filter((c): c is string => typeof c === "string") : [],
    extraBlanks: d.extraBlanks && typeof d.extraBlanks === "object" ? (d.extraBlanks as Record<string, string[]>) : {},
    placed: Array.isArray(d.placed) ? (d.placed as PlacedDesign[]) : [],
    guides: d.guides && typeof d.guides === "object" ? (d.guides as Record<string, Guides>) : {},
    surface: d.surface === "back" ? "back" : "front",
    title: typeof d.title === "string" ? d.title : "",
    notes: typeof d.notes === "string" ? d.notes : "",
    collectionId: typeof d.collectionId === "string" ? d.collectionId : "",
  };

  return isMeaningful(draft) ? draft : null;
}

/* --------------------------------------------------------------- storage */

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Private windows and blocked site data throw on access, not on use.
    return null;
  }
}

export function loadDraft(entityId: string): MockupDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(draftKey(entityId));
    return raw ? parseDraft(JSON.parse(raw), entityId) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: MockupDraft): void {
  const store = storage();
  if (!store) return;
  try {
    if (!isMeaningful(draft)) {
      store.removeItem(draftKey(draft.entityId));
      return;
    }
    store.setItem(draftKey(draft.entityId), JSON.stringify(draft));
  } catch {
    // A full quota is not a reason to interrupt someone mid-mockup.
  }
}

export function clearDraft(entityId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(draftKey(entityId));
  } catch {
    /* nothing to do */
  }
}

/**
 * How old the restored work is, in words.
 *
 * "Restored your unsaved mockup" is unsettling on its own — from when? The
 * answer decides whether the operator carries on or starts fresh.
 */
export function describeAge(savedAt: string, now: Date = new Date()): string {
  const then = new Date(savedAt).getTime();
  if (!Number.isFinite(then)) return "earlier";
  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 45) return "a moment ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
