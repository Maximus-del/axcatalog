// AX OS V2 — data layer.
//
// Every read here targets a table that already exists. V2 created no new
// backend objects except ten additive columns on `mockups` (see
// AX_OS_V2_SOURCE_OF_TRUTH.md). Where the generated Supabase types lag the live
// schema — a pre-existing drift the audit recorded, not something V2 introduced
// — the `as never` cast the rest of the codebase uses is applied once, here.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { displayNameOf } from "./entity";
import { slugify } from "@/lib/slug";
import { draftToRow, type ConceptDraft } from "./concepts";
import type { DesignGroup, OrderWrite } from "./design-groups";
import { draftToProductRow, type ProductDraft } from "./productize";
import { mergeZones, type PrintZoneRow } from "./placements";
import { fromRows, type PlacementRow } from "./placement-geometry";
import type {
  AudienceKey,
  Blank,
  BlankColor,
  ClientVisibility,
  Collection,
  Design,
  Entity,
  EntityCounts,
  Mockup,
  MockupFolder,
  OrderRow,
  Product,
  ProductConcept,
} from "./types";

/* ------------------------------------------------------------------ helpers */

type Row = Record<string, unknown>;

const t = (table: string) => supabase.from(table as never);

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Public URL for a bucket/path pair (product-images and blanks are public). */
/** The `design-previews` bucket. Client-safe renditions only — never production artwork. */
const PREVIEW_BUCKET = "design-previews";

/**
 * Client-visibility defaults for the surfaces that do not load it.
 *
 * Only the design shelf reads and writes client visibility today. Everywhere
 * else a Design is constructed, these fields are pinned CLOSED rather than left
 * undefined, so that a surface which later starts rendering visibility cannot
 * accidentally inherit an open state it never actually loaded.
 */
const CLIENT_HIDDEN = {
  clientVisibility: "hidden",
  hasPreview: false,
  previewPath: null,
} as const satisfies Pick<Design, "clientVisibility" | "hasPreview" | "previewPath">;

