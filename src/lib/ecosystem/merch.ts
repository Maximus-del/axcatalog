// ─────────────────────────────────────────────────────────────────────────
// MERCH domain: one product object, many surfaces.
//
// The same products row drives the operator view, the athlete's approval, the
// fan storefront, and Shopify. Nothing here duplicates a product per surface.
//
// Status is DERIVED, not stored. The database already carries three independent
// axes — products.status, products.approval_state, products.shopify_sync_status
// — plus whether the commerce data is complete. Adding a fourth stored status
// would guarantee they drift apart. lifecycleOf() is the single place that
// reconciles them into the one label a human should see.
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

export type Lifecycle =
  | "concept"
  | "draft"
  | "awaiting_approval"
  | "changes_requested"
  | "approved_setup_pending"
  | "ready_for_shopify"
  | "publishing"
  | "live"
  | "archived";

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  concept: "Concept",
  draft: "Draft",
  awaiting_approval: "Awaiting approval",
  changes_requested: "Changes requested",
  approved_setup_pending: "Approved · setup pending",
  ready_for_shopify: "Ready for Shopify",
  publishing: "Publishing",
  live: "Live on Shopify",
  archived: "Archived",
};

/** Tone for the chip. Kept out of the components so every surface agrees. */
export const LIFECYCLE_TONE: Record<Lifecycle, "neutral" | "accent" | "warn" | "good"> = {
  concept: "neutral",
  draft: "neutral",
  awaiting_approval: "accent",
  changes_requested: "warn",
  approved_setup_pending: "warn",
  ready_for_shopify: "accent",
  publishing: "accent",
  live: "good",
  archived: "neutral",
};

export interface ProductLike {
  id: string;
  title: string | null;
  description: string | null;
  price: number | null;
  status: string | null;
  approval_state: string | null;
  approval_note: string | null;
  blank_id: string | null;
  shopify_product_id: string | null;
  shopify_handle: string | null;
  shopify_sync_status: string | null;
  shopify_last_synced_at: string | null;
  updated_at?: string | null;
  image_count?: number;
  design_count?: number;
  color_count?: number;
  size_count?: number;
}

/**
 * Adapt a product row joined with its images/designs into the shape the status
 * model reads. Counts are what matter, not the rows themselves — and colors and
 * sizes live in metadata for AX-native products, since product_variants is
 * Shopify's mirror and can't hold rows until Shopify assigns the IDs.
 */
export function toProductLike(row: {
  id: string;
  title: string | null;
  description?: string | null;
  price: number | null;
  status: string | null;
  blank_id?: string | null;
  updated_at?: string | null;
  approval_state?: string | null;
  approval_note?: string | null;
  shopify_product_id?: string | null;
  shopify_handle?: string | null;
  shopify_sync_status?: string | null;
  shopify_last_synced_at?: string | null;
  metadata?: Record<string, unknown> | null;
  images?: unknown[] | null;
  designs?: unknown[] | null;
}): ProductLike {
  const meta = row.metadata ?? {};
  const colors = Array.isArray(meta.colors) ? meta.colors : [];
  const sizes = Array.isArray(meta.sizes) ? meta.sizes : [];
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    price: row.price,
    status: row.status,
    approval_state: row.approval_state ?? null,
    approval_note: row.approval_note ?? null,
    blank_id: row.blank_id ?? null,
    shopify_product_id: row.shopify_product_id ?? null,
    shopify_handle: row.shopify_handle ?? null,
    shopify_sync_status: row.shopify_sync_status ?? null,
    shopify_last_synced_at: row.shopify_last_synced_at ?? null,
    updated_at: row.updated_at ?? null,
    image_count: row.images?.length ?? 0,
    design_count: row.designs?.length ?? 0,
    color_count: colors.length,
    size_count: sizes.length,
  };
}

export interface Requirement { key: string; label: string; met: boolean }

/**
 * What Shopify needs before this product can exist there. Approval alone is not
 * enough — an approved product with no price or blank is still unpublishable,
 * and saying so plainly beats a failed push.
 */
export function shopifyRequirements(p: ProductLike): Requirement[] {
  return [
    { key: "title", label: "Product title", met: !!p.title?.trim() },
    { key: "description", label: "Description", met: !!p.description?.trim() },
    { key: "image", label: "Product image", met: (p.image_count ?? 0) > 0 },
    { key: "blank", label: "Blank / product configuration", met: !!p.blank_id },
    { key: "color", label: "Color", met: (p.color_count ?? 0) > 0 },
    { key: "size", label: "Size variants", met: (p.size_count ?? 0) > 0 },
    { key: "price", label: "Price", met: typeof p.price === "number" && p.price > 0 },
  ];
}

export function missingRequirements(p: ProductLike): Requirement[] {
  return shopifyRequirements(p).filter((r) => !r.met);
}

export function isShopifyReady(p: ProductLike): boolean {
  return missingRequirements(p).length === 0;
}

