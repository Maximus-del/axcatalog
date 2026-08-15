// ─────────────────────────────────────────────────────────────────────────
// COMMERCE domain: Collections (what belongs together) and Drops (when it is
// released) are DISTINCT concepts over the same shared objects. Designs,
// mockups, products, and drops all reference each other — nothing is
// duplicated. Design Templates are reusable STYLE systems; applying one to an
// athlete creates a non-destructive instance. Preference profiles + a
// transparent matcher turn Q&A data into recommendations.
// Components/hooks call these — never Supabase directly.
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "untitled";

// ---- Collections (the permanent creative container) ----
export interface CollectionCard {
  id: string;
  name: string;
  description: string | null;
  status: string;
  collection_type: string;
  hero_url: string | null;
  product_count: number;
  design_count: number;
  drop_count: number;
}

export async function listAthleteCollections(athleteId: string): Promise<CollectionCard[]> {
  const { data: cols, error } = await supabase
    .from("collections" as never)
    .select("id, name, description, status, collection_type, metadata")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (cols ?? []) as unknown as Array<{
    id: string; name: string; description: string | null; status: string;
    collection_type: string; metadata: Record<string, unknown> | null;
  }>;
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [cp, cd, dr] = await Promise.all([
    supabase.from("collection_products" as never).select("collection_id").in("collection_id", ids),
    supabase.from("collection_designs" as never).select("collection_id").in("collection_id", ids),
    supabase.from("drops" as never).select("collection_id").in("collection_id", ids),
  ]);
  const tally = (arr: unknown): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const r of (arr as { collection_id: string }[] | null) ?? []) m[r.collection_id] = (m[r.collection_id] ?? 0) + 1;
    return m;
  };
  const pc = tally(cp.data), dc = tally(cd.data), drc = tally(dr.data);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    collection_type: r.collection_type,
    hero_url: (r.metadata?.["hero_url"] as string) ?? null,
    product_count: pc[r.id] ?? 0,
    design_count: dc[r.id] ?? 0,
    drop_count: drc[r.id] ?? 0,
  }));
}

export interface CreateCollectionInput {
  organization_id: string;
  athlete_id: string;
  name: string;
  description?: string | null;
  collection_type?: string;
}
export async function createCollection(input: CreateCollectionInput): Promise<string> {
  const row = {
    organization_id: input.organization_id,
    athlete_id: input.athlete_id,
    name: input.name.trim(),
    slug: `${slugify(input.name)}-${Math.floor(Math.random() * 1e4)}`,
    description: input.description?.trim() || null,
    collection_type: input.collection_type ?? "athlete",
    status: "active",
  };
  const { data, error } = await supabase.from("collections" as never).insert(row as never).select("id").single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

// Mockups tied to a collection via its designs/products (mockups have no direct FK).
export interface MockupRow {
  id: string; title: string; shot_type: string; status: string;
  storage_bucket: string | null; storage_path: string | null; thumbnail_path: string | null;
  product_id: string | null; design_id: string | null; tags: string[];
}
export async function fetchCollectionMockups(productIds: string[], designIds: string[]): Promise<MockupRow[]> {
  if (productIds.length === 0 && designIds.length === 0) return [];
  const ors: string[] = [];
  if (productIds.length) ors.push(`product_id.in.(${productIds.join(",")})`);
  if (designIds.length) ors.push(`design_id.in.(${designIds.join(",")})`);
  const { data, error } = await supabase
    .from("mockups" as never)
    .select("id, title, shot_type, status, storage_bucket, storage_path, thumbnail_path, product_id, design_id, tags")
    .or(ors.join(","))
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as unknown as MockupRow[];
}

// ---- Drops (the release/campaign event) ----
export interface DropRow {
  id: string;
  organization_id: string;
  athlete_id: string | null;
  collection_id: string | null;
  name: string;
  description: string | null;
  campaign_image_url: string | null;
  status: string;
  access_date: string | null;
  public_date: string | null;
  notify: Record<string, boolean>;
  approval_state: string;
  approval_note: string | null;
  product_count?: number;
}

export async function listAthleteDrops(athleteId: string): Promise<DropRow[]> {
  const { data, error } = await supabase
    .from("drops" as never)
    .select("id, organization_id, athlete_id, collection_id, name, description, campaign_image_url, status, access_date, public_date, notify, approval_state, approval_note, drop_products(product_id)")
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as (DropRow & { drop_products?: unknown[] })[]).map((d) => ({
    ...d,
    product_count: Array.isArray(d.drop_products) ? d.drop_products.length : 0,
  }));
}

