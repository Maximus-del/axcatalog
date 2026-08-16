// Board operations for an entity's merch workspace: ordering, and promoting a
// mockup into a product concept.
import { supabase } from "@/integrations/supabase/client";

/**
 * Persist board order. Written to product_athletes, not products, because the
 * position belongs to this entity's board — the same product on another
 * athlete's board keeps its own place.
 */
export async function saveConceptOrder(athleteId: string, productIdsInOrder: string[]): Promise<void> {
  await Promise.all(
    productIdsInOrder.map((product_id, i) =>
      supabase
        .from("product_athletes" as never)
        .update({ sort_order: i } as never)
        .eq("athlete_id", athleteId)
        .eq("product_id", product_id),
    ),
  );
}

export async function saveMockupOrder(mockupIdsInOrder: string[]): Promise<void> {
  await Promise.all(
    mockupIdsInOrder.map((id, i) =>
      supabase.from("mockups" as never).update({ sort_order: i } as never).eq("id", id),
    ),
  );
}

export async function saveInspirationOrder(ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id, i) =>
      supabase.from("inspiration_images" as never).update({ sort_order: i } as never).eq("id", id),
    ),
  );
}

/**
 * Promote a mockup to a product concept.
 *
 * The mockup's file is copied into the product's own image so the concept can
 * live in a public bucket and travel to collections, approval and eventually
 * Shopify — but the original mockup is deliberately left in place. Creative
 * history is not something to consume.
 */
export async function promoteMockupToConcept(input: {
  organization_id: string;
  athlete_id: string;
  mockup: { id: string; title: string; storage_bucket: string | null; storage_path: string | null };
  collection_id?: string | null;
  team_id_at_release?: string | null;
}): Promise<string> {
  const { mockup } = input;
  if (!mockup.storage_path) throw new Error("That mockup has no image file");

  const download = await supabase.storage
    .from(mockup.storage_bucket || "mockups")
    .download(mockup.storage_path);
  if (download.error) throw download.error;

  const { createAthleteProduct } = await import("@/lib/ecosystem/merch");
  const productId = await createAthleteProduct({
    organization_id: input.organization_id,
    athlete_id: input.athlete_id,
    title: mockup.title || "Concept",
    collection_id: input.collection_id ?? null,
    team_id_at_release: input.team_id_at_release ?? null,
  });

  try {
    const ext = mockup.storage_path.split(".").pop()?.toLowerCase() || "png";
    const path = `${productId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("product-images").upload(path, download.data);
    if (up.error) throw up.error;
    const linked = await supabase.from("product_images" as never).insert({
      product_id: productId,
      storage_bucket: "product-images",
      storage_path: path,
      sort_order: 0,
    } as never);
    if (linked.error) throw linked.error;
  } catch (e) {
    await supabase.from("products" as never).delete().eq("id", productId);
    throw e;
  }

  // Remember where it came from, so the lineage survives.
  await supabase
    .from("mockups" as never)
    .update({ product_id: productId } as never)
    .eq("id", mockup.id);

  return productId;
}

export interface InspirationImage {
  id: string;
  title: string | null;
  notes: string | null;
  source_url: string | null;
  url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  sort_order: number;
}

export async function listInspiration(athleteId: string): Promise<InspirationImage[]> {
  const { data, error } = await supabase
    .from("inspiration_images" as never)
    .select("id, title, notes, source_url, url, storage_bucket, storage_path, sort_order")
    .eq("athlete_id", athleteId)
    .order("sort_order")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as InspirationImage[];
}

export const INSPIRATION_BUCKET = "design-references";

export async function addInspirationFile(input: {
  organization_id: string;
  athlete_id: string;
  file: File;
  title?: string;
  sort_order?: number;
}): Promise<void> {
  const ext = input.file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `inspiration/${input.athlete_id}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(INSPIRATION_BUCKET).upload(path, input.file);
  if (up.error) throw up.error;
  const { error } = await supabase.from("inspiration_images" as never).insert({
    organization_id: input.organization_id,
    athlete_id: input.athlete_id,
    title: input.title ?? input.file.name.replace(/\.[^.]+$/, ""),
    storage_bucket: INSPIRATION_BUCKET,
    storage_path: path,
    sort_order: input.sort_order ?? 0,
  } as never);
  if (error) throw error;
}

export async function addInspirationUrl(input: {
  organization_id: string;
  athlete_id: string;
  url: string;
  title?: string | null;
  source_url?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("inspiration_images" as never).insert({
    organization_id: input.organization_id,
    athlete_id: input.athlete_id,
    url: input.url.trim(),
    source_url: input.source_url ?? null,
    title: input.title ?? null,
  } as never);
  if (error) throw error;
}

export async function removeInspiration(id: string): Promise<void> {
  const { error } = await supabase.from("inspiration_images" as never).delete().eq("id", id);
  if (error) throw error;
}

export function inspirationUrl(img: InspirationImage): string | null {
  if (img.url) return img.url;
  if (img.storage_path) {
    return supabase.storage
      .from(img.storage_bucket || INSPIRATION_BUCKET)
      .getPublicUrl(img.storage_path).data.publicUrl;
  }
  return null;
}