export function publicUrl(bucket: string | null, path: string | null): string | null {
  if (!bucket || !path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/* ------------------------------------------------------------------ people */

async function fetchEntities(): Promise<(Entity & { counts: EntityCounts })[]> {
  const [athletesRes, orgsRes, collRes, prodLinkRes, prodRes, designLinkRes, conceptRes] = await Promise.all([
    t("athletes").select(
      "id, organization_id, first_name, last_name, display_name, slug, entity_type, roles, status, position, league, website, category, metadata",
    ),
    t("organizations").select("id, name, org_type"),
    t("collections").select("id, athlete_id"),
    t("product_athletes").select("athlete_id, product_id"),
    t("products").select("id, status, shopify_product_id"),
    t("design_athletes").select("athlete_id, design_id"),
    t("mockups").select("id, athlete_id, kind"),
  ]);

  const orgs = new Map<string, { name: string }>();
  for (const o of (orgsRes.data ?? []) as unknown as Row[]) {
    orgs.set(String(o.id), { name: String(o.name ?? "") });
  }

  const productById = new Map<string, Row>();
  for (const p of (prodRes.data ?? []) as unknown as Row[]) productById.set(String(p.id), p);

  const countBy = <T extends Row>(rows: T[], key: string) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const id = str(r[key]);
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };

  const collections = countBy((collRes.data ?? []) as unknown as Row[], "athlete_id");
  const designs = countBy((designLinkRes.data ?? []) as unknown as Row[], "athlete_id");
  const concepts = countBy(
    ((conceptRes.data ?? []) as unknown as Row[]).filter((m) => m.kind === "concept"),
    "athlete_id",
  );

  const products = new Map<string, number>();
  const live = new Map<string, number>();
  for (const link of (prodLinkRes.data ?? []) as unknown as Row[]) {
    const aid = str(link.athlete_id);
    if (!aid) continue;
    products.set(aid, (products.get(aid) ?? 0) + 1);
    const p = productById.get(String(link.product_id));
    if (p && p.status === "published" && p.shopify_product_id) live.set(aid, (live.get(aid) ?? 0) + 1);
  }

  return ((athletesRes.data ?? []) as unknown as Row[]).map((a) => {
    const id = String(a.id);
    const orgId = String(a.organization_id);
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    return {
      id,
      organizationId: orgId,
      name: displayNameOf(a as never),
      slug: String(a.slug ?? ""),
      entityType: (str(a.entity_type) ?? "person") as Entity["entityType"],
      roles: (Array.isArray(a.roles) ? (a.roles as string[]) : []) as Entity["roles"],
      status: (str(a.status) ?? "active") as Entity["status"],
      position: str(a.position),
      league: str(a.league),
      avatarUrl: str(meta.avatar_url) ?? str(meta.headshot_url),
      website: str(a.website),
      category: str(a.category),
      // An entity with a dedicated org owns its own commerce + order stream.
      hasOwnOrg: orgs.get(orgId)?.name === displayNameOf(a as never),
      orgName: orgs.get(orgId)?.name ?? null,
      isDemo: meta.demo === true,
      counts: {
        collections: collections.get(id) ?? 0,
        concepts: concepts.get(id) ?? 0,
        designs: designs.get(id) ?? 0,
        products: products.get(id) ?? 0,
        liveProducts: live.get(id) ?? 0,
      },
    };
  });
}

export function useEntities() {
  return useQuery({ queryKey: ["v2", "entities"], queryFn: fetchEntities, staleTime: 60_000 });
}

/* -------------------------------------------------------- entity workspace */

export interface EntityWorkspace {
  entity: Entity & { counts: EntityCounts };
  collections: Collection[];
  concepts: ProductConcept[];
  designs: Design[];
  products: Product[];
  orders: OrderRow[];
  /** Why the order list is what it is — attribution is not uniform. See audit. */
  ordersNote: string;
}

async function fetchWorkspace(entityId: string): Promise<EntityWorkspace | null> {
  const entities = await fetchEntities();
  const entity = entities.find((e) => e.id === entityId);
  if (!entity) return null;

  const [collRes, conceptRes, designLinkRes, prodLinkRes] = await Promise.all([
    t("collections")
      .select("id, name, slug, status, collection_type, athlete_id, created_at")
      .eq("athlete_id", entityId),
    t("mockups")
      .select(
        "id, title, athlete_id, collection_id, design_id, blank_id, v2_blank_id, product_id, color_name, surface, zone_id, placement_label, approval_state, image_url, storage_bucket, storage_path, description, created_at, kind",
      )
      .eq("athlete_id", entityId)
      .eq("kind", "concept")
      .order("created_at", { ascending: false }),
    t("design_athletes").select("design_id").eq("athlete_id", entityId),
    t("product_athletes").select("product_id").eq("athlete_id", entityId),
  ]);

  const designIds = ((designLinkRes.data ?? []) as unknown as Row[]).map((r) => String(r.design_id));
  const productIds = ((prodLinkRes.data ?? []) as unknown as Row[]).map((r) => String(r.product_id));

  const [designsRes, filesRes, productsRes, imagesRes, ordersRes] = await Promise.all([
    designIds.length
      ? t("designs").select("id, title, status, primary_athlete_id, created_at").in("id", designIds)
      : Promise.resolve({ data: [] }),
    designIds.length
      ? t("design_files")
          .select("design_id, storage_bucket, storage_path, file_type, is_primary, sort_order")
          .in("design_id", designIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? t("products")
          .select(
            "id, title, sku, price, status, approval_state, shopify_sync_status, shopify_product_id, shopify_handle, blank_id, created_at",
          )
          .in("id", productIds)
      : Promise.resolve({ data: [] }),
    productIds.length
      ? t("product_images").select("product_id, storage_bucket, storage_path, is_primary, sort_order").in("product_id", productIds)
      : Promise.resolve({ data: [] }),
    // Orders attribute to an ORGANISATION, not to an entity. Only entities with
    // their own org resolve cleanly today — recorded as TO RECONCILE.
    entity.hasOwnOrg
      ? t("orders")
          .select(
            "id, shopify_order_name, order_date, customer_name, total, financial_status, fulfillment_status, shopify_order_id, attributed_org_id",
          )
          .eq("attributed_org_id", entity.organizationId)
          .order("order_date", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
  ]);

  const fileFor = new Map<string, Row>();
  for (const f of (filesRes.data ?? []) as unknown as Row[]) {
    const key = String(f.design_id);
    const cur = fileFor.get(key);
    if (!cur || (f.is_primary === true && cur.is_primary !== true)) fileFor.set(key, f);
  }
  const exportByDesign = new Set(
    ((filesRes.data ?? []) as unknown as Row[]).filter((f) => f.file_type === "export").map((f) => String(f.design_id)),
  );

  const imageFor = new Map<string, Row>();
  for (const im of (imagesRes.data ?? []) as unknown as Row[]) {
    const key = String(im.product_id);
    const cur = imageFor.get(key);
    if (!cur || (im.is_primary === true && cur.is_primary !== true)) imageFor.set(key, im);
  }

  const concepts: ProductConcept[] = ((conceptRes.data ?? []) as unknown as Row[]).map(mapConcept);

  const conceptsByCollection = new Map<string, number>();
  for (const c of concepts) {
    if (!c.collectionId) continue;
    conceptsByCollection.set(c.collectionId, (conceptsByCollection.get(c.collectionId) ?? 0) + 1);
  }

  const collectionIds = ((collRes.data ?? []) as unknown as Row[]).map((c) => String(c.id));
  const [cpRes, cdRes] = await Promise.all([
    collectionIds.length
      ? t("collection_products").select("collection_id, product_id").in("collection_id", collectionIds)
      : Promise.resolve({ data: [] }),
    collectionIds.length
      ? t("collection_designs").select("collection_id, design_id").in("collection_id", collectionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const cpCount = new Map<string, number>();
  const coverFor = new Map<string, string>();
  for (const r of (cpRes.data ?? []) as unknown as Row[]) {
    const cid = String(r.collection_id);
    cpCount.set(cid, (cpCount.get(cid) ?? 0) + 1);
    if (!coverFor.has(cid)) {
      const im = imageFor.get(String(r.product_id));
      const url = im ? publicUrl(str(im.storage_bucket), str(im.storage_path)) : null;
      if (url) coverFor.set(cid, url);
    }
  }
  const cdCount = new Map<string, number>();
  for (const r of (cdRes.data ?? []) as unknown as Row[]) {
    const cid = String(r.collection_id);
    cdCount.set(cid, (cdCount.get(cid) ?? 0) + 1);
  }

  return {
    entity,
    concepts,
    collections: ((collRes.data ?? []) as unknown as Row[]).map((c) => ({
      id: String(c.id),
      name: String(c.name ?? ""),
      slug: String(c.slug ?? ""),
      status: String(c.status ?? "active"),
      collectionType: String(c.collection_type ?? ""),
      entityId: str(c.athlete_id),
      productCount: cpCount.get(String(c.id)) ?? 0,
      designCount: cdCount.get(String(c.id)) ?? 0,
      conceptCount: conceptsByCollection.get(String(c.id)) ?? 0,
      coverImageUrl: coverFor.get(String(c.id)) ?? null,
      createdAt: String(c.created_at ?? ""),
    })),
    designs: ((designsRes.data ?? []) as unknown as Row[]).map((d) => {
      const f = fileFor.get(String(d.id));
      return {
        id: String(d.id),
        title: String(d.title ?? ""),
        status: String(d.status ?? ""),
        entityId: str(d.primary_athlete_id),
        fileBucket: f ? str(f.storage_bucket) : null,
        filePath: f ? str(f.storage_path) : null,
        fileType: f ? str(f.file_type) : null,
        productionReady: exportByDesign.has(String(d.id)),
      ...CLIENT_HIDDEN,
        createdAt: String(d.created_at ?? ""),
      };
    }),
    products: ((productsRes.data ?? []) as unknown as Row[]).map((p) => {
      const im = imageFor.get(String(p.id));
      // A product created from a mockup has no product_images row of its own —
      // show the concept's visual rather than an empty tile.
      const fromConcept = concepts.find((c) => c.productId === String(p.id));
      return {
        id: String(p.id),
        title: String(p.title ?? ""),
        sku: str(p.sku),
        price: num(p.price),
        status: String(p.status ?? ""),
        approvalState: String(p.approval_state ?? "none"),
        shopifySyncStatus: String(p.shopify_sync_status ?? "not_synced"),
        shopifyProductId: str(p.shopify_product_id),
        shopifyHandle: str(p.shopify_handle),
        blankId: str(p.blank_id),
        imageUrl: im ? publicUrl(str(im.storage_bucket), str(im.storage_path)) : (fromConcept?.imageUrl ?? null),
        imageBucket: im ? null : (fromConcept?.imageBucket ?? null),
        imagePath: im ? null : (fromConcept?.imagePath ?? null),
        createdAt: String(p.created_at ?? ""),
      };
    }),
    orders: ((ordersRes.data ?? []) as unknown as Row[]).map((o) => ({
      id: String(o.id),
      name: str(o.shopify_order_name),
      orderDate: str(o.order_date),
      customerName: str(o.customer_name),
      total: num(o.total),
      financialStatus: str(o.financial_status),
      fulfillmentStatus: str(o.fulfillment_status),
      shopifyOrderId: str(o.shopify_order_id),
      attributedOrgId: str(o.attributed_org_id),
    })),
    ordersNote: entity.hasOwnOrg
      ? "Attributed through this entity's own organisation."
      : "This entity shares the Athlete Xclusive organisation, and order line items are not linked to product records, so orders cannot be attributed to it yet. Marked TO RECONCILE.",
  };
}

function mapConcept(m: Row): ProductConcept {
  return {
    id: String(m.id),
    title: String(m.title ?? ""),
    entityId: str(m.athlete_id),
    collectionId: str(m.collection_id),
    designId: str(m.design_id),
    blankId: str(m.v2_blank_id) ?? str(m.blank_id),
    productId: str(m.product_id),
    colorName: str(m.color_name),
    surface: str(m.surface),
    zoneId: str(m.zone_id),
    placementLabel: str(m.placement_label),
    approvalState: (str(m.approval_state) ?? "none") as ProductConcept["approvalState"],
    imageUrl: str(m.image_url),
    imageBucket: str(m.storage_bucket),
    imagePath: str(m.storage_path),
    notes: str(m.description),
    createdAt: String(m.created_at ?? ""),
  };
}

export function useEntityWorkspace(entityId: string | undefined) {
  return useQuery({
    queryKey: ["v2", "workspace", entityId],
    queryFn: () => fetchWorkspace(entityId as string),
    enabled: Boolean(entityId),
    staleTime: 30_000,
  });
}

/* ------------------------------------------------------------------ blanks */

/**
 * V2 BLANKS COME FROM THE DRIVE. THIS READS NO V1 TABLE.
 *
 * v2_blanks / v2_blank_colors / v2_blank_images only. V1's `blanks`,
 * `blank_colors`, `blank_sizes`, `blank_assortment_items` and the `blanks`
 * storage bucket can all be dropped without this function changing — which is
 * the whole point of the split.
 *
 * Three things V1 supplied that V2 deliberately does not, yet:
 *
 *   PRICING     V1 carried blank_cost plus three tier prices. In V2 Shopify owns
 *               price, cost and quantity, and it is not connected yet, so these
 *               read null and the UI shows an em dash. Serving V1's numbers here
 *               would quietly make V1 the source of truth again for the exact
 *               field we least want it to be. A missing price is honest; a stale
 *               one is not.
 *   SIZES       No V2 size table. Sizes are a Shopify variant concern.
 *   ASSORTMENTS Curation happens in the Drive — 03_APPROVED holds exactly the
 *               blanks AX sells — so every blank is available to every audience.
 *               Inventing a per-audience split would be fabricating data.
 */
const V2_AUDIENCES: AudienceKey[] = ["athlete", "client", "subscriber", "standard"];

async function fetchBlanks(): Promise<Blank[]> {
  const [blanksRes, colorsRes, imagesRes] = await Promise.all([
    t("v2_blanks").select(
      "id, supplier, name, display_name, style_code, garment_type, drive_folder_url, shopify_product_id, cost, price",
    ),
    t("v2_blank_colors").select("id, blank_id, name, display_name, hex, available, sort_order"),
    t("v2_blank_images").select("blank_id, color_id, view_type, variant, is_primary, drive_url"),
  ]);

  // The canonical image per colour and surface. For hoodies the canonical back
  // is the hood-UP shot, which the sync already flags is_primary — so nothing
  // here needs to know what a hood is. A primary always wins; without one, the
  // first image seen stands in.
  const frontByColor = new Map<string, string>();
  const backByColor = new Map<string, string>();
  for (const im of (imagesRes.data ?? []) as unknown as Row[]) {
    const cid = str(im.color_id);
    const url = str(im.drive_url);
    if (!cid || !url) continue;
    const target = im.view_type === "back" ? backByColor : frontByColor;
    if (im.is_primary === true || !target.has(cid)) target.set(cid, url);
  }

  const colorsByBlank = new Map<string, BlankColor[]>();
  for (const c of ((colorsRes.data ?? []) as unknown as Row[]).sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  )) {
    const bid = String(c.blank_id);
    const cid = String(c.id);
    colorsByBlank.set(bid, [
      ...(colorsByBlank.get(bid) ?? []),
      {
        id: cid,
        // display_name is the readable form of the Drive folder ("Cool_Blue" ->
        // "Cool Blue") and is what a mockup should store as its colour.
        name: String(c.display_name ?? c.name ?? ""),
        hex: str(c.hex),
        imageUrl: frontByColor.get(cid) ?? null,
        imageUrlBack: backByColor.get(cid) ?? null,
        available: c.available !== false,
      },
    ]);
  }

  return ((blanksRes.data ?? []) as unknown as Row[]).map((b) => {
    const id = String(b.id);
    const colors = colorsByBlank.get(id) ?? [];
    const image = colors.find((c) => c.imageUrl)?.imageUrl ?? null;
    const cost = num(b.cost);
    return {
      id,
      // The MANUFACTURER's name. Not for client display — see displayName.
      name: String(b.name ?? ""),
      displayName: str(b.display_name),
      brand: str(b.supplier),
      styleNumber: str(b.style_code),
      sku: null,
      garmentType: String(b.garment_type ?? "other"),
      imageUrl: image,
      cost,
      // Shopify owns pricing and is not connected. Null renders as an em dash.
      priceAthlete: null,
      priceCorporate: null,
      priceStandard: null,
      availability: "available",
      colors,
      sizes: [],
      assortments: [...V2_AUDIENCES],
      driveFolderUrl: str(b.drive_folder_url),
      shopifyProductId: str(b.shopify_product_id),
      missingCost: cost == null,
      missingPhoto: image == null,
      // Never "missing" in V2 — the Drive is the curation.
      missingAssortment: false,
    };
  });
}

export function useBlanks() {
  return useQuery({ queryKey: ["v2", "blanks"], queryFn: fetchBlanks, staleTime: 5 * 60_000 });
}

/* ----------------------------------------------------------------- designs */

async function fetchDesigns(entityId?: string): Promise<Design[]> {
  let designIds: string[] | null = null;
  if (entityId) {
    const linkRes = await t("design_athletes").select("design_id").eq("athlete_id", entityId);
    designIds = ((linkRes.data ?? []) as unknown as Row[]).map((r) => String(r.design_id));
    if (designIds.length === 0) return [];
  }

  let q = t("designs").select("id, title, status, primary_athlete_id, created_at").order("created_at", { ascending: false });
  if (designIds) q = (q as never as { in: (c: string, v: string[]) => typeof q }).in("id", designIds);
  const designsRes = await q.limit(400);

  const ids = ((designsRes.data ?? []) as unknown as Row[]).map((d) => String(d.id));
  const filesRes = ids.length
    ? await t("design_files")
        .select("design_id, storage_bucket, storage_path, file_type, is_primary, sort_order")
        .in("design_id", ids)
    : { data: [] };

  const fileFor = new Map<string, Row>();
  const exportSet = new Set<string>();
  for (const f of (filesRes.data ?? []) as unknown as Row[]) {
    const key = String(f.design_id);
    if (f.file_type === "export") exportSet.add(key);
    const cur = fileFor.get(key);
    if (!cur || (f.is_primary === true && cur.is_primary !== true)) fileFor.set(key, f);
  }

  return ((designsRes.data ?? []) as unknown as Row[]).map((d) => {
    const f = fileFor.get(String(d.id));
    return {
      id: String(d.id),
      title: String(d.title ?? ""),
      status: String(d.status ?? ""),
      entityId: str(d.primary_athlete_id),
      fileBucket: f ? str(f.storage_bucket) : null,
      filePath: f ? str(f.storage_path) : null,
      fileType: f ? str(f.file_type) : null,
      productionReady: exportSet.has(String(d.id)),
      ...CLIENT_HIDDEN,
      createdAt: String(d.created_at ?? ""),
    };
  });
}

export function useDesigns(entityId?: string) {
  return useQuery({
    queryKey: ["v2", "designs", entityId ?? "all"],
    queryFn: () => fetchDesigns(entityId),
    staleTime: 60_000,
  });
}

/* ---------------------------------------------------------------- concepts */

async function fetchConcepts(entityId?: string): Promise<ProductConcept[]> {
  let q = t("mockups")
    .select(
      "id, title, athlete_id, collection_id, design_id, blank_id, v2_blank_id, product_id, color_name, surface, zone_id, placement_label, approval_state, image_url, storage_bucket, storage_path, description, created_at, kind",
    )
    .eq("kind", "concept")
    .order("created_at", { ascending: false });
  if (entityId) q = (q as never as { eq: (c: string, v: string) => typeof q }).eq("athlete_id", entityId);
  const res = await q.limit(300);
  return ((res.data ?? []) as unknown as Row[]).map(mapConcept);
}

export function useConcepts(entityId?: string) {
  return useQuery({
    queryKey: ["v2", "concepts", entityId ?? "all"],
    queryFn: () => fetchConcepts(entityId),
    staleTime: 15_000,
  });
}

/**
 * The live `print_zones` rows, merged over the built-in presets.
 *
 * Print zones are org-scoped shared infrastructure — the same seven rectangles
 * V1's print-zone editor maintains. V2 reads them rather than keeping a second
 * copy, so a zone corrected in V1 is corrected here.
 */
export function usePrintZones() {
  return useQuery({
    queryKey: ["v2", "print-zones"],
    queryFn: async () => {
      const res = await t("print_zones")
        .select("garment_category, surface, zone_id, label, x, y, w, h")
        .order("sort_order", { ascending: true });
      return mergeZones((res.data ?? []) as unknown as PrintZoneRow[]);
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Create the mockup and its placements together.
 *
 * Placements are written second because they need the mockup's id. If that
 * second write fails the mockup is deleted rather than left behind: a concept
 * whose artwork has no position is not a lesser version of what the operator
 * asked for, it is a broken record they would have to find and clean up.
 */
export function useCreateMockup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, placements }: { draft: ConceptDraft; placements: PlacementRow[] }) => {
      const { data, error } = await t("mockups").insert(draftToRow(draft) as never).select("id").single();
      if (error) throw error;
      const mockupId = String((data as unknown as Row).id);

      if (placements.length > 0) {
        const rows = placements.map((p) => ({ ...p, mockup_id: mockupId, v2_blank_id: draft.blankId ?? null, color_name: draft.colorName ?? null }));
        const placed = await t("product_print_placements").insert(rows as never);
        if (placed.error) {
          await t("mockups").delete().eq("id", mockupId);
          throw placed.error;
        }
      }
      return mockupId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "concepts"] });
      void qc.invalidateQueries({ queryKey: ["v2", "workspace"] });
      void qc.invalidateQueries({ queryKey: ["v2", "entities"] });
      void qc.invalidateQueries({ queryKey: ["v2", "overview"] });
      void qc.invalidateQueries({ queryKey: ["v2", "placements"] });
    },
  });
}

/** Placements already saved against a mockup, for reopening one. */
export function useMockupPlacements(mockupId: string | undefined) {
  return useQuery({
    queryKey: ["v2", "placements", mockupId],
    enabled: Boolean(mockupId),
    queryFn: async () => {
      const res = await t("product_print_placements")
        .select("design_id, surface, zone_id, zone_label, x_pct, y_pct, w_pct, h_pct, rotation_deg, sort_order")
        .eq("mockup_id", mockupId as string);
      return fromRows((res.data ?? []) as unknown as PlacementRow[]);
    },
  });
}

/* ------------------------------------------------------------ production */

export interface ProductionPlacement {
  /** The placement row id — needed to edit its spec. */
  id: string;
  designId: string | null;
  designTitle: string;
  surface: string;
  sortOrder: number;
  /** Percentage of the garment box. Preview geometry, not a print size. */
  widthPct: number;
  printWidthIn: number | null;
  printHeightIn: number | null;
  notes: string | null;
  /**
   * The production artwork for this design: an `export` file in `design-files`.
   * Null means the design is concept art and has nothing press-ready.
   */
  productionFile: { name: string; bucket: string; path: string } | null;
}

/**
 * What a printer would need to know about this mockup.
 *
 * Answers "which PNGs did we actually select" by walking the placements to
 * their designs and then to the `export` file that is the production asset.
 * A design with no export is shown as such rather than omitted — the gap is
 * the point, because that is the mockup that cannot go to print yet.
 */
export function useMockupProduction(mockupId: string | undefined) {
  return useQuery({
    queryKey: ["v2", "mockup-production", mockupId],
    enabled: Boolean(mockupId),
    queryFn: async (): Promise<ProductionPlacement[]> => {
      const placeRes = await t("product_print_placements")
        .select("id, design_id, surface, sort_order, w_pct, print_width_in, print_height_in, notes")
        .eq("mockup_id", mockupId as string)
        .order("sort_order", { ascending: true });

      const rows = (placeRes.data ?? []) as unknown as Row[];
      const designIds = [...new Set(rows.map((r) => str(r.design_id)).filter(Boolean))] as string[];
      if (designIds.length === 0) return [];

      const [designRes, fileRes] = await Promise.all([
        t("designs").select("id, title").in("id", designIds),
        t("design_files")
          .select("design_id, file_name, storage_bucket, storage_path, file_type")
          .in("design_id", designIds),
      ]);

      const titles = new Map(
        ((designRes.data ?? []) as unknown as Row[]).map((d) => [String(d.id), String(d.title ?? "Untitled")]),
      );
      const exports = new Map<string, { name: string; bucket: string; path: string }>();
      for (const f of ((fileRes.data ?? []) as unknown as Row[])) {
        if (f.file_type !== "export") continue;
        const key = String(f.design_id);
        if (exports.has(key)) continue;
        exports.set(key, {
          name: String(f.file_name ?? "artwork"),
          bucket: String(f.storage_bucket),
          path: String(f.storage_path),
        });
      }

      return rows.map((r) => ({
        id: String(r.id),
        designId: str(r.design_id),
        designTitle: r.design_id ? (titles.get(String(r.design_id)) ?? "Untitled") : "No design",
        surface: String(r.surface ?? "front"),
        sortOrder: Number(r.sort_order ?? 0),
        widthPct: Number(r.w_pct ?? 0),
        printWidthIn: r.print_width_in == null ? null : Number(r.print_width_in),
        printHeightIn: r.print_height_in == null ? null : Number(r.print_height_in),
        notes: str(r.notes),
        productionFile: r.design_id ? (exports.get(String(r.design_id)) ?? null) : null,
      }));
    },
  });
}

/** Edit one placement's production spec. Geometry is untouched. */
export function useUpdatePlacementSpec(mockupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      placementId: string;
      printWidthIn?: number | null;
      printHeightIn?: number | null;
      notes?: string | null;
    }) => {
      const patch: Row = {};
      if (input.printWidthIn !== undefined) patch.print_width_in = input.printWidthIn;
      if (input.printHeightIn !== undefined) patch.print_height_in = input.printHeightIn;
      if (input.notes !== undefined) patch.notes = input.notes;
      const res = await t("product_print_placements").update(patch as never).eq("id", input.placementId);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "mockup-production", mockupId] });
    },
  });
}

