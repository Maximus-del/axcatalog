// AX OS V2 — shared object model.
//
// V2 is an information-architecture rebuild, not a backend rewrite. Every type
// here is a *view* over tables that already exist in the live database. The
// mapping from V2 concept -> V1 table is recorded in AX_OS_V2_SOURCE_OF_TRUTH.md
// and repeated in the comments below so the two never drift silently.

/** What an entity IS. Column: athletes.entity_type. */
export type EntityType =
  | "person"
  | "organization"
  | "school"
  | "team"
  | "brand"
  | "facility"
  | "agency"
  | "other";

/** How AX works with an entity. Column: athletes.roles (text[]). */
export type EntityRole = "athlete" | "client" | "partner" | "vendor" | "sponsor";

export type EntityStatus = "active" | "inactive" | "archived" | "prospect";

/**
 * PEOPLE. Source of truth: `athletes` table.
 *
 * Deliberately NOT a new `entities` table: every product / design / collection /
 * mockup row already FKs to athletes.id. Forking that would create exactly the
 * duplicate-profile problem V2 exists to remove.
 */
export interface Entity {
  id: string;
  organizationId: string;
  /** Authoritative display name. Never re-concatenate first + last at a call site. */
  name: string;
  slug: string;
  entityType: EntityType;
  roles: EntityRole[];
  status: EntityStatus;
  position: string | null;
  league: string | null;
  avatarUrl: string | null;
  website: string | null;
  category: string | null;
  /** True when this entity owns its own Supabase organization (Darnell, Steven). */
  hasOwnOrg: boolean;
  orgName: string | null;
  isDemo: boolean;
}

/** Counts shown on the People directory + entity workspace header. */
export interface EntityCounts {
  collections: number;
  concepts: number;
  designs: number;
  products: number;
  liveProducts: number;
}

/**
 * DESIGN. Source of truth: `designs` + `design_files`.
 *
 * A Design is artwork. `productionReady` is TRUE only when a design_files row of
 * file_type='export' exists — i.e. a real production asset, not an idea image.
 * TO RECONCILE: 107 of 114 live designs are status='concept' with a 'mockup'
 * file. V2 surfaces that split rather than pretending it isn't there.
 */
/**
 * Whether a client-facing surface may show this design.
 *
 * 'preview' means a rendered, client-safe image — never the production PNG.
 * See src/lib/v2/visibility.ts for the rules and the reasoning.
 */
export type ClientVisibility = "hidden" | "preview";

export interface Design {
  id: string;
  title: string;
  status: string;
  entityId: string | null;
  /** Signed-URL inputs; design-files is a PRIVATE bucket. OPERATOR ONLY. */
  fileBucket: string | null;
  filePath: string | null;
  fileType: string | null;
  productionReady: boolean;
  /**
   * Per-entity client visibility, from `design_athletes.client_visibility`.
   * Never read this alone — a design inside a hidden group is hidden whatever
   * this says. Use effectiveVisibility() from ./visibility.
   */
  clientVisibility: ClientVisibility;
  /** True when a client-safe rendition exists in the `design-previews` bucket. */
  hasPreview: boolean;
  /** Path within `design-previews`. Structurally never a `design-files` path. */
  previewPath: string | null;
  createdAt: string;
}

/**
 * BLANK. Source of truth: `blanks` (+ blank_colors, blank_sizes,
 * the Drive's 03_APPROVED stage). One canonical record; photography, pricing,
 * availability and eligibility are ATTRIBUTES of it, never separate catalogs.
 */
export interface BlankColor {
  id: string;
  /** Human-readable colour name. This is what a mockup stores as color_name. */
  name: string;
  hex: string | null;
  imageUrl: string | null;
  /** The canonical back. For hoodies that is the hood-UP shot. */
  imageUrlBack: string | null;
  available: boolean;
}

export interface Blank {
  id: string;
  name: string;
  /** brand ?? supplier ?? vendor — three columns, one concept. TO RECONCILE. */
  brand: string | null;
  styleNumber: string | null;
  sku: string | null;
  garmentType: string;
  imageUrl: string | null;
  cost: number | null;
  priceAthlete: number | null;
  priceCorporate: number | null;
  priceStandard: number | null;
  availability: string;
  colors: BlankColor[];
  sizes: string[];
  /**
   * Audiences that may see this blank.
   *
   * In V2 curation happens in the Drive — 03_APPROVED holds exactly the blanks
   * AX sells — so every synced blank is available to every audience. This stays
   * an array so a real per-audience split can land later without a type change.
   */
  assortments: string[];
  /**
   * Client-facing name, set by hand and never written by the Drive sync.
   * `name` is the MANUFACTURER's name and may not be shown to a client.
   * A client surface renders displayName or nothing — never a fallback to name.
   */
  displayName?: string | null;
  /** Deep link back to the Drive folder this blank was built from. */
  driveFolderUrl?: string | null;
  /** Set once this blank is matched to Shopify, which owns price/cost/quantity. */
  shopifyProductId?: string | null;
  /** Data-completeness flags that feed Overview > Action Required. */
  missingCost: boolean;
  missingPhoto: boolean;
  missingAssortment: boolean;
}

