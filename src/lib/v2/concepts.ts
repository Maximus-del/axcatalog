// AX OS V2 — Product Concept model.
//
// A Product Concept is the visual idea of a Design on a Blank. It is allowed to
// be nothing but an image and an entity. It never requires a Shopify product,
// variants, inventory, final pricing or a production PNG.
//
// STORAGE DECISION (see AX_OS_V2_SOURCE_OF_TRUTH.md): concepts live in the
// existing `mockups` table under kind='concept'. `mockups` already had
// design_id / blank_id / athlete_id / product_id FKs and org-scoped RLS, so a
// separate product_concepts table would have duplicated a backend object for
// convenience — exactly what V2 forbids.

import type { ApprovalState, ProductConcept } from "./types";

export interface ConceptDraft {
  title: string;
  entityId: string;
  organizationId: string;
  designId?: string | null;
  blankId?: string | null;
  collectionId?: string | null;
  colorName?: string | null;
  surface?: string | null;
  zoneId?: string | null;
  placementLabel?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  flow: "design_first" | "blank_first" | "upload";
  /** Per-surface alignment line positions, so a reopened mockup looks identical. */
  guides?: Record<string, { x: number; y: number }>;
}

/**
 * Everything a concept is still missing before it could become a Product.
 *
 * PLACEMENT IS `surface`, NOT `zoneId`.
 *
 * `zone_id` records which print-zone PRESET was used, and V2 placement is
 * freeform: the canvas clears the zone the instant the operator drags the
 * artwork, which is every real mockup. Testing zoneId therefore reported a
 * finished, fully-placed, hand-positioned mockup as an unspecified "Idea",
 * and both "ready to configure" queues — the one on Overview and the one in
 * the entity workspace — could never fire.
 *
 * `surface` is written whenever anything is actually placed, so it is the
 * honest signal that a placement exists.
 */
export function missingForProduct(c: ProductConcept): string[] {
  const gaps: string[] = [];
  if (!c.designId) gaps.push("design");
  if (!c.blankId) gaps.push("blank");
  if (!c.colorName) gaps.push("colour");
  if (!c.surface) gaps.push("placement");
  return gaps;
}

/** A concept is "configurable" once the four creative decisions are made. */
export function isConfigurable(c: ProductConcept): boolean {
  return missingForProduct(c).length === 0;
}

export type ConceptStage = "idea" | "specified" | "awaiting_approval" | "approved" | "changes_requested" | "productized";

/**
 * Derived, never stored. A stored stage column would drift from the underlying
 * relationships within a week — the same call V1 made for product lifecycle.
 */
export function stageOf(c: ProductConcept): ConceptStage {
  if (c.productId) return "productized";
  if (c.approvalState === "approved") return "approved";
  if (c.approvalState === "changes_requested") return "changes_requested";
  if (c.approvalState === "pending") return "awaiting_approval";
  return isConfigurable(c) ? "specified" : "idea";
}

export const STAGE_LABELS: Record<ConceptStage, string> = {
  idea: "Idea",
  specified: "Specified",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  changes_requested: "Changes requested",
  productized: "Product created",
};

export const STAGE_TONES: Record<ConceptStage, string> = {
  idea: "var(--ax-faint)",
  specified: "var(--ax-blue)",
  awaiting_approval: "var(--ax-amber)",
  approved: "var(--ax-accent)",
  changes_requested: "var(--ax-red)",
  productized: "var(--ax-violet)",
};

/** Title AX suggests when the operator has not typed one. */
export function suggestTitle(parts: {
  entityName?: string | null;
  designTitle?: string | null;
  blankName?: string | null;
  colorName?: string | null;
}): string {
  const design = cleanDesignTitle(parts.designTitle);
  const bits = [parts.entityName, design, parts.blankName, parts.colorName].filter(Boolean);
  return bits.join(" · ") || "Untitled concept";
}

/**
 * Live design titles are mostly generator filenames ("ChatGPT Image Aug 16,
 * 2026, 03 11 02 PM (1)"). Those are noise in a concept name.
 */
export function cleanDesignTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.trim();
  if (/^(chatgpt|dall[- ]?e|midjourney|pasted|image|untitled|screenshot)\b/i.test(t)) return null;
  if (/^\d[\d\s._-]*$/.test(t)) return null;
  return t;
}

export const APPROVAL_LABELS: Record<ApprovalState, string> = {
  none: "Not sent",
  pending: "Awaiting approval",
  approved: "Approved",
  changes_requested: "Changes requested",
};

/** Row shape written to `mockups`. Kept in one place so the cast lives once. */
export function draftToRow(d: ConceptDraft) {
  return {
    organization_id: d.organizationId,
    athlete_id: d.entityId,
    title: d.title,
    kind: "concept",
    shot_type: "flat_lay",
    status: "draft",
    storage_bucket: "mockups",
    design_id: d.designId ?? null,
    /*
      THE GARMENT GOES IN v2_blank_id. NOT blank_id.

      `mockups.blank_id` is FK'd to the LEGACY `blanks` table:
        mockups_blank_id_fkey FOREIGN KEY (blank_id) REFERENCES blanks(id)

      Every V2 caller passes an id from `v2_blanks`, so writing it here raised
      23503 — "Key is not present in table blanks" — on every single save. The
      fix in 6360180 added v2_blank_id and repaired the PLACEMENT rows, but this
      function, which builds the mockup row itself, kept writing the old column.
      Both create paths go through it, so nothing could be saved on a V2 blank.

      Reproduced against the live database before changing this, and the same
      row with v2_blank_id inserts cleanly. Covered by a test below so it cannot
      come back a third time.
    */
    v2_blank_id: d.blankId ?? null,
    blank_id: null,
    collection_id: d.collectionId ?? null,
    color_name: d.colorName ?? null,
    surface: d.surface ?? null,
    zone_id: d.zoneId ?? null,
    placement_label: d.placementLabel ?? null,
    image_url: d.imageUrl ?? null,
    description: d.notes ?? null,
    approval_state: "none",
    guides: d.guides ?? {},
    created_from: { flow: d.flow, source: "admin-v2" },
  };
}
