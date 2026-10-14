// AX OS V2 — client visibility for designs.
//
// THE DISTINCTION THIS FILE EXISTS TO ENFORCE:
//
//   AX Production Asset  ≠  Client Presentation Asset
//
// AX needs the original transparent production PNG. The client needs to see
// what the artwork looks like, name it, and ask for it on a garment. Those are
// different assets with different audiences, and conflating them is how
// production artwork walks out of the building.
//
// The defence is architectural, not cosmetic. There are no watermarks here —
// watermarks make a client feel suspected, and they do not actually stop
// anyone. Instead the production file simply is not reachable from a client
// session: it lives in `design-files`, which no client-facing storage policy
// grants access to, while previews live in `design-previews` behind a policy
// keyed on the rules below. A hidden download button is not a security control
// and nothing in V2 relies on one.
//
// Every rule here is mirrored by public.design_client_visible() in Postgres.
// The database is authoritative; this module exists so the operator UI can
// predict and explain what the database will decide, without a round trip.

import type { ClientVisibility, Design } from "./types";

export type { ClientVisibility };

export const VISIBILITY_LABEL: Record<ClientVisibility, string> = {
  hidden: "Hidden",
  preview: "Visible as preview",
};

/**
 * Why a design is or is not client-visible.
 *
 * `blocked-by-group` is the interesting one: the design itself is marked
 * visible but its group is not. That state is legitimate and reachable — an
 * operator sets a design visible, then later hides the whole folder — and the
 * shelf renders it distinctly rather than silently showing "hidden", so nobody
 * has to wonder why a design they marked visible is not appearing.
 */
export type VisibilityReason = "visible" | "hidden" | "blocked-by-group";

export interface VisibilityState {
  effective: ClientVisibility;
  reason: VisibilityReason;
}

/**
 * A group is a CEILING over its members, not a default for them.
 *
 * Considered and rejected: "group sets the default, member overrides". That
 * reading means hiding a folder can leave a member exposed, so an operator
 * cannot trust the folder-level control — and the folder-level control is
 * exactly the one they will reach for in a hurry. Ceiling semantics make the
 * safe action (hide the folder) unconditionally safe.
 *
 * The cost is that promoting a folder does not promote its members. That is
 * paid for in the UI, not in the rule: see promotableMembers().
 */
export function effectiveVisibility(
  design: ClientVisibility,
  group: ClientVisibility | null,
): ClientVisibility {
  if (design !== "preview") return "hidden";
  if (group === null) return "preview";
  return group === "preview" ? "preview" : "hidden";
}

export function visibilityState(
  design: ClientVisibility,
  group: ClientVisibility | null,
): VisibilityState {
  const effective = effectiveVisibility(design, group);
  if (effective === "preview") return { effective, reason: "visible" };
  if (design === "preview" && group === "hidden") {
    return { effective, reason: "blocked-by-group" };
  }
  return { effective, reason: "hidden" };
}

/* ------------------------------------------------------------ preview asset */

/**
 * Whether a design can actually be shown to a client right now.
 *
 * Marking a design visible is a statement of intent; it does nothing until a
 * preview rendition exists. Rather than fall back to the production file when
 * the preview is missing — which would defeat the entire point — the client
 * path shows nothing, and the operator sees `pending` here.
 */
export type PreviewReadiness = "ready" | "pending" | "no-source";

export function previewReadiness(design: Pick<Design, "hasPreview" | "filePath">): PreviewReadiness {
  if (design.hasPreview) return "ready";
  return design.filePath ? "pending" : "no-source";
}

export const PREVIEW_READINESS_LABEL: Record<PreviewReadiness, string> = {
  ready: "Preview ready",
  pending: "Preview not generated yet",
  "no-source": "No artwork to render a preview from",
};

/**
 * Designs a client would NOT see despite being marked visible, because their
 * preview has not been rendered. Surfaced as a single actionable line rather
 * than a badge per card — an operator wants "3 need previews", not a hunt.
 */
export function awaitingPreview(designs: Design[], groupOf: (d: Design) => ClientVisibility | null): Design[] {
  return designs.filter(
    (d) =>
      effectiveVisibility(d.clientVisibility, groupOf(d)) === "preview" &&
      previewReadiness(d) !== "ready",
  );
}

/* -------------------------------------------------------------- group moves */

/**
 * When an operator makes a group visible, these are the members that would
 * still be hidden by their own setting.
 *
 * The UI offers "also make all N visible" as one click. That is where the
 * ergonomic cost of ceiling semantics gets paid — the operator gets the
 * intuitive outcome without the rule having to be unsafe.
 */
export function promotableMembers(members: Design[]): Design[] {
  return members.filter((d) => d.clientVisibility !== "preview");
}

/**
 * What a group's control should read as, given its members.
 *
 * `mixed` matters: a folder marked visible whose members are half hidden is a
 * normal working state, and showing it as plain "visible" would overstate what
 * the client can actually see.
 */
export type GroupVisibilitySummary = "hidden" | "visible" | "mixed" | "empty";

export function groupVisibilitySummary(
  group: ClientVisibility,
  members: Design[],
): GroupVisibilitySummary {
  if (members.length === 0) return "empty";
  if (group !== "preview") return "hidden";
  const visible = members.filter((d) => d.clientVisibility === "preview").length;
  if (visible === 0) return "hidden";
  return visible === members.length ? "visible" : "mixed";
}

/** How many designs on this shelf a client can actually see. */
export function visibleCount(designs: Design[], groupOf: (d: Design) => ClientVisibility | null): number {
  return designs.filter(
    (d) => effectiveVisibility(d.clientVisibility, groupOf(d)) === "preview" && d.hasPreview,
  ).length;
}
