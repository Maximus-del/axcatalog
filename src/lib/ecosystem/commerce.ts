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
/** Returns the instance id. Re-applying an existing pairing returns the instance
 * that already exists rather than creating a duplicate working copy. */
export async function applyDesignTemplate(organizationId: string, athleteId: string, templateId: string, createdBy: string | null): Promise<string> {
  // `as never` on the table widens the whole result to never, so the shape has
  // to be reasserted here rather than read off the builder.
  const existing = (await supabase
    .from("design_template_applications" as never)
    .select("id")
    .eq("template_id", templateId)
    .eq("athlete_id", athleteId)
    .maybeSingle()) as { data: unknown };
  if (existing.data) return (existing.data as { id: string }).id;

  const tpl = (await supabase.from("design_templates" as never).select("*").eq("id", templateId).single());
  if (tpl.error) throw tpl.error;
  const { data, error } = await supabase.from("design_template_applications" as never).insert({
    organization_id: organizationId,
    template_id: templateId,
    athlete_id: athleteId,
    status: "applied",
    instance: tpl.data as never, // non-destructive editable copy of the template
    created_by: createdBy,
  } as never).select("id").single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
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

// Deterministic, explainable cosine similarity between two attribute vectors.
// reasons = the attributes that contributed most to the match, so every
// recommendation in the UI can say *why* out loud. Shared by template->athlete
// and athlete->template ranking so both directions agree on the same math.
export function matchVectors(
  profile: Record<string, number> | null | undefined,
  attributes: Record<string, number> | null | undefined,
): { score: number; reasons: string[] } {
  const keys = Object.keys(profile ?? {});
  const attrs = (attributes ?? {}) as Record<string, number>;
  if (keys.length === 0) return { score: 0, reasons: [] };
  const mag = Math.sqrt(keys.reduce((s, k) => s + (Number(profile![k]) || 0) ** 2, 0)) || 1;
  let dot = 0;
  const contribs: { k: string; v: number }[] = [];
  for (const k of keys) {
    const c = (Number(profile![k]) || 0) * (Number(attrs[k]) || 0);
    if (c > 0) { dot += c; contribs.push({ k, v: c }); }
  }
  const tmag = Math.sqrt(Object.values(attrs).reduce((s, v) => s + (Number(v) || 0) ** 2, 0)) || 1;
  return {
    score: dot / (mag * tmag),
    reasons: contribs.sort((a, b) => b.v - a.v).slice(0, 4).map((c) => c.k),
  };
}

// Rank templates for one athlete's preference profile (used by Apply flows).
export function recommendDesignTemplates(profile: Record<string, number> | null | undefined, templates: DesignTemplate[]): TemplateMatch[] {
  if (Object.keys(profile ?? {}).length === 0) return templates.map((t) => ({ template: t, score: 0, reasons: [] }));
  return templates
    .map((t) => ({ template: t, ...matchVectors(profile, t.attributes) }))
    .sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────────────
// DESIGN TEMPLATE LIBRARY
// The browsable side of the style system: full template records, how widely
// each is used, the athlete instances it has spawned, and the reverse match
// (which athletes fit THIS template). Global templates (organization_id null)
// are read-only for org operators — they duplicate into their own org to edit.
// ─────────────────────────────────────────────────────────────────────────

export interface DesignTemplateFull extends DesignTemplate {
  organization_id: string | null;
  graphic_characteristics: string | null;
  typography_characteristics: string | null;
  example_products: unknown;
  athlete_examples: unknown;
  notes: string | null;
  source_ref: string | null;
  is_active: boolean;
  created_at: string;
  /** Creative recipe (see lib/ecosystem/creative.ts) — jsonb, parsed by parseRecipe(). */
  collection_recipe: unknown;
  reference_policy: string;
}

const TEMPLATE_COLUMNS =
  "id, organization_id, name, style, description, compatible_product_types, tags, color_tendencies, " +
  "sport_compatibility, attributes, preview_images, example_products, athlete_examples, " +
  "graphic_characteristics, typography_characteristics, notes, source_ref, is_active, created_at, " +
  "collection_recipe, reference_policy";

export async function listDesignTemplatesFull(includeArchived = false): Promise<DesignTemplateFull[]> {
  let q = supabase.from("design_templates" as never).select(TEMPLATE_COLUMNS);
  if (!includeArchived) q = q.eq("is_active", true);
  const { data, error } = await q.order("name");
  if (error) throw error;
  return (data ?? []) as unknown as DesignTemplateFull[];
}

export async function fetchDesignTemplate(id: string): Promise<DesignTemplateFull | null> {
  const { data, error } = await supabase
    .from("design_templates" as never)
    .select(TEMPLATE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as DesignTemplateFull | null;
}

/** Distinct athletes per template — the "used by N athletes" number on cards. */
export async function fetchTemplateUsage(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("design_template_applications" as never)
    .select("template_id, athlete_id");
  if (error) throw error;
  const seen = new Map<string, Set<string>>();
  for (const r of ((data ?? []) as unknown as { template_id: string | null; athlete_id: string }[])) {
    if (!r.template_id) continue;
    if (!seen.has(r.template_id)) seen.set(r.template_id, new Set());
    seen.get(r.template_id)!.add(r.athlete_id);
  }
  const out: Record<string, number> = {};
  seen.forEach((set, k) => { out[k] = set.size; });
  return out;
}

export interface AthleteLite {
  id: string;
  organization_id: string;
  slug: string;
  full_name: string | null;
  first_name: string;
  last_name: string;
  position: string | null;
  league: string | null;
  status: string;
  image_url: string | null;
  is_demo: boolean;
}

type AthleteRaw = Omit<AthleteLite, "image_url" | "is_demo"> & { metadata: Record<string, unknown> | null };

function toAthleteLite(r: AthleteRaw): AthleteLite {
  return {
    id: r.id,
    organization_id: r.organization_id,
    slug: r.slug,
    full_name: r.full_name,
    first_name: r.first_name,
    last_name: r.last_name,
    position: r.position,
    league: r.league,
    status: r.status,
    image_url: (r.metadata?.["avatar_url"] as string) ?? null,
    is_demo: r.metadata?.["demo"] === true,
  };
}

const ATHLETE_COLUMNS = "id, organization_id, slug, full_name, first_name, last_name, position, league, status, metadata";

export interface TemplateApplication {
  id: string;
  template_id: string | null;
  athlete_id: string;
  organization_id: string;
  status: string;
  notes: string | null;
  created_at: string;
  athlete: AthleteLite | null;
}

export async function listTemplateApplications(templateId: string): Promise<TemplateApplication[]> {
  const { data, error } = await supabase
    .from("design_template_applications" as never)
    .select("id, template_id, athlete_id, organization_id, status, notes, created_at")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Omit<TemplateApplication, "athlete">[];
  if (rows.length === 0) return [];
  const { data: ath } = await supabase
    .from("athletes" as never)
    .select(ATHLETE_COLUMNS)
    .in("id", Array.from(new Set(rows.map((r) => r.athlete_id))));
  const byId = new Map<string, AthleteLite>();
  for (const a of ((ath ?? []) as unknown as AthleteRaw[])) byId.set(a.id, toAthleteLite(a));
  return rows.map((r) => ({ ...r, athlete: byId.get(r.athlete_id) ?? null }));
}

export async function setTemplateApplicationStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("design_template_applications" as never)
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function removeTemplateApplication(id: string): Promise<void> {
  const { error } = await supabase.from("design_template_applications" as never).delete().eq("id", id);
  if (error) throw error;
}

/** Active athletes + their preference profiles, for the reverse (template -> athlete) match. */
export async function listAthletesWithProfiles(): Promise<{ athletes: AthleteLite[]; profiles: Record<string, Record<string, number>> }> {
  const [ath, prof] = await Promise.all([
    supabase.from("athletes" as never).select(ATHLETE_COLUMNS).eq("status", "active").order("last_name"),
    supabase.from("preference_profiles" as never).select("subject_id, profile").eq("subject_type", "athlete"),
  ]);
  if (ath.error) throw ath.error;
  const profiles: Record<string, Record<string, number>> = {};
  for (const p of ((prof.data ?? []) as unknown as { subject_id: string; profile: Record<string, number> }[])) {
    profiles[p.subject_id] = p.profile ?? {};
  }
  return { athletes: ((ath.data ?? []) as unknown as AthleteRaw[]).map(toAthleteLite), profiles };
}

export interface AthleteMatch { athlete: AthleteLite; score: number; reasons: string[]; hasProfile: boolean }

/** Which athletes fit this template — same explainable math, run the other way. */
export function rankAthletesForTemplate(
  template: Pick<DesignTemplate, "attributes">,
  athletes: AthleteLite[],
  profiles: Record<string, Record<string, number>>,
): AthleteMatch[] {
  return athletes
    .map((athlete) => {
      const profile = profiles[athlete.id];
      const { score, reasons } = matchVectors(profile, template.attributes);
      return { athlete, score, reasons, hasProfile: !!profile && Object.keys(profile).length > 0 };
    })
    .sort((a, b) => b.score - a.score);
}

export interface DesignTemplateInput {
  organization_id: string;
  name: string;
  style?: string | null;
  description?: string | null;
  tags?: string[];
  color_tendencies?: string[];
  sport_compatibility?: string[];
  compatible_product_types?: string[];
  graphic_characteristics?: string | null;
  typography_characteristics?: string | null;
  attributes?: Record<string, number>;
  /** Creative-recipe fields (see lib/ecosystem/creative.ts). */
  collection_recipe?: Record<string, unknown>;
  reference_policy?: string;
}

export async function createDesignTemplate(input: DesignTemplateInput): Promise<string> {
  const row = {
    organization_id: input.organization_id,
    name: input.name.trim(),
    style: input.style?.trim() || null,
    description: input.description?.trim() || null,
    tags: input.tags ?? [],
    color_tendencies: input.color_tendencies ?? [],
    sport_compatibility: input.sport_compatibility ?? [],
    compatible_product_types: input.compatible_product_types ?? ["athlete_merch"],
    graphic_characteristics: input.graphic_characteristics?.trim() || null,
    typography_characteristics: input.typography_characteristics?.trim() || null,
    attributes: input.attributes ?? {},
    is_active: true,
  };
  const { data, error } = await supabase.from("design_templates" as never).insert(row as never).select("id").single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

export async function updateDesignTemplate(id: string, patch: Partial<DesignTemplateInput>): Promise<void> {
  const { error } = await supabase
    .from("design_templates" as never)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

/** Global templates are read-only to operators — duplicating makes an editable org copy. */
export async function duplicateDesignTemplate(id: string, organizationId: string, name?: string): Promise<string> {
  const tpl = await fetchDesignTemplate(id);
  if (!tpl) throw new Error("Template not found");
  return createDesignTemplate({
    organization_id: organizationId,
    name: name?.trim() || `${tpl.name} (copy)`,
    style: tpl.style,
    description: tpl.description,
    tags: tpl.tags,
    color_tendencies: tpl.color_tendencies,
    sport_compatibility: tpl.sport_compatibility,
    compatible_product_types: tpl.compatible_product_types,
    graphic_characteristics: tpl.graphic_characteristics,
    typography_characteristics: tpl.typography_characteristics,
    attributes: tpl.attributes,
  });
}

export async function setDesignTemplateActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase
    .from("design_templates" as never)
    .update({ is_active, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

/**
 * Cover image for a template — what makes "which one is Heritage again?"
 * answerable at a glance instead of by reading the name. Stored in the existing
 * preview_images array so the plate renderer already knows how to read it.
 */
export async function setTemplateCover(
  templateId: string,
  cover: { url: string; storage_path?: string | null } | null,
): Promise<void> {
  const { error } = await supabase
    .from("design_templates" as never)
    .update({ preview_images: cover ? [cover] : [], updated_at: new Date().toISOString() } as never)
    .eq("id", templateId);
  if (error) throw error;
}

export const TEMPLATE_COVER_BUCKET = "design-references";

export async function uploadTemplateCover(templateId: string, file: File): Promise<{ url: string; storage_path: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `templates/${templateId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(TEMPLATE_COVER_BUCKET).upload(path, file, { upsert: false });
  if (up.error) throw up.error;
  const url = supabase.storage.from(TEMPLATE_COVER_BUCKET).getPublicUrl(path).data.publicUrl;
  return { url, storage_path: path };
}

/** First usable preview image on a template, whatever shape it was stored in. */
export function templatePreviewUrl(t: Pick<DesignTemplateFull, "preview_images">): string | null {
  const raw = t.preview_images;
  const arr = Array.isArray(raw) ? raw : [];
  for (const item of arr) {
    if (typeof item === "string" && item.trim()) return item;
    if (item && typeof item === "object") {
      const url = (item as Record<string, unknown>).url ?? (item as Record<string, unknown>).src;
      if (typeof url === "string" && url.trim()) return url;
    }
  }
  return null;
}

/** Top attributes of a template, sorted — the "signature" shown on cards. */
export function templateSignature(attributes: Record<string, number> | null | undefined, limit = 3): { key: string; value: number }[] {
  return Object.entries(attributes ?? {})
    .map(([key, value]) => ({ key, value: Number(value) || 0 }))
    .filter((a) => a.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}