export interface CreateDropInput {
  organization_id: string;
  athlete_id: string;
  collection_id: string | null;
  name: string;
  description?: string | null;
  campaign_image_url?: string | null;
  access_date?: string | null;
  public_date?: string | null;
  notify?: Record<string, boolean>;
  created_by?: string | null;
}
export async function createDrop(input: CreateDropInput, productIds: string[]): Promise<string> {
  const row = {
    organization_id: input.organization_id,
    athlete_id: input.athlete_id,
    collection_id: input.collection_id,
    name: input.name.trim(),
    slug: `${slugify(input.name)}-${Math.floor(Math.random() * 1e4)}`,
    description: input.description?.trim() || null,
    campaign_image_url: input.campaign_image_url?.trim() || null,
    access_date: input.access_date ?? null,
    public_date: input.public_date ?? null,
    notify: input.notify ?? { access: true, vip: true, followers: true },
    status: "draft",
    created_by: input.created_by ?? null,
  };
  const { data, error } = await supabase.from("drops" as never).insert(row as never).select("id").single();
  if (error) throw error;
  const dropId = (data as unknown as { id: string }).id;
  if (productIds.length) await setDropProducts(dropId, productIds);
  return dropId;
}
export async function setDropProducts(dropId: string, productIds: string[]): Promise<void> {
  const del = await supabase.from("drop_products" as never).delete().eq("drop_id", dropId);
  if (del.error) throw del.error;
  if (productIds.length === 0) return;
  const rows = productIds.map((product_id, i) => ({ drop_id: dropId, product_id, sort_order: i }));
  const { error } = await supabase.from("drop_products" as never).insert(rows as never);
  if (error) throw error;
}
export async function scheduleDrop(id: string, dates: { access_date: string | null; public_date: string | null }): Promise<void> {
  const { error } = await supabase.from("drops" as never)
    .update({ ...dates, status: "scheduled" } as never).eq("id", id);
  if (error) throw error;
}
export async function sendDropForApproval(id: string): Promise<void> {
  const { error } = await supabase.from("drops" as never).update({ approval_state: "pending" } as never).eq("id", id);
  if (error) throw error;
}
export async function listCollectionDrops(collectionId: string): Promise<DropRow[]> {
  const { data, error } = await supabase
    .from("drops" as never)
    .select("id, organization_id, athlete_id, collection_id, name, description, campaign_image_url, status, access_date, public_date, notify, approval_state, approval_note, drop_products(product_id)")
    .eq("collection_id", collectionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as (DropRow & { drop_products?: unknown[] })[]).map((d) => ({
    ...d,
    product_count: Array.isArray(d.drop_products) ? d.drop_products.length : 0,
  }));
}
export async function fetchDropProductIds(dropId: string): Promise<string[]> {
  const { data, error } = await supabase.from("drop_products" as never).select("product_id").eq("drop_id", dropId);
  if (error) throw error;
  return ((data ?? []) as unknown as { product_id: string }[]).map((r) => r.product_id);
}

// Products available to put into a drop: prefer the collection's products, else all the athlete's.
export interface SelectableProduct { id: string; title: string; status: string }
export async function listCollectionProducts(collectionId: string): Promise<SelectableProduct[]> {
  const { data, error } = await supabase
    .from("collection_products" as never)
    .select("product:products!collection_products_product_id_fkey(id, title, status)")
    .eq("collection_id", collectionId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as { product: SelectableProduct | SelectableProduct[] | null }[])
    .map((r) => (Array.isArray(r.product) ? r.product[0] : r.product))
    .filter((p): p is SelectableProduct => !!p);
}
export async function listAthleteSelectableProducts(athleteId: string): Promise<SelectableProduct[]> {
  const { data, error } = await supabase
    .from("products" as never)
    .select("id, title, status, product_athletes!inner(athlete_id)")
    .eq("product_athletes.athlete_id", athleteId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as SelectableProduct[]);
}

// ---- Design Templates (reusable STYLE systems) ----
export interface DesignTemplate {
  id: string;
  name: string;
  style: string | null;
  description: string | null;
  compatible_product_types: string[];
  tags: string[];
  color_tendencies: string[];
  sport_compatibility: string[];
  attributes: Record<string, number>;
  preview_images: unknown;
}
export async function listDesignTemplates(): Promise<DesignTemplate[]> {
  const { data, error } = await supabase
    .from("design_templates" as never)
    .select("id, name, style, description, compatible_product_types, tags, color_tendencies, sport_compatibility, attributes, preview_images")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as DesignTemplate[];
}
export async function applyDesignTemplate(organizationId: string, athleteId: string, templateId: string, createdBy: string | null): Promise<void> {
  const tpl = (await supabase.from("design_templates" as never).select("*").eq("id", templateId).single());
  if (tpl.error) throw tpl.error;
  const { error } = await supabase.from("design_template_applications" as never).insert({
    organization_id: organizationId,
    template_id: templateId,
    athlete_id: athleteId,
    status: "applied",
    instance: tpl.data as never, // non-destructive editable copy of the template
    created_by: createdBy,
  } as never);
  if (error) throw error;
}

// ---- Preference profile (derived from Q&A) + transparent recommendation ----
export interface PreferenceProfile { subject_type: string; subject_id: string; profile: Record<string, number> }
export async function fetchPreferenceProfile(subjectType: "athlete" | "fan", subjectId: string): Promise<PreferenceProfile | null> {
  const { data, error } = await supabase
    .from("preference_profiles" as never)
    .select("subject_type, subject_id, profile")
    .eq("subject_type", subjectType).eq("subject_id", subjectId).maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as PreferenceProfile | null;
}

export interface TemplateMatch { template: DesignTemplate; score: number; reasons: string[] }
// Deterministic, explainable cosine similarity between a preference profile and
// each template's attribute vector. reasons = the attributes that drove the match.
export function recommendDesignTemplates(profile: Record<string, number> | null | undefined, templates: DesignTemplate[]): TemplateMatch[] {
  const keys = Object.keys(profile ?? {});
  if (keys.length === 0) return templates.map((t) => ({ template: t, score: 0, reasons: [] }));
  const mag = Math.sqrt(keys.reduce((s, k) => s + (Number(profile![k]) || 0) ** 2, 0)) || 1;
  return templates
    .map((t) => {
      const attrs = (t.attributes ?? {}) as Record<string, number>;
      let dot = 0;
      const contribs: { k: string; v: number }[] = [];
      for (const k of keys) {
        const c = (Number(profile![k]) || 0) * (Number(attrs[k]) || 0);
        if (c > 0) { dot += c; contribs.push({ k, v: c }); }
      }
      const tmag = Math.sqrt(Object.values(attrs).reduce((s, v) => s + (Number(v) || 0) ** 2, 0)) || 1;
      const score = dot / (mag * tmag);
      const reasons = contribs.sort((a, b) => b.v - a.v).slice(0, 4).map((c) => c.k);
      return { template: t, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}