/**
 * A concept is the deliberately-allowed half-built state: there is something to
 * look at (an image or a design) but the operational detail isn't filled in.
 * It exists so creative work doesn't stall waiting on blanks and pricing.
 */
export function isConcept(p: ProductLike): boolean {
  const hasVisual = (p.image_count ?? 0) > 0 || (p.design_count ?? 0) > 0;
  const unconfigured = !p.blank_id || !(typeof p.price === "number" && p.price > 0);
  return hasVisual && unconfigured;
}

export function lifecycleOf(p: ProductLike): Lifecycle {
  if (p.status === "archived") return "archived";
  if (p.shopify_product_id) return "live";
  if (p.shopify_sync_status === "publishing") return "publishing";

  if (p.approval_state === "rejected") return "changes_requested";
  if (p.approval_state === "pending") return "awaiting_approval";
  if (p.approval_state === "approved") {
    return isShopifyReady(p) ? "ready_for_shopify" : "approved_setup_pending";
  }

  if (isConcept(p)) return "concept";
  return "draft";
}

/** The clock: setup is incomplete, and hovering says exactly what's missing. */
export function showsPendingClock(p: ProductLike): boolean {
  const stage = lifecycleOf(p);
  if (stage === "archived" || stage === "live") return false;
  return !isShopifyReady(p);
}

/**
 * Edits after publishing shouldn't silently rewrite live commerce data. If the
 * product changed since its last sync, the operator gets told rather than the
 * storefront getting surprised.
 */
export function hasUnsyncedChanges(p: ProductLike): boolean {
  if (!p.shopify_product_id || !p.updated_at) return false;
  if (!p.shopify_last_synced_at) return true;
  return new Date(p.updated_at).getTime() > new Date(p.shopify_last_synced_at).getTime() + 1000;
}

// ---- Approval snapshots ---------------------------------------------------

/** Fields that change what the athlete actually agreed to. */
const MATERIAL_FIELDS = ["title", "description", "price", "blank_id", "colors", "sizes", "hero_image", "design_ids"] as const;

export type ApprovalSnapshot = Partial<Record<(typeof MATERIAL_FIELDS)[number], unknown>>;

/**
 * Which material fields changed since approval. Metadata churn — notes, tags,
 * internal flags, sort order — deliberately isn't here: making every trivial
 * edit demand re-approval would train the athlete to rubber-stamp.
 */
export function materialChangesSince(snapshot: ApprovalSnapshot | null | undefined, current: ApprovalSnapshot): string[] {
  if (!snapshot) return [];
  const changed: string[] = [];
  for (const field of MATERIAL_FIELDS) {
    const before = snapshot[field];
    const after = current[field];
    if (JSON.stringify(before ?? null) !== JSON.stringify(after ?? null)) changed.push(field);
  }
  return changed;
}

export function needsReapproval(snapshot: ApprovalSnapshot | null | undefined, current: ApprovalSnapshot): boolean {
  return materialChangesSince(snapshot, current).length > 0;
}