/* --------------------------------------------- lookbooks, bulk, pricing */

/**
 * Lookbooks are collections, not a new object.
 *
 * `collections` was already the grouping object, already Shopify-independent
 * and already entity-scoped. A lookbook is one more collection_type, so adding
 * a mockup to one is a write to the mockup's existing collection_id.
 */
export function useLookbooks(entityId: string | undefined) {
  return useQuery({
    queryKey: ["v2", "lookbooks", entityId],
    enabled: Boolean(entityId),
    queryFn: async () => {
      const res = await t("collections")
        .select("id, name, collection_type")
        .eq("athlete_id", entityId as string)
        .order("name", { ascending: true });
      return ((res.data ?? []) as unknown as Row[]).map((c) => ({
        id: String(c.id),
        name: String(c.name ?? "Untitled"),
        type: String(c.collection_type ?? "other"),
      }));
    },
  });
}

export function useCreateLookbook(entityId: string, organizationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await t("collections")
        .insert({
          organization_id: organizationId,
          athlete_id: entityId,
          name: name.trim(),
          slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`,
          status: "draft",
          collection_type: "lookbook",
        } as never)
        .select("id")
        .single();
      if (res.error) throw res.error;
      return String((res.data as unknown as Row).id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "lookbooks", entityId] });
      void qc.invalidateQueries({ queryKey: ["v2", "collections"] });
    },
  });
}

/**
 * The live volume discount ladder.
 *
 * Read from `volume_discount_breaks` rather than hard-coded, so changing the
 * business terms is a row edit instead of a deploy.
 */
export function useDiscountBreaks() {
  return useQuery({
    queryKey: ["v2", "discount-breaks"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const res = await t("volume_discount_breaks").select("min_qty, discount_pct");
      return ((res.data ?? []) as unknown as Row[])
        .map((b) => ({ minQty: Number(b.min_qty), discountPct: Number(b.discount_pct) }))
        .filter((b) => Number.isFinite(b.minQty) && Number.isFinite(b.discountPct))
        .sort((a, b) => a.minQty - b.minQty);
    },
  });
}

/**
 * Raise a bulk order from a mockup.
 *
 * Writes to `bulk_order_requests` / `bulk_order_items`, which already exist,
 * already hold 10 live orders and already carry the wholesale/retail/savings
 * model — this is a new door into a working system, not a new system. Items
 * carry mockup_id so an order can always be traced back to what was ordered.
 */
export function useCreateBulkOrder(entityId: string, organizationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      mockupId: string;
      mockupTitle: string;
      blankId: string | null;
      colorName: string | null;
      lines: Array<{ size: string; quantity: number }>;
      unitWholesale: number;
      unitRetail: number;
      subtotal: number;
      retailEquivalent: number;
      savings: number;
      notes: string | null;
    }) => {
      const lines = input.lines.filter((l) => l.quantity > 0);
      if (lines.length === 0) throw new Error("Add at least one size");

      const req = await t("bulk_order_requests")
        .insert({
          organization_id: organizationId,
          athlete_id: entityId,
          total_units: lines.reduce((n, l) => n + l.quantity, 0),
          priority: "normal",
          payment_method: "invoice",
          channel: "admin-v2",
          wholesale_subtotal: input.subtotal,
          retail_equivalent: input.retailEquivalent,
          total_savings: input.savings,
          credit_applied: 0,
          amount_due: input.subtotal,
          notes: input.notes,
        } as never)
        .select("id")
        .single();
      if (req.error) throw req.error;
      const orderId = String((req.data as unknown as Row).id);

      const items = lines.map((l) => ({
        order_request_id: orderId,
        mockup_id: input.mockupId,
        // V2 blanks live in v2_blanks; mockups.blank_id's foreign key points at
        // the legacy `blanks` table and would reject every one of these.
        v2_blank_id: input.blankId,
        product_name_snapshot: input.mockupTitle,
        size: l.size,
        color: input.colorName,
        quantity: l.quantity,
        unit_wholesale_price: input.unitWholesale,
        unit_retail_price: input.unitRetail,
        line_subtotal: Math.round(input.unitWholesale * l.quantity * 100) / 100,
      }));
      const ins = await t("bulk_order_items").insert(items as never);
      if (ins.error) {
        // A request with no lines is not a smaller order, it is a broken record.
        await t("bulk_order_requests").delete().eq("id", orderId);
        throw ins.error;
      }
      return orderId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "orders"] });
    },
  });
}

/* ------------------------------------------------------- mockup library */

/**
 * Everything needed to reopen a saved mockup and reproduce it exactly.
 *
 * The acceptance test for this whole phase is: create, leave, come back
 * tomorrow, open, and the composition is identical. That means the arrangement
 * has to be read back from the database rather than reconstructed from
 * defaults, which is why placements and guides are fetched here rather than
 * re-derived.
 */
export function useMockupForEdit(mockupId: string | undefined) {
  return useQuery({
    queryKey: ["v2", "mockup-edit", mockupId],
    enabled: Boolean(mockupId),
    queryFn: async () => {
      const [mockupRes, placeRes] = await Promise.all([
        t("mockups")
          .select(
            "id, title, athlete_id, organization_id, blank_id, v2_blank_id, color_name, collection_id, description, guides, design_id",
          )
          .eq("id", mockupId as string)
          .single(),
        t("product_print_placements")
          .select("design_id, surface, zone_id, zone_label, x_pct, y_pct, w_pct, h_pct, rotation_deg, sort_order")
          .eq("mockup_id", mockupId as string),
      ]);
      if (mockupRes.error) throw mockupRes.error;
      const row = mockupRes.data as unknown as Row;
      return {
        id: String(row.id),
        title: String(row.title ?? ""),
        blankId: str(row.v2_blank_id) ?? str(row.blank_id),
        colorName: str(row.color_name),
        collectionId: str(row.collection_id),
        notes: str(row.description),
        designId: str(row.design_id),
        guides: (row.guides as Record<string, { x: number; y: number }>) ?? {},
        placed: fromRows((placeRes.data ?? []) as unknown as PlacementRow[]),
      };
    },
  });
}

/**
 * Save an edit to an existing mockup.
 *
 * Placements are replaced wholesale rather than diffed: the arrangement is one
 * thing conceptually, a diff would have to reason about identity for objects
 * that have none of their own, and the row count is tiny. Delete-then-insert is
 * the honest representation of "this is the arrangement now".
 */
export function useUpdateMockup(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      mockupId,
      draft,
      placements,
    }: {
      mockupId: string;
      draft: Partial<ConceptDraft> & { guides?: Record<string, { x: number; y: number }> };
      placements: PlacementRow[];
    }) => {
      const patch: Row = {};
      if (draft.title !== undefined) patch.title = draft.title;
      if (draft.blankId !== undefined) patch.v2_blank_id = draft.blankId;
      if (draft.colorName !== undefined) patch.color_name = draft.colorName;
      if (draft.collectionId !== undefined) patch.collection_id = draft.collectionId || null;
      if (draft.notes !== undefined) patch.description = draft.notes;
      if (draft.imageUrl !== undefined) patch.image_url = draft.imageUrl;
      if (draft.designId !== undefined) patch.design_id = draft.designId;
      if (draft.guides !== undefined) patch.guides = draft.guides;
      patch.updated_at = new Date().toISOString();

      const upd = await t("mockups").update(patch as never).eq("id", mockupId);
      if (upd.error) throw upd.error;

      // Production specs survive an arrangement edit.
      //
      // Placements are replaced wholesale (see above), which would otherwise
      // discard the print sizes and press notes an operator typed against them.
      // Those are a different kind of fact from geometry — someone decided them,
      // and moving a logo two percent left should not erase "11 inches wide, one
      // colour". They are matched back by design + surface + position; a
      // placement that genuinely changed identity loses its spec, which is the
      // honest outcome.
      const existing = await t("product_print_placements")
        .select("design_id, surface, sort_order, print_width_in, print_height_in, notes")
        .eq("mockup_id", mockupId);
      const specs = new Map<string, Row>();
      for (const r of ((existing.data ?? []) as unknown as Row[])) {
        if (r.print_width_in == null && r.print_height_in == null && !r.notes) continue;
        specs.set(`${String(r.design_id)}::${String(r.surface)}::${String(r.sort_order)}`, r);
      }

      const del = await t("product_print_placements").delete().eq("mockup_id", mockupId);
      if (del.error) throw del.error;

      if (placements.length > 0) {
        const rows = placements.map((p) => {
          const carried = specs.get(`${p.design_id}::${p.surface}::${p.sort_order}`);
          return {
            ...p,
            mockup_id: mockupId,
            v2_blank_id: draft.blankId ?? null,
            color_name: draft.colorName ?? null,
            print_width_in: carried?.print_width_in ?? null,
            print_height_in: carried?.print_height_in ?? null,
            notes: carried?.notes ?? null,
          };
        });
        const ins = await t("product_print_placements").insert(rows as never);
        if (ins.error) throw ins.error;
      }
      return mockupId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "mockup-library", entityId] });
      void qc.invalidateQueries({ queryKey: ["v2", "mockup-edit"] });
      void qc.invalidateQueries({ queryKey: ["v2", "workspace", entityId] });
      void qc.invalidateQueries({ queryKey: ["v2", "concepts"] });
    },
  });
}

export interface MockupLibrary {
  mockups: Mockup[];
  folders: MockupFolder[];
}

/**
 * Every saved mockup for one entity, with its folders.
 *
 * A mockup is a finished object, so this is a library read rather than a step
 * in a wizard: it returns everything needed to render, search and organise the
 * shelf without opening any of them.
 */
async function fetchMockupLibrary(entityId: string): Promise<MockupLibrary> {
  const [mockupRes, folderRes] = await Promise.all([
    t("mockups")
      .select(
        "id, title, athlete_id, organization_id, blank_id, v2_blank_id, color_name, image_url, storage_bucket, storage_path, folder_id, sort_order, status, lifecycle, approval_state, product_id, collection_id, guides, created_at, updated_at",
      )
      .eq("athlete_id", entityId)
      .eq("kind", "concept")
      .order("sort_order", { ascending: true }),
    t("asset_folders")
      .select("id, name, athlete_id, sort_order")
      .eq("scope", "mockups")
      .eq("athlete_id", entityId)
      .order("sort_order", { ascending: true }),
  ]);

  const rows = (mockupRes.data ?? []) as unknown as Row[];
  const ids = rows.map((r) => String(r.id));
  const blankIds = [...new Set(rows.map((r) => str(r.v2_blank_id) ?? str(r.blank_id)).filter(Boolean))] as string[];

  const [placementRes, blankRes] = await Promise.all([
    ids.length
      ? t("product_print_placements").select("mockup_id, surface").in("mockup_id", ids)
      : Promise.resolve({ data: [] }),
    // LEGACY COMPATIBILITY, NOT A SOURCE OF TRUTH.
    // Mockups made before the V2 catalog reference V1 blank ids, and a card with
    // no garment name is worse than one naming a retired blank. v2_blanks answers
    // first; V1 only fills ids it does not know. Delete the second query — and
    // this comment — once no mockup references a V1 blank.
    blankIds.length
      ? Promise.all([
          t("v2_blanks").select("id, name").in("id", blankIds),
          t("blanks").select("id, name").in("id", blankIds),
        ])
      : Promise.resolve([{ data: [] }, { data: [] }]),
  ]);

  const [v2BlankRes, v1BlankRes] = blankRes as unknown as Array<{ data: unknown }>;
  const blankName = new Map(
    ((v1BlankRes?.data ?? []) as unknown as Row[]).map((b) => [String(b.id), String(b.name ?? "")]),
  );
  for (const b of (v2BlankRes?.data ?? []) as unknown as Row[]) {
    blankName.set(String(b.id), String(b.name ?? ""));
  }

  // Which surfaces a mockup actually uses is a property of its placements, not
  // of the mockup row — a front-only mockup should say so.
  const surfaces = new Map<string, Set<string>>();
  for (const p of (placementRes.data ?? []) as unknown as Row[]) {
    const key = String(p.mockup_id);
    if (!surfaces.has(key)) surfaces.set(key, new Set());
    surfaces.get(key)!.add(p.surface === "back" ? "back" : "front");
  }

  const mockups: Mockup[] = rows.map((r) => {
    const used = surfaces.get(String(r.id)) ?? new Set<string>();
    const ordered: Array<"front" | "back"> = [];
    if (used.has("front")) ordered.push("front");
    if (used.has("back")) ordered.push("back");
    return {
      id: String(r.id),
      title: String(r.title ?? "Untitled mockup"),
      entityId: str(r.athlete_id),
      organizationId: String(r.organization_id),
      blankId: str(r.v2_blank_id) ?? str(r.blank_id),
      blankName: (() => {
        const bid = str(r.v2_blank_id) ?? str(r.blank_id);
        return bid ? (blankName.get(bid) ?? null) : null;
      })(),
      colorName: str(r.color_name),
      imageUrl: str(r.image_url),
      imageBucket: str(r.storage_bucket),
      imagePath: str(r.storage_path),
      folderId: str(r.folder_id),
      sortOrder: Number(r.sort_order ?? 0),
      status: String(r.status ?? "draft"),
      lifecycle: String(r.lifecycle ?? "bin"),
      approvalState: (str(r.approval_state) ?? "none") as Mockup["approvalState"],
      productId: str(r.product_id),
      collectionId: str(r.collection_id),
      guides: (r.guides as Mockup["guides"]) ?? {},
      surfaces: ordered,
      placementCount: used.size,
      createdAt: String(r.created_at ?? ""),
      updatedAt: String(r.updated_at ?? ""),
    };
  });

  const folders: MockupFolder[] = ((folderRes.data ?? []) as unknown as Row[]).map((f) => ({
    id: String(f.id),
    name: String(f.name ?? "Untitled folder"),
    entityId: str(f.athlete_id),
    sortOrder: Number(f.sort_order ?? 0),
    coverMockupId: null,
  }));

  return { mockups, folders };
}

export function useMockupLibrary(entityId: string | undefined) {
  return useQuery({
    queryKey: ["v2", "mockup-library", entityId],
    queryFn: () => fetchMockupLibrary(entityId as string),
    enabled: Boolean(entityId),
    staleTime: 15_000,
  });
}

export type MockupJob =
  | { type: "rename"; mockupId: string; title: string }
  | { type: "delete"; mockupId: string }
  | { type: "duplicate"; mockupId: string }
  | { type: "order"; writes: Array<{ kind: "mockup" | "folder"; id: string; sortOrder: number }> }
  | { type: "create-folder"; name: string; mockupIds: string[]; sortOrder: number }
  | { type: "rename-folder"; folderId: string; name: string }
  | { type: "add-to-folder"; folderId: string; mockupId: string; sortOrder: number }
  | { type: "remove-from-folder"; mockupId: string; sortOrder: number }
  | { type: "ungroup"; folderId: string; mockupIds: string[]; baseSortOrder: number }
  | { type: "set-lifecycle"; mockupIds: string[]; lifecycle: string }
  | { type: "new-folder"; name: string; sortOrder: number }
  | { type: "set-collection"; mockupIds: string[]; collectionId: string | null };

/**
 * Library actions. Folders are organisational only, so every folder operation
 * writes `folder_id` and nothing else about the mockup changes.
 */
export function useMockupActions(entityId: string, organizationId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["v2", "mockup-library", entityId] });
    void qc.invalidateQueries({ queryKey: ["v2", "workspace", entityId] });
    void qc.invalidateQueries({ queryKey: ["v2", "concepts"] });
  };

  return useMutation({
    mutationFn: async (job: MockupJob) => {
      switch (job.type) {
        case "rename":
          await t("mockups").update({ title: job.title } as never).eq("id", job.mockupId);
          return;
        case "delete":
          // Placements cascade with the mockup; the artwork and blank are untouched.
          await t("mockups").delete().eq("id", job.mockupId);
          return;
        case "duplicate": {
          const src = await t("mockups").select("*").eq("id", job.mockupId).single();
          const row = src.data as unknown as Row | null;
          if (!row) throw new Error("That mockup no longer exists");
          const { id: _id, created_at: _c, updated_at: _u, ...rest } = row;
          const copy = await t("mockups")
            .insert({ ...rest, title: `${String(row.title ?? "Mockup")} copy`, product_id: null } as never)
            .select("id")
            .single();
          if (copy.error) throw copy.error;
          const newId = String((copy.data as unknown as Row).id);

          const places = await t("product_print_placements")
            .select("design_id, blank_id, v2_blank_id, color_name, surface, zone_id, zone_label, x_pct, y_pct, w_pct, h_pct, rotation_deg, sort_order")
            .eq("mockup_id", job.mockupId);
          const rows = ((places.data ?? []) as unknown as Row[]).map((p) => ({ ...p, mockup_id: newId }));
          if (rows.length) {
            const ins = await t("product_print_placements").insert(rows as never);
            if (ins.error) {
              await t("mockups").delete().eq("id", newId);
              throw ins.error;
            }
          }
          return;
        }
        case "order":
          await Promise.all(
            job.writes.map((w) =>
              w.kind === "mockup"
                ? t("mockups").update({ sort_order: w.sortOrder } as never).eq("id", w.id)
                : t("asset_folders").update({ sort_order: w.sortOrder } as never).eq("id", w.id),
            ),
          );
          return;
        case "create-folder": {
          const created = await t("asset_folders")
            .insert({
              organization_id: organizationId,
              athlete_id: entityId,
              scope: "mockups",
              name: job.name,
              sort_order: job.sortOrder,
            } as never)
            .select("id")
            .single();
          if (created.error) throw created.error;
          const folderId = String((created.data as unknown as Row).id);
          await Promise.all(
            job.mockupIds.map((id, i) =>
              t("mockups").update({ folder_id: folderId, sort_order: i } as never).eq("id", id),
            ),
          );
          return;
        }
        case "rename-folder":
          await t("asset_folders").update({ name: job.name } as never).eq("id", job.folderId);
          return;
        case "add-to-folder":
          await t("mockups")
            .update({ folder_id: job.folderId, sort_order: job.sortOrder } as never)
            .eq("id", job.mockupId);
          return;
        case "remove-from-folder":
          await t("mockups")
            .update({ folder_id: null, sort_order: job.sortOrder } as never)
            .eq("id", job.mockupId);
          return;
        case "set-lifecycle":
          await Promise.all(
            job.mockupIds.map((id) => t("mockups").update({ lifecycle: job.lifecycle } as never).eq("id", id)),
          );
          return;
        case "new-folder": {
          const made = await t("asset_folders")
            .insert({
              organization_id: organizationId,
              athlete_id: entityId,
              scope: "mockups",
              name: job.name,
              sort_order: job.sortOrder,
            } as never)
            .select("id")
            .single();
          if (made.error) throw made.error;
          return;
        }
        case "set-collection":
          await Promise.all(
            job.mockupIds.map((id) =>
              t("mockups").update({ collection_id: job.collectionId } as never).eq("id", id),
            ),
          );
          return;
        case "ungroup": {
          await Promise.all(
            job.mockupIds.map((id, i) =>
              t("mockups").update({ folder_id: null, sort_order: job.baseSortOrder + i } as never).eq("id", id),
            ),
          );
          await t("asset_folders").delete().eq("id", job.folderId).eq("athlete_id", entityId);
          return;
        }
      }
    },
    onSuccess: refresh,
  });
}

/**
 * Create a run of mockups that share one arrangement.
 *
 * Written one at a time rather than as a single bulk insert because each mockup
 * needs its own id before its placements can be attached. Failures are
 * collected instead of thrown: if the eleventh of twelve fails, the ten that
 * worked are real work the operator should keep, and the caller reports what
 * did not land rather than pretending the whole batch vanished.
 */
export function useCreateMockupBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobs: Array<{ draft: ConceptDraft; placements: PlacementRow[] }>) => {
      const created: string[] = [];
      const failed: string[] = [];

      for (const job of jobs) {
        try {
          const { data, error } = await t("mockups").insert(draftToRow(job.draft) as never).select("id").single();
          if (error) throw error;
          const mockupId = String((data as unknown as Row).id);

          if (job.placements.length > 0) {
            const rows = job.placements.map((p) => ({
              ...p,
              mockup_id: mockupId,
              v2_blank_id: job.draft.blankId ?? null,
              color_name: job.draft.colorName ?? null,
            }));
            const placed = await t("product_print_placements").insert(rows as never);
            if (placed.error) {
              // A mockup whose artwork has no position is not a lesser version
              // of what was asked for — it is a broken record. Roll this one back.
              await t("mockups").delete().eq("id", mockupId);
              throw placed.error;
            }
          }
          created.push(mockupId);
        } catch {
          failed.push(job.draft.title);
        }
      }

      return { created, failed };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "concepts"] });
      void qc.invalidateQueries({ queryKey: ["v2", "workspace"] });
      void qc.invalidateQueries({ queryKey: ["v2", "entities"] });
      void qc.invalidateQueries({ queryKey: ["v2", "overview"] });
      void qc.invalidateQueries({ queryKey: ["v2", "collections"] });
    },
  });
}

/** Create a collection without leaving whatever screen you are on. */
export function useCreateCollection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, entityId, organizationId }: { name: string; entityId: string; organizationId: string }) => {
      const { data, error } = await t("collections")
        .insert({
          organization_id: organizationId,
          athlete_id: entityId,
          name: name.trim(),
          slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`,
          status: "draft",
          collection_type: "athlete",
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      return String((data as unknown as Row).id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "collections"] });
    },
  });
}

