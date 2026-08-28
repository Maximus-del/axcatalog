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
import { draftToRow, type ConceptDraft } from "./concepts";
import type { DesignGroup, OrderWrite } from "./design-groups";
import { draftToProductRow, type ProductDraft } from "./productize";
import type {
  Blank,
  BlankColor,
  Collection,
  Design,
  Entity,
  EntityCounts,
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
        "id, title, athlete_id, collection_id, design_id, blank_id, product_id, color_name, surface, zone_id, placement_label, approval_state, image_url, storage_bucket, storage_path, description, created_at, kind",
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
    blankId: str(m.blank_id),
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

async function fetchBlanks(): Promise<Blank[]> {
  const [blanksRes, colorsRes, sizesRes, itemsRes, assortRes] = await Promise.all([
    t("blanks").select(
      "id, name, brand, supplier, vendor, style_number, sku, garment_type, image_url, blank_cost, cost, price_athlete, price_corporate, price_standard, availability_status",
    ),
    t("blank_colors").select("id, blank_id, color_name, hex_code, image_url, image_url_back, available, sort_order"),
    t("blank_sizes").select("blank_id, size, available, sort_order"),
    t("blank_assortment_items").select("blank_id, assortment_id"),
    t("blank_assortments").select("id, key, name, default_price_tier, is_active"),
  ]);

  const keyById = new Map<string, string>();
  for (const a of (assortRes.data ?? []) as unknown as Row[]) keyById.set(String(a.id), String(a.key));

  const assortByBlank = new Map<string, string[]>();
  for (const i of (itemsRes.data ?? []) as unknown as Row[]) {
    const bid = String(i.blank_id);
    const key = keyById.get(String(i.assortment_id));
    if (!key) continue;
    assortByBlank.set(bid, [...(assortByBlank.get(bid) ?? []), key]);
  }

  const colorsByBlank = new Map<string, BlankColor[]>();
  for (const c of ((colorsRes.data ?? []) as unknown as Row[]).sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  )) {
    const bid = String(c.blank_id);
    colorsByBlank.set(bid, [
      ...(colorsByBlank.get(bid) ?? []),
      {
        id: String(c.id),
        name: String(c.color_name ?? ""),
        hex: str(c.hex_code),
        imageUrl: str(c.image_url),
        imageUrlBack: str(c.image_url_back),
        available: c.available !== false,
      },
    ]);
  }

  const sizesByBlank = new Map<string, string[]>();
  for (const s of ((sizesRes.data ?? []) as unknown as Row[]).sort(
    (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
  )) {
    const bid = String(s.blank_id);
    sizesByBlank.set(bid, [...(sizesByBlank.get(bid) ?? []), String(s.size)]);
  }

  return ((blanksRes.data ?? []) as unknown as Row[]).map((b) => {
    const id = String(b.id);
    const colors = colorsByBlank.get(id) ?? [];
    const cost = num(b.blank_cost) ?? num(b.cost);
    const image = str(b.image_url) ?? colors.find((c) => c.imageUrl)?.imageUrl ?? null;
    const assortments = assortByBlank.get(id) ?? [];
    return {
      id,
      name: String(b.name ?? ""),
      brand: str(b.brand) ?? str(b.supplier) ?? str(b.vendor),
      styleNumber: str(b.style_number),
      sku: str(b.sku),
      garmentType: String(b.garment_type ?? "other"),
      imageUrl: image,
      cost,
      priceAthlete: num(b.price_athlete),
      priceCorporate: num(b.price_corporate),
      priceStandard: num(b.price_standard),
      availability: String(b.availability_status ?? "unknown"),
      colors,
      sizes: sizesByBlank.get(id) ?? [],
      assortments,
      missingCost: cost == null,
      missingPhoto: image == null,
      missingAssortment: assortments.length === 0,
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
      "id, title, athlete_id, collection_id, design_id, blank_id, product_id, color_name, surface, zone_id, placement_label, approval_state, image_url, storage_bucket, storage_path, description, created_at, kind",
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
    .select("design_id, group_id, sort_order")
    .eq("athlete_id", entityId);

  const links = (linkRes.data ?? []) as unknown as Row[];
  const designIds = links.map((r) => String(r.design_id));

  const membership = new Map<string, Membership>();
  for (const r of links) {
    membership.set(String(r.design_id), {
      groupId: str(r.group_id),
      sortOrder: Number(r.sort_order ?? 0),
    });
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
      .select("id, name, athlete_id, sort_order, cover_design_id")
      .eq("athlete_id", entityId),
  ]);

  const fileFor = new Map<string, Row>();
  const exportSet = new Set<string>();
  for (const f of (filesRes.data ?? []) as unknown as Row[]) {
    const key = String(f.design_id);
    if (f.file_type === "export") exportSet.add(key);
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
      createdAt: String(d.created_at ?? ""),
    };
  });

  const groups: DesignGroup[] = ((groupsRes.data ?? []) as unknown as Row[]).map((g) => ({
    id: String(g.id),
    name: String(g.name ?? "Untitled group"),
    entityId: str(g.athlete_id),
    sortOrder: Number(g.sort_order ?? 0),
    coverDesignId: str(g.cover_design_id),
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
  | { type: "ungroup"; groupId: string; designIds: string[]; baseSortOrder: number };
