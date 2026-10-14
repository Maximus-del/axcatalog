// AX OS V2 — turning a mockup into a Product.
//
// This is the link that was missing: a Product Concept could be created but
// never became something sellable without leaving the entity workspace. Nothing
// here invents a new object — it fills in a `products` row from the concept's
// own lineage (design, blank, colour, placement, collection) plus the blank's
// commerce facts, and then points `mockups.product_id` back at it so the trail
// from artwork to storefront stays intact.

import { slugify } from "@/lib/slug";
import { cleanDesignTitle } from "./concepts";
import { priceFor } from "./pricing";
import type { AudienceKey, Blank, Design, Entity, ProductConcept } from "./types";

export interface ProductDraft {
  title: string;
  slug: string;
  description: string;
  price: number | null;
  /** Colours the product will be offered in. Defaults to the concept's colour. */
  colors: string[];
  sizes: string[];
  blankId: string | null;
  /**
   * True when blankId names a row in `v2_blanks` rather than the legacy
   * `blanks` table. The two columns mean different things and products has no
   * foreign key on either, so getting this wrong is silent.
   */
  blankIsV2: boolean;
  collectionId: string | null;
  conceptId: string;
  /** The audience whose tier price was used, recorded so the number is explainable. */
  audience: AudienceKey;
}

export interface ProductDraftInput {
  entity: Entity;
  concept: ProductConcept;
  blank: Blank | null;
  design: Design | null;
  collectionName?: string | null;
  audience: AudienceKey;
  /** Offer every colour the blank has, rather than only the one on the concept. */
  allColors?: boolean;
}

/**
 * Everything AX can infer. The operator sees this filled in and edits what they
 * disagree with — nobody retypes what the system already knows.
 */
export function buildProductDraft(input: ProductDraftInput): ProductDraft {
  const { entity, concept, blank, design, collectionName, audience, allColors } = input;

  const title = draftTitle(entity, concept, blank, design, collectionName);
  const colors = allColors
    ? (blank?.colors ?? []).filter((c) => c.available).map((c) => c.name)
    : concept.colorName
      ? [concept.colorName]
      : [];

  return {
    title,
    slug: draftSlug(title, concept.id),
    description: draftDescription(entity, concept, blank, design),
    price: blank ? priceFor(blank, audience) : null,
    colors,
    sizes: blank?.sizes ?? [],
    blankId: concept.blankId,
    // The V2 catalog is the only place a Blank object comes from now, so a
    // resolved blank is a V2 blank. An unresolved id is left as legacy, which
    // is what it will be.
    blankIsV2: Boolean(blank && concept.blankId === blank.id),
    collectionId: concept.collectionId,
    conceptId: concept.id,
    audience,
  };
}

function draftTitle(
  entity: Entity,
  concept: ProductConcept,
  blank: Blank | null,
  design: Design | null,
  collectionName?: string | null,
): string {
  const designName = cleanDesignTitle(design?.title);
  // Prefer the operator's own words: a concept they named beats anything derived.
  const conceptName = cleanDesignTitle(concept.title);
  const lead = designName ?? collectionName ?? conceptName ?? entity.name;
  const garment = blank?.name;
  if (garment && lead && !lead.toLowerCase().includes(garment.toLowerCase())) return `${lead} ${garment}`;
  return lead || garment || "Untitled product";
}

/** Slug must be unique per organisation, so a short concept-derived suffix is appended. */
export function draftSlug(title: string, conceptId: string): string {
  const base = slugify(title) || "product";
  return `${base}-${conceptId.slice(0, 6)}`;
}

function draftDescription(
  entity: Entity,
  concept: ProductConcept,
  blank: Blank | null,
  design: Design | null,
): string {
  const bits: string[] = [];
  const designName = cleanDesignTitle(design?.title);
  if (designName) bits.push(`${designName} for ${entity.name}.`);
  else bits.push(`${entity.name}.`);
  if (blank) {
    const spec = [blank.brand, blank.styleNumber].filter(Boolean).join(" ");
    bits.push(spec ? `Printed on ${blank.name} (${spec}).` : `Printed on ${blank.name}.`);
  }
  if (concept.placementLabel && concept.surface) {
    bits.push(`${capitalise(concept.surface)} ${concept.placementLabel.toLowerCase()} placement.`);
  }
  return bits.join(" ");
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * What is still missing before this is worth creating. Empty means AX has
 * enough to make a real product rather than an empty shell.
 */
export function draftGaps(draft: ProductDraft): string[] {
  const gaps: string[] = [];
  if (!draft.title.trim()) gaps.push("a name");
  if (!draft.blankId) gaps.push("a blank");
  if (draft.price == null) gaps.push("a price");
  if (draft.colors.length === 0) gaps.push("at least one colour");
  if (draft.sizes.length === 0) gaps.push("at least one size");
  return gaps;
}

export function canCreate(draft: ProductDraft): boolean {
  return draftGaps(draft).length === 0;
}

/** The `products` row this draft becomes. Kept here so the shape is testable. */
export function draftToProductRow(draft: ProductDraft, organizationId: string) {
  return {
    organization_id: organizationId,
    title: draft.title.trim(),
    slug: draft.slug,
    description: draft.description,
    price: draft.price,
    product_type: "athlete_merch",
    status: "draft",
    approval_state: "none",
    // Exactly one of these. blank_id means the legacy `blanks` table; a V2
    // catalog id goes in v2_blank_id, which has a real foreign key.
    blank_id: draft.blankIsV2 ? null : draft.blankId,
    v2_blank_id: draft.blankIsV2 ? draft.blankId : null,
    // product_variants.shopify_variant_id is NOT NULL, so an AX-native product
    // cannot use that table yet. Colours and sizes ride in metadata, matching
    // what the existing V1 product creator already does.
    metadata: {
      colors: draft.colors,
      sizes: draft.sizes,
      created_from: { source: "admin-v2", concept_id: draft.conceptId, audience: draft.audience },
    },
  };
}