/**
 * Upload artwork and make it a real Design.
 *
 * Order matters and is not arbitrary: the storage policy on `design-files`
 * authorises an object by resolving the FIRST folder of its path back to a
 * design row. So the design must exist before its file can be written, and the
 * path must be `<designId>/<filename>`. Uploading first would be rejected.
 *
 * `productionReady` elsewhere in V2 is true only when an `export` file exists,
 * so the file type is the operator's call rather than a guess from the
 * extension — claiming a dropped image is production artwork when it is a
 * screenshot is exactly the conflation V2 exists to undo.
 */
export function useUploadDesign(entityId: string, organizationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, title, productionReady }: { file: File; title: string; productionReady: boolean }) => {
      const name = title.trim() || file.name.replace(/\.[^.]+$/, "") || "Untitled design";

      const { data, error } = await t("designs")
        .insert({
          organization_id: organizationId,
          title: name,
          slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 7)}`,
          status: productionReady ? "production_ready" : "concept",
          primary_athlete_id: entityId,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const designId = String((data as unknown as Row).id);

      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const path = `${designId}/${Date.now()}.${ext}`;

      const up = await supabase.storage.from("design-files").upload(path, file, {
        contentType: file.type || "image/png",
        upsert: false,
      });
      if (up.error) {
        await t("designs").delete().eq("id", designId);
        throw up.error;
      }

      const fileRow = await t("design_files").insert({
        design_id: designId,
        file_type: productionReady ? "export" : "source",
        storage_bucket: "design-files",
        storage_path: path,
        file_name: file.name,
        file_extension: ext,
        file_size_bytes: file.size,
        mime_type: file.type || "image/png",
        is_primary: true,
        sort_order: 0,
        metadata: { uploaded_by: "admin-v2" },
      } as never);
      if (fileRow.error) {
        await t("designs").delete().eq("id", designId);
        throw fileRow.error;
      }

      // Link it to the entity so it appears on their shelf. Client visibility
      // stays at its 'hidden' default — a freshly uploaded file has had no
      // decision made about it.
      await t("design_athletes").insert({ design_id: designId, athlete_id: entityId, sort_order: 0 } as never);

      return { designId, path };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "shelf", entityId] });
      void qc.invalidateQueries({ queryKey: ["v2", "designs"] });
      void qc.invalidateQueries({ queryKey: ["v2", "workspace", entityId] });
    },
  });
}

export function useCreateConcept() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ConceptDraft) => {
      const { data, error } = await t("mockups")
        .insert(draftToRow(draft) as never)
        .select("id")
        .single();
      if (error) throw error;
      return String((data as unknown as Row).id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "concepts"] });
      void qc.invalidateQueries({ queryKey: ["v2", "workspace"] });
      void qc.invalidateQueries({ queryKey: ["v2", "entities"] });
      void qc.invalidateQueries({ queryKey: ["v2", "overview"] });
    },
  });
}

/* -------------------------------------------------------- commerce + orders */

async function fetchProducts(): Promise<Product[]> {
  const [prodRes, imgRes] = await Promise.all([
    t("products")
      .select(
        "id, title, sku, price, status, approval_state, shopify_sync_status, shopify_product_id, shopify_handle, blank_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(300),
    t("product_images").select("product_id, storage_bucket, storage_path, is_primary"),
  ]);

  const imageFor = new Map<string, Row>();
  for (const im of (imgRes.data ?? []) as unknown as Row[]) {
    const key = String(im.product_id);
    const cur = imageFor.get(key);
    if (!cur || (im.is_primary === true && cur.is_primary !== true)) imageFor.set(key, im);
  }

  return ((prodRes.data ?? []) as unknown as Row[]).map((p) => {
    const im = imageFor.get(String(p.id));
    return {
      id: String(p.id),
      title: String(p.title ?? ""),
      sku: str(p.sku),
      price: num(p.price),
      status: String(p.status ?? ""),
      approvalState: String(p.approval_state ?? "none"),
      shopifySyncStatus: String(p.shopify_sync_status ?? "not_synced"),
      shopifyProductId: str(p.shopify_product_id),
      shopifyHandle: str(p.shopify_handle),
      blankId: str(p.blank_id),
      imageUrl: im ? publicUrl(str(im.storage_bucket), str(im.storage_path)) : null,
      createdAt: String(p.created_at ?? ""),
    };
  });
}

export function useProducts() {
  return useQuery({ queryKey: ["v2", "products"], queryFn: fetchProducts, staleTime: 60_000 });
}

async function fetchCollections(): Promise<Collection[]> {
  const [collRes, cpRes, cdRes, conRes] = await Promise.all([
    t("collections").select("id, name, slug, status, collection_type, athlete_id, created_at"),
    t("collection_products").select("collection_id"),
    t("collection_designs").select("collection_id"),
    t("mockups").select("collection_id, kind"),
  ]);

  const tally = (rows: Row[], key = "collection_id") => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const id = str(r[key]);
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  };
  const cp = tally((cpRes.data ?? []) as unknown as Row[]);
  const cd = tally((cdRes.data ?? []) as unknown as Row[]);
  const cn = tally(((conRes.data ?? []) as unknown as Row[]).filter((r) => r.kind === "concept"));

  return ((collRes.data ?? []) as unknown as Row[]).map((c) => ({
    id: String(c.id),
    name: String(c.name ?? ""),
    slug: String(c.slug ?? ""),
    status: String(c.status ?? ""),
    collectionType: String(c.collection_type ?? ""),
    entityId: str(c.athlete_id),
    productCount: cp.get(String(c.id)) ?? 0,
    designCount: cd.get(String(c.id)) ?? 0,
    conceptCount: cn.get(String(c.id)) ?? 0,
    coverImageUrl: null,
    createdAt: String(c.created_at ?? ""),
  }));
}

export function useCollections() {
  return useQuery({ queryKey: ["v2", "collections"], queryFn: fetchCollections, staleTime: 60_000 });
}

async function fetchOrders(): Promise<OrderRow[]> {
  const res = await t("orders")
    .select(
      "id, shopify_order_name, order_date, customer_name, total, financial_status, fulfillment_status, shopify_order_id, attributed_org_id",
    )
    .order("order_date", { ascending: false })
    .limit(60);
  return ((res.data ?? []) as unknown as Row[]).map((o) => ({
    id: String(o.id),
    name: str(o.shopify_order_name),
    orderDate: str(o.order_date),
    customerName: str(o.customer_name),
    total: num(o.total),
    financialStatus: str(o.financial_status),
    fulfillmentStatus: str(o.fulfillment_status),
    shopifyOrderId: str(o.shopify_order_id),
    attributedOrgId: str(o.attributed_org_id),
  }));
}

export function useOrders() {
  return useQuery({ queryKey: ["v2", "orders"], queryFn: fetchOrders, staleTime: 60_000 });
}

/* ---------------------------------------------------------------- overview */

export interface ActionItem {
  id: string;
  count: number;
  label: string;
  detail: string;
  to: string;
  tone: string;
}

async function fetchOverview() {
  const [entities, blanks, concepts, products, orders] = await Promise.all([
    fetchEntities(),
    fetchBlanks(),
    fetchConcepts(),
    fetchProducts(),
    fetchOrders(),
  ]);

  const realEntities = entities.filter((e) => !e.isDemo);
  const activeEntities = realEntities.filter((e) => e.status === "active");

  const awaitingApproval = concepts.filter((c) => c.approvalState === "pending");
  const readyToConfigure = concepts.filter(
    (c) => c.approvalState !== "pending" && !c.productId && c.designId && c.blankId && c.colorName && c.zoneId,
  );
  const readyForShopify = products.filter(
    (p) => p.approvalState === "approved" && !p.shopifyProductId && p.status !== "archived",
  );
  const blanksMissingPrice = blanks.filter((b) => b.missingCost);
  const blanksMissingAssortment = blanks.filter((b) => b.missingAssortment);
  const openOrders = orders.filter((o) => (o.fulfillmentStatus ?? "unfulfilled") !== "fulfilled");

  const actions: ActionItem[] = [
    {
      id: "concept-approval",
      count: awaitingApproval.length,
      label: "Concepts awaiting approval",
      detail: "Sent to the entity, no decision yet",
      to: "/admin-v2/creative?stage=awaiting_approval",
      tone: "var(--ax-amber)",
    },
    {
      id: "concept-configure",
      count: readyToConfigure.length,
      label: "Concepts ready to configure",
      detail: "Design, blank, colour and placement all chosen",
      to: "/admin-v2/creative?stage=specified",
      tone: "var(--ax-blue)",
    },
    {
      id: "shopify",
      count: readyForShopify.length,
      label: "Products ready for Shopify",
      detail: "Approved but never pushed to the store",
      to: "/admin-v2/commerce?filter=ready_for_shopify",
      tone: "var(--ax-violet)",
    },
    {
      id: "blank-cost",
      count: blanksMissingPrice.length,
      label: blanksMissingPrice.length === 1 ? "Blank missing cost" : "Blanks missing cost",
      detail: "Cannot compute margin until cost is set",
      to: "/admin-v2/commerce/blanks?filter=missing_cost",
      tone: "var(--ax-red)",
    },
    {
      id: "blank-assortment",
      count: blanksMissingAssortment.length,
      label: "Blanks in no assortment",
      detail: "Invisible to every audience in the builder",
      to: "/admin-v2/commerce/blanks?filter=missing_assortment",
      tone: "var(--ax-faint)",
    },
    {
      id: "orders",
      count: openOrders.length,
      label: "Orders not fulfilled",
      detail: "Across the most recent 60 orders",
      to: "/admin-v2/orders",
      tone: "var(--ax-blue)",
    },
  ].filter((a) => a.count > 0);

  return {
    actions,
    stats: {
      activeEntities: activeEntities.length,
      concepts: concepts.length,
      liveProducts: products.filter((p) => p.shopifyProductId && p.status === "published").length,
      blanks: blanks.length,
    },
    recentEntities: activeEntities.slice(0, 6),
    recentConcepts: concepts.slice(0, 6),
  };
}

export function useOverview() {
  return useQuery({ queryKey: ["v2", "overview"], queryFn: fetchOverview, staleTime: 30_000 });
}

/* ----------------------------------------------------- design shelf (groups) */

export interface Membership {
  groupId: string | null;
  sortOrder: number;
}

export interface DesignShelfData {
  designs: Design[];
  groups: DesignGroup[];
  membership: Map<string, Membership>;
}

/**
 * Designs for one entity, plus the operator's grouping and ordering.
 *
 * Grouping lives on `design_athletes` (the per-entity link), never on
 * `designs.design_collection_id` — that column is V1's folder assignment and is
 * deliberately left untouched.
 */
async function fetchDesignShelf(entityId: string): Promise<DesignShelfData> {
  const linkRes = await t("design_athletes")
    .select("design_id, group_id, sort_order, client_visibility")
    .eq("athlete_id", entityId);

  const links = (linkRes.data ?? []) as unknown as Row[];
  const designIds = links.map((r) => String(r.design_id));

  const membership = new Map<string, Membership>();
  const visibilityOf = new Map<string, ClientVisibility>();
  for (const r of links) {
    membership.set(String(r.design_id), {
      groupId: str(r.group_id),
      sortOrder: Number(r.sort_order ?? 0),
    });
    // Closed unless the database explicitly says open. A null, a typo or a
    // future enum value must never read as visible.
    visibilityOf.set(String(r.design_id), r.client_visibility === "preview" ? "preview" : "hidden");
  }

  const [designsRes, filesRes, groupsRes] = await Promise.all([
    designIds.length
      ? t("designs").select("id, title, status, primary_athlete_id, created_at").in("id", designIds)
      : Promise.resolve({ data: [] }),
    designIds.length
      ? t("design_files")
          .select("design_id, storage_bucket, storage_path, file_type, is_primary, sort_order")
          .in("design_id", designIds)
      : Promise.resolve({ data: [] }),
    t("design_collections")
      .select("id, name, athlete_id, sort_order, cover_design_id, client_visibility")
      .eq("athlete_id", entityId),
  ]);

  const fileFor = new Map<string, Row>();
  const exportSet = new Set<string>();
  // Renditions are tracked separately from production artwork and deliberately
  // never fall back to it. A design with no preview shows the client nothing —
  // that is the entire point of keeping the two apart.
  const previewFor = new Map<string, string>();
  for (const f of (filesRes.data ?? []) as unknown as Row[]) {
    const key = String(f.design_id);
    if (f.file_type === "export") exportSet.add(key);
    if (f.file_type === "preview") {
      if (f.storage_bucket === PREVIEW_BUCKET) previewFor.set(key, String(f.storage_path));
      continue; // never a candidate for the operator's primary artwork slot
    }
    const cur = fileFor.get(key);
    if (!cur || (f.is_primary === true && cur.is_primary !== true)) fileFor.set(key, f);
  }

  const designs: Design[] = ((designsRes.data ?? []) as unknown as Row[]).map((d) => {
    const f = fileFor.get(String(d.id));
    return {
      id: String(d.id),
      title: String(d.title ?? ""),
      status: String(d.status ?? ""),
      entityId: str(d.primary_athlete_id),
      fileBucket: f ? str(f.storage_bucket) : null,
      filePath: f ? str(f.storage_path) : null,
      fileType: f ? str(f.file_type) : null,
      productionReady: exportSet.has(String(d.id)),
      clientVisibility: visibilityOf.get(String(d.id)) ?? "hidden",
      hasPreview: previewFor.has(String(d.id)),
      previewPath: previewFor.get(String(d.id)) ?? null,
      createdAt: String(d.created_at ?? ""),
    };
  });

  const groups: DesignGroup[] = ((groupsRes.data ?? []) as unknown as Row[]).map((g) => ({
    id: String(g.id),
    name: String(g.name ?? "Untitled group"),
    entityId: str(g.athlete_id),
    sortOrder: Number(g.sort_order ?? 0),
    coverDesignId: str(g.cover_design_id),
    clientVisibility: g.client_visibility === "preview" ? "preview" : "hidden",
  }));

  return { designs, groups, membership };
}

export function useDesignShelf(entityId: string | undefined) {
  return useQuery({
    queryKey: ["v2", "shelf", entityId],
    queryFn: () => fetchDesignShelf(entityId as string),
    enabled: Boolean(entityId),
    staleTime: 15_000,
  });
}

/**
 * Grouping and ordering writes.
 *
 * `design_athletes` has a composite key, so every update is keyed on both
 * design_id and athlete_id. Nothing here touches a `designs` row.
 */
export function useShelfActions(entityId: string, organizationId: string) {
  const qc = useQueryClient();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["v2", "shelf", entityId] });
    void qc.invalidateQueries({ queryKey: ["v2", "workspace", entityId] });
  };

  const setDesignFields = (designId: string, fields: Record<string, unknown>) =>
    t("design_athletes")
      .update(fields as never)
      .eq("design_id", designId)
      .eq("athlete_id", entityId);

  const mutation = useMutation({
    mutationFn: async (job: ShelfJob) => {
      switch (job.type) {
        case "order": {
          await Promise.all(
            job.writes.map((w) =>
              w.kind === "design"
                ? setDesignFields(w.id, { sort_order: w.sortOrder })
                : t("design_collections")
                    .update({ sort_order: w.sortOrder } as never)
                    .eq("id", w.id),
            ),
          );
          return;
        }
        case "create-group": {
          const { data, error } = await t("design_collections")
            .insert({
              organization_id: organizationId,
              athlete_id: entityId,
              name: job.name,
              sort_order: job.sortOrder,
            } as never)
            .select("id")
            .single();
          if (error) throw error;
          const groupId = String((data as unknown as Row).id);
          await Promise.all(
            job.designIds.map((id, i) => setDesignFields(id, { group_id: groupId, sort_order: i })),
          );
          return;
        }
        case "add-to-group": {
          await setDesignFields(job.designId, { group_id: job.groupId, sort_order: job.sortOrder });
          return;
        }
        case "remove-from-group": {
          await setDesignFields(job.designId, { group_id: null, sort_order: job.sortOrder });
          return;
        }
        case "rename-group": {
          await t("design_collections")
            .update({ name: job.name } as never)
            .eq("id", job.groupId);
          return;
        }
        case "set-design-visibility": {
          await Promise.all(
            job.designIds.map((id) => setDesignFields(id, { client_visibility: job.visibility })),
          );
          return;
        }
        case "set-group-visibility": {
          await t("design_collections")
            .update({ client_visibility: job.visibility } as never)
            .eq("id", job.groupId)
            .eq("athlete_id", entityId);
          return;
        }
        case "unlink": {
          await t("design_athletes")
            .delete()
            .eq("design_id", job.designId)
            .eq("athlete_id", entityId);
          return;
        }
        case "relink": {
          await t("design_athletes").insert({
            design_id: job.link.designId,
            athlete_id: job.link.athleteId,
            group_id: job.link.groupId,
            sort_order: job.link.sortOrder,
            client_visibility: job.link.clientVisibility,
          } as never);
          return;
        }
        case "archive": {
          // Archiving is a property of the artwork, so it is global rather than
          // per entity. Restoring puts it back to 'concept' rather than guessing
          // at whatever it was before, since design_status has no history.
          await t("designs")
            .update({ status: job.archived ? "archived" : "concept" } as never)
            .eq("id", job.designId);
          return;
        }
        case "ungroup": {
          await Promise.all(
            job.designIds.map((id, i) =>
              setDesignFields(id, { group_id: null, sort_order: job.baseSortOrder + i }),
            ),
          );
          // Only remove the container if V1 is not using it as a design folder.
          const stillUsed = await t("designs").select("id").eq("design_collection_id", job.groupId).limit(1);
          if (((stillUsed.data ?? []) as unknown as Row[]).length === 0) {
            await t("design_collections").delete().eq("id", job.groupId).eq("athlete_id", entityId);
          }
          return;
        }
      }
    },
    onSuccess: refresh,
  });

  return mutation;
}

/* --------------------------------------------------- mockup -> product */

/**
 * Creates the product, links it to the entity, files it in the concept's
 * collection, and points the concept at the product so the creative lineage
 * survives. Four writes, no new tables, no Shopify call.
 */
export function useCreateProductFromConcept(entityId: string, organizationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: ProductDraft) => {
      const { data, error } = await t("products")
        .insert(draftToProductRow(draft, organizationId) as never)
        .select("id")
        .single();
      if (error) throw error;
      const productId = String((data as unknown as Row).id);

      await t("product_athletes").insert({ product_id: productId, athlete_id: entityId } as never);

      if (draft.collectionId) {
        await t("collection_products").insert({
          collection_id: draft.collectionId,
          product_id: productId,
        } as never);
      }

      // Lineage: the concept now knows what it became.
      await t("mockups")
        .update({ product_id: productId } as never)
        .eq("id", draft.conceptId);

      return productId;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "workspace", entityId] });
      void qc.invalidateQueries({ queryKey: ["v2", "concepts"] });
      void qc.invalidateQueries({ queryKey: ["v2", "products"] });
      void qc.invalidateQueries({ queryKey: ["v2", "entities"] });
      void qc.invalidateQueries({ queryKey: ["v2", "overview"] });
    },
  });
}

export type ShelfJob =
  | { type: "order"; writes: OrderWrite[] }
  | { type: "create-group"; name: string; designIds: string[]; sortOrder: number }
  | { type: "add-to-group"; groupId: string; designId: string; sortOrder: number }
  | { type: "remove-from-group"; designId: string; sortOrder: number }
  | { type: "rename-group"; groupId: string; name: string }
  | { type: "ungroup"; groupId: string; designIds: string[]; baseSortOrder: number }
  /** Client visibility for one or many designs, for THIS entity only. */
  | { type: "set-design-visibility"; designIds: string[]; visibility: ClientVisibility }
  /** Client visibility for a group. Acts as a ceiling over its members. */
  | { type: "set-group-visibility"; groupId: string; visibility: ClientVisibility }
  /** Unlink a design from this entity. The artwork itself is never touched. */
  | { type: "unlink"; designId: string }
  /** Put a previously unlinked design back exactly where it was. */
  | { type: "relink"; link: DesignLinkSnapshot }
  /** designs.status -> 'archived'. Global to the design, not per entity. */
  | { type: "archive"; designId: string; archived: boolean };

/**
 * Everything needed to put an unlinked design back.
 *
 * Unlinking deletes the `design_athletes` row, which carries the design's
 * group, its position and its client visibility — none of which live anywhere
 * else. Without this snapshot, "Undo" would silently return the design to the
 * end of the shelf with its visibility reset, which is a worse outcome than
 * refusing to offer undo at all.
 */
export interface DesignLinkSnapshot {
  designId: string;
  athleteId: string;
  groupId: string | null;
  sortOrder: number;
  clientVisibility: ClientVisibility;
}