export async function recordApproval(input: {
  organization_id: string;
  product_id: string;
  athlete_id: string | null;
  state: "approved" | "rejected";
  note?: string | null;
  snapshot: ApprovalSnapshot;
  decided_by?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("product_approvals" as never).insert({
    organization_id: input.organization_id,
    product_id: input.product_id,
    athlete_id: input.athlete_id,
    state: input.state,
    note: input.note ?? null,
    snapshot: input.snapshot,
    decided_by: input.decided_by ?? null,
  } as never);
  if (error) throw error;
}

export async function fetchLatestApproval(productId: string): Promise<{ state: string; note: string | null; snapshot: ApprovalSnapshot; created_at: string } | null> {
  const { data, error } = await supabase
    .from("product_approvals" as never)
    .select("state, note, snapshot, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as never;
}

// ---- Generated copy -------------------------------------------------------

export interface CopyInput {
  athleteName?: string | null;
  collectionName?: string | null;
  designName?: string | null;
  blankName?: string | null;
  garmentType?: string | null;
  color?: string | null;
  fabric?: string | null;
  fabricSpecs?: Record<string, unknown> | null;
  styleName?: string | null;
}

const GARMENT_WORDS: Record<string, string> = {
  tee: "Tee",
  long_sleeve: "Long Sleeve",
  hoodie: "Hoodie",
  crewneck: "Crewneck",
  zip_hoodie: "Zip Hoodie",
  tank: "Tank",
  polo: "Polo",
  jersey: "Jersey",
  shorts: "Shorts",
  sweatpants: "Sweatpants",
  hat: "Hat",
  beanie: "Beanie",
};

const titleCase = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();

/**
 * "Darnell Mooney Collegiate Heavyweight Tee" — athlete, then the creative
 * family, then the garment. Duplicated words are collapsed so a collection
 * already named after the athlete doesn't stutter.
 */
export function generateProductTitle(input: CopyInput): string {
  const parts = [
    input.athleteName?.trim(),
    input.collectionName?.trim() || input.styleName?.trim(),
    input.blankName?.trim() || (input.garmentType ? GARMENT_WORDS[input.garmentType] ?? titleCase(input.garmentType) : ""),
  ].filter(Boolean) as string[];

  const seen = new Set<string>();
  const words: string[] = [];
  for (const part of parts) {
    for (const word of part.split(/\s+/)) {
      const key = word.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      words.push(word);
    }
  }
  return words.join(" ");
}

/**
 * Product-focused, not salesy. Specs come from the blank so they're written
 * once and reused across every athlete rather than retyped per product.
 */
export function generateProductDescription(input: CopyInput): string {
  const garment = input.blankName?.trim()
    || (input.garmentType ? GARMENT_WORDS[input.garmentType] ?? titleCase(input.garmentType) : "piece");

  const lead: string[] = [];
  if (input.athleteName && input.collectionName) {
    lead.push(`${garment} from ${input.athleteName}'s ${input.collectionName} collection.`);
  } else if (input.athleteName) {
    lead.push(`${garment} from ${input.athleteName}.`);
  } else if (input.collectionName) {
    lead.push(`${garment} from the ${input.collectionName} collection.`);
  } else {
    lead.push(`${garment}.`);
  }

  if (input.designName) lead.push(`Featuring the ${input.designName} graphic.`);
  if (input.color) lead.push(`Shown in ${input.color}.`);

  const specs: string[] = [];
  if (input.fabric) specs.push(input.fabric);
  const fs = input.fabricSpecs ?? {};
  if (fs.weight_oz) specs.push(`${fs.weight_oz} oz`);
  if (fs.gsm) specs.push(`${fs.gsm} GSM`);
  if (fs.fit) specs.push(`${String(fs.fit)} fit`);

  const out = [lead.join(" ")];
  if (specs.length) out.push(specs.join(" · "));
  return out.join("\n\n");
}

// ---- Product creation from the athlete page ------------------------------

export interface CreateProductInput {
  organization_id: string;
  athlete_id: string;
  title: string;
  description?: string | null;
  price?: number | null;
  blank_id?: string | null;
  collection_id?: string | null;
  design_ids?: string[];
  colors?: string[];
  sizes?: string[];
  product_type?: string;
  team_id_at_release?: string | null;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "product";

/**
 * One call from the athlete page: the product, its athlete link, its designs,
 * and its collection membership. Chosen colors and sizes live in metadata —
 * product_variants belongs to Shopify (its shopify_variant_id is NOT NULL), so
 * an AX-native product cannot own rows there until Shopify assigns the IDs.
 */
export async function createAthleteProduct(input: CreateProductInput): Promise<string> {
  const row = {
    organization_id: input.organization_id,
    title: input.title.trim(),
    slug: `${slugify(input.title)}-${Math.floor(Math.random() * 1e4)}`,
    description: input.description?.trim() || null,
    price: input.price ?? null,
    blank_id: input.blank_id ?? null,
    product_type: input.product_type ?? "athlete_merch",
    status: "draft",
    metadata: {
      colors: input.colors ?? [],
      sizes: input.sizes ?? [],
      created_from: "athlete_overview",
    },
  };
  const { data, error } = await supabase.from("products" as never).insert(row as never).select("id").single();
  if (error) throw error;
  const productId = (data as unknown as { id: string }).id;

  const links: Promise<unknown>[] = [
    supabase.from("product_athletes" as never).insert({
      product_id: productId,
      athlete_id: input.athlete_id,
      role: "primary",
      team_id_at_release: input.team_id_at_release ?? null,
    } as never),
  ];

  if (input.design_ids?.length) {
    links.push(
      supabase.from("product_designs" as never).insert(
        input.design_ids.map((design_id, i) => ({ product_id: productId, design_id, sort_order: i })) as never,
      ),
    );
  }
  if (input.collection_id) {
    links.push(
      supabase.from("collection_products" as never).insert({
        collection_id: input.collection_id,
        product_id: productId,
        sort_order: 0,
      } as never),
    );
  }
  await Promise.all(links);
  return productId;
}

// ---- Shopify publish (draft-first) ---------------------------------------

export interface PublishResult {
  ok: boolean;
  shopify_product_id?: string;
  handle?: string;
  variant_count?: number;
  media_error?: string | null;
  error?: string;
}

/**
 * Calls the shopify-create-product edge function. Draft by default — the point
 * of the AX approval gate is that nothing reaches a live storefront by accident.
 */
export async function publishProductToShopify(productId: string, status: "DRAFT" | "ACTIVE" = "DRAFT"): Promise<PublishResult> {
  const { data, error } = await supabase.functions.invoke("shopify-create-product", {
    body: { product_id: productId, status },
  });
  if (error) return { ok: false, error: error.message };
  return (data ?? { ok: false, error: "no response" }) as PublishResult;
}

/** The storefront URL for a published product. One stored handle, every surface. */
export function shopifyProductUrl(handle: string | null | undefined): string | null {
  return handle ? `https://athletexclusive.com/products/${handle}` : null;
}