export type AudienceKey = "athlete" | "client" | "subscriber" | "standard";

/**
 * PRODUCT CONCEPT. Source of truth: `mockups` WHERE kind='concept'.
 *
 * Reused rather than created: mockups already carried design_id / blank_id /
 * athlete_id / product_id and org-scoped RLS. V2 added kind, collection_id,
 * color_name, surface, zone_id, placement_label, approval_state, image_url and
 * created_from. A Concept may exist with nothing but an image and an entity.
 */
export type ApprovalState = "none" | "pending" | "approved" | "changes_requested";

export interface ProductConcept {
  id: string;
  title: string;
  entityId: string | null;
  collectionId: string | null;
  designId: string | null;
  blankId: string | null;
  productId: string | null;
  colorName: string | null;
  surface: string | null;
  zoneId: string | null;
  placementLabel: string | null;
  approvalState: ApprovalState;
  imageUrl: string | null;
  imageBucket: string | null;
  imagePath: string | null;
  notes: string | null;
  createdAt: string;
}

/**
 * MOCKUP — a saved composition of artwork on a blank.
 *
 * Source of truth: `mockups` WHERE kind='concept', with its arrangement in
 * `product_print_placements`. Same row the rest of V2 calls a Product Concept;
 * "Mockup" is the word every human-facing surface uses.
 *
 * A mockup is a finished object in its own right. It never needs a Product, a
 * Shopify listing, a price, inventory or an approval to be worth keeping, and
 * it can sit in the library indefinitely.
 */
export interface Mockup {
  id: string;
  title: string;
  entityId: string | null;
  organizationId: string;
  blankId: string | null;
  /** Resolved for display and search; the mockup row stores only the id. */
  blankName: string | null;
  colorName: string | null;
  /** Cover image — the garment shot the mockup was built on. */
  imageUrl: string | null;
  imageBucket: string | null;
  imagePath: string | null;
  /** Organisational only. Null means loose on the shelf. */
  folderId: string | null;
  sortOrder: number;
  status: string;
  /** Operator lifecycle: bin | in_progress | ready | converted | archived. */
  lifecycle: string;
  approvalState: ApprovalState;
  /** Set once this mockup has been configured into a sellable Product. */
  productId: string | null;
  collectionId: string | null;
  /** Per-surface alignment guide positions, percentages of the garment box. */
  guides: Record<string, { x: number; y: number }>;
  /** Which surfaces actually carry artwork. Derived from the placements. */
  surfaces: Array<"front" | "back">;
  placementCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A mockup folder. Source of truth: `asset_folders` WHERE scope='mockups'.
 *
 * Purely organisational — a folder never changes the mockups inside it.
 */
export interface MockupFolder {
  id: string;
  name: string;
  entityId: string | null;
  sortOrder: number;
  /** Reserved. Null means "use the first member", which is today's behaviour. */
  coverMockupId: string | null;
}

/** COLLECTION. Source of truth: `collections`. Never requires Shopify. */
export interface Collection {
  id: string;
  name: string;
  slug: string;
  status: string;
  collectionType: string;
  entityId: string | null;
  productCount: number;
  designCount: number;
  conceptCount: number;
  coverImageUrl: string | null;
  createdAt: string;
}

/** PRODUCT. Source of truth: `products` (+ product_images, product_athletes). */
export interface Product {
  id: string;
  title: string;
  sku: string | null;
  price: number | null;
  status: string;
  approvalState: string;
  shopifySyncStatus: string;
  shopifyProductId: string | null;
  shopifyHandle: string | null;
  blankId: string | null;
  imageUrl: string | null;
  /** Fallback visual from the concept this product came from (private bucket). */
  imageBucket?: string | null;
  imagePath?: string | null;
  createdAt: string;
}

/** ORDER. Source of truth: `orders` (+ order_line_items). */
export interface OrderRow {
  id: string;
  name: string | null;
  orderDate: string | null;
  customerName: string | null;
  total: number | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  shopifyOrderId: string | null;
  attributedOrgId: string | null;
}
