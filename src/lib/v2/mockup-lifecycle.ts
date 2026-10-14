// AX OS V2 — where a mockup is in the operator's own process.
//
// Deliberately separate from `mockups.status`, which is V1's publication state
// (draft/approved/published) and is used by the 42 photo mockups. The two
// answer different questions and merging them would change V1's meaning to save
// one column.
//
// Everything starts in the bin. A mockup is a scratch idea until a person says
// otherwise; defaulting anywhere else asserts progress that has not happened.

export type Lifecycle = "bin" | "in_progress" | "ready" | "converted" | "archived";

export const LIFECYCLE_ORDER: Lifecycle[] = ["bin", "in_progress", "ready", "converted", "archived"];

export const LIFECYCLE: Record<Lifecycle, { label: string; blurb: string; tone: string }> = {
  bin: {
    label: "Bin",
    blurb: "Every mockup starts here.",
    tone: "var(--ax-amber)",
  },
  in_progress: {
    label: "In progress",
    blurb: "Actively being worked on.",
    tone: "var(--ax-blue)",
  },
  ready: {
    label: "Ready",
    blurb: "Complete mockup, ready for use.",
    tone: "var(--ax-accent)",
  },
  converted: {
    label: "Converted to assets",
    blurb: "Turned into production assets.",
    tone: "var(--ax-violet)",
  },
  archived: {
    label: "Archived",
    blurb: "No longer in active use.",
    tone: "var(--ax-faint)",
  },
};

export function isLifecycle(v: string | null | undefined): v is Lifecycle {
  return LIFECYCLE_ORDER.includes(v as Lifecycle);
}

/** Anything unrecognised reads as 'bin' — the safe, least-progressed state. */
export function toLifecycle(v: string | null | undefined): Lifecycle {
  return isLifecycle(v) ? v : "bin";
}

/**
 * The stages an operator can move to by hand.
 *
 * 'converted' is deliberately absent: it is a CONSEQUENCE of turning a mockup
 * into assets, not a label to apply. Letting someone set it manually would make
 * the state a claim rather than a fact, and the whole value of the lifecycle is
 * that "converted" means assets actually exist.
 */
export const MANUAL_STAGES: Lifecycle[] = ["bin", "in_progress", "ready", "archived"];

export function canSetManually(stage: Lifecycle): boolean {
  return MANUAL_STAGES.includes(stage);
}

/** Counts per stage, for the library's filter chips. */
export function countByLifecycle<T extends { lifecycle: string }>(items: T[]): Record<Lifecycle, number> {
  const out: Record<Lifecycle, number> = {
    bin: 0, in_progress: 0, ready: 0, converted: 0, archived: 0,
  };
  for (const i of items) out[toLifecycle(i.lifecycle)] += 1;
  return out;
}

/**
 * Archived mockups are hidden unless asked for.
 *
 * "No longer in active use" should mean it stops appearing in the way of
 * everyday work — otherwise archiving does nothing an operator can feel.
 */
export function applyLifecycleFilter<T extends { lifecycle: string }>(items: T[], filter: Lifecycle | "all"): T[] {
  if (filter === "all") return items.filter((i) => toLifecycle(i.lifecycle) !== "archived");
  return items.filter((i) => toLifecycle(i.lifecycle) === filter);
}
