// Apply a set of tag additions / removals to a list of products. Handles
// athlete:/team:/collection: prefixed tags by writing to the join tables, and
// freeform tags via the tags table. Also pushes tag changes to Shopify via
// the shopify-update-product-tags edge function.

import { supabase } from "@/integrations/supabase/client";
import { parseTag } from "./parse-tag";
import { slugify } from "./slug";

export interface ApplyResult {
  succeeded: string[];
  failed: Array<{ productId: string; error: string }>;
}

interface Args {
  productIds: string[];
  addTags: string[];
  removeTags?: string[];
  /** Optional callback after each product completes (for progress UI). */
  onProgress?: (done: number, total: number) => void;
}

export async function applyTagsToProducts({
  productIds,
  addTags,
  removeTags = [],
  onProgress,
}: Args): Promise<ApplyResult> {
  const succeeded: string[] = [];
  const failed: Array<{ productId: string; error: string }> = [];

  if (productIds.length === 0) return { succeeded, failed };

  const adds = addTags.map(parseTag).filter((t): t is NonNullable<typeof t> => !!t);
  const removes = removeTags.map(parseTag).filter((t): t is NonNullable<typeof t> => !!t);

  // Resolve org id once (for tags table inserts).
  const { data: prof } = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  const orgId = prof?.organization_id;
  if (!orgId) {
    productIds.forEach((id) => failed.push({ productId: id, error: "no org" }));
    return { succeeded, failed };
  }

  // Resolve athlete/team/collection slugs to ids (across all add+remove tags).
  const athleteSlugs = Array.from(
    new Set([...adds, ...removes].filter((t) => t.kind === "athlete").map((t: any) => t.slug)),
  );
  const teamSlugs = Array.from(
    new Set([...adds, ...removes].filter((t) => t.kind === "team").map((t: any) => t.slug)),
  );
  const collectionSlugs = Array.from(
    new Set([...adds, ...removes].filter((t) => t.kind === "collection").map((t: any) => t.slug)),
  );

  const [athletesRes, teamsRes, collectionsRes] = await Promise.all([
    athleteSlugs.length > 0
      ? supabase.from("athletes").select("id, slug").in("slug", athleteSlugs)
      : Promise.resolve({ data: [] as Array<{ id: string; slug: string }> }),
    teamSlugs.length > 0
      ? supabase.from("teams").select("id, slug").in("slug", teamSlugs)
      : Promise.resolve({ data: [] as Array<{ id: string; slug: string }> }),
    collectionSlugs.length > 0
      ? supabase.from("collections").select("id, slug").in("slug", collectionSlugs)
      : Promise.resolve({ data: [] as Array<{ id: string; slug: string }> }),
  ]);

  const athleteIdBySlug = new Map((athletesRes.data ?? []).map((a) => [a.slug, a.id]));
  const teamIdBySlug = new Map((teamsRes.data ?? []).map((t) => [t.slug, t.id]));
  const collectionIdBySlug = new Map((collectionsRes.data ?? []).map((c) => [c.slug, c.id]));

  // Resolve / create freeform tag rows up front.
  const freeformAdd = adds.filter((t) => t.kind === "freeform") as Array<{
    kind: "freeform";
    name: string;
    raw: string;
  }>;
  const freeformAddNames = Array.from(new Set(freeformAdd.map((t) => t.name)));
  const freeformAddSlugs = freeformAddNames.map((n) => slugify(n));

  let tagIdByName = new Map<string, string>();
  if (freeformAddNames.length > 0) {
    const existingRes = await supabase
      .from("tags")
      .select("id, name, slug")
      .eq("organization_id", orgId)
      .in("slug", freeformAddSlugs);
    (existingRes.data ?? []).forEach((t) => tagIdByName.set(t.name, t.id));

    const toInsert = freeformAddNames
      .filter((n) => !tagIdByName.has(n))
      .map((n) => ({ organization_id: orgId, name: n, slug: slugify(n) }));
    if (toInsert.length > 0) {
      const insRes = await supabase.from("tags").insert(toInsert).select("id, name");
      (insRes.data ?? []).forEach((t) => tagIdByName.set(t.name, t.id));
    }
  }

  const freeformRemove = removes.filter((t) => t.kind === "freeform") as Array<{
    kind: "freeform";
    name: string;
    raw: string;
  }>;
  if (freeformRemove.length > 0) {
    const removeRes = await supabase
      .from("tags")
      .select("id, name")
      .eq("organization_id", orgId)
      .in("name", freeformRemove.map((t) => t.name));
    (removeRes.data ?? []).forEach((t) => tagIdByName.set(t.name, t.id));
  }

  // Process per product so failures are isolated and progress is granular.
  let done = 0;
  for (const productId of productIds) {
    try {
      // ADDS
      const athleteUpserts = adds
        .filter((t) => t.kind === "athlete")
        .map((t: any) => athleteIdBySlug.get(t.slug))
        .filter((x): x is string => !!x)
        .map((athlete_id) => ({ product_id: productId, athlete_id }));
      const teamUpserts = adds
        .filter((t) => t.kind === "team")
        .map((t: any) => teamIdBySlug.get(t.slug))
        .filter((x): x is string => !!x)
        .map((team_id) => ({ product_id: productId, team_id }));
      const collectionUpserts = adds
        .filter((t) => t.kind === "collection")
        .map((t: any) => collectionIdBySlug.get(t.slug))
        .filter((x): x is string => !!x)
        .map((collection_id) => ({ product_id: productId, collection_id }));
      const tagUpserts = freeformAdd
        .map((t) => tagIdByName.get(t.name))
        .filter((x): x is string => !!x)
        .map((tag_id) => ({ product_id: productId, tag_id }));

      const opPromises: Promise<{ error: unknown } | unknown>[] = [];
      if (athleteUpserts.length > 0)
        opPromises.push(
          Promise.resolve(
            supabase
              .from("product_athletes")
              .upsert(athleteUpserts, { onConflict: "product_id,athlete_id", ignoreDuplicates: true }),
          ),
        );
      if (teamUpserts.length > 0)
        opPromises.push(
          Promise.resolve(
            supabase
              .from("product_teams")
              .upsert(teamUpserts, { onConflict: "product_id,team_id", ignoreDuplicates: true }),
          ),
        );
      if (collectionUpserts.length > 0)
        opPromises.push(
          Promise.resolve(
            supabase
              .from("product_collections")
              .upsert(collectionUpserts, { onConflict: "product_id,collection_id", ignoreDuplicates: true }),
          ),
        );
      if (tagUpserts.length > 0)
        opPromises.push(
          Promise.resolve(
            supabase
              .from("product_tags")
              .upsert(tagUpserts, { onConflict: "product_id,tag_id", ignoreDuplicates: true }),
          ),
        );

      // REMOVES
      const athleteRemoveIds = removes
        .filter((t) => t.kind === "athlete")
        .map((t: any) => athleteIdBySlug.get(t.slug))
        .filter((x): x is string => !!x);
      if (athleteRemoveIds.length > 0)
        opPromises.push(
          Promise.resolve(
            supabase
              .from("product_athletes")
              .delete()
              .eq("product_id", productId)
              .in("athlete_id", athleteRemoveIds),
          ),
        );
      const teamRemoveIds = removes
        .filter((t) => t.kind === "team")
        .map((t: any) => teamIdBySlug.get(t.slug))
        .filter((x): x is string => !!x);
      if (teamRemoveIds.length > 0)
        opPromises.push(
          Promise.resolve(
            supabase
              .from("product_teams")
              .delete()
              .eq("product_id", productId)
              .in("team_id", teamRemoveIds),
          ),
        );
      const collectionRemoveIds = removes
        .filter((t) => t.kind === "collection")
        .map((t: any) => collectionIdBySlug.get(t.slug))
        .filter((x): x is string => !!x);
      if (collectionRemoveIds.length > 0)
        opPromises.push(
          Promise.resolve(
            supabase
              .from("product_collections")
              .delete()
              .eq("product_id", productId)
              .in("collection_id", collectionRemoveIds),
          ),
        );
      const tagRemoveIds = freeformRemove
        .map((t) => tagIdByName.get(t.name))
        .filter((x): x is string => !!x);
      if (tagRemoveIds.length > 0)
        opPromises.push(
          Promise.resolve(
            supabase
              .from("product_tags")
              .delete()
              .eq("product_id", productId)
              .in("tag_id", tagRemoveIds),
          ),
        );

      const results = await Promise.all(opPromises);
      const dbErr = (results as Array<{ error?: unknown }>).find((r) => r?.error)?.error;
      if (dbErr) throw dbErr;

      succeeded.push(productId);
    } catch (e: any) {
      failed.push({ productId, error: e?.message ?? String(e) });
    } finally {
      done += 1;
      onProgress?.(done, productIds.length);
    }
  }

  // Push to Shopify in one batched call. Fire-and-forget for UX speed but
  // surface any errors back to the caller.
  if (succeeded.length > 0 && (addTags.length > 0 || removeTags.length > 0)) {
    try {
      const { data, error } = await supabase.functions.invoke("shopify-update-product-tags", {
        body: {
          product_ids: succeeded,
          add_tags: addTags,
          remove_tags: removeTags,
        },
      });
      if (error) {
        console.warn("Shopify tag push failed:", error);
        succeeded.forEach((id) =>
          failed.push({ productId: id, error: `Shopify sync failed (queued for retry): ${error.message ?? error}` }),
        );
      } else if (data?.results?.length) {
        const shopifyFailed = (data.results as Array<{ product_id: string; ok: boolean; error?: string; queued?: boolean }>)
          .filter((r) => !r.ok);
        if (shopifyFailed.length) {
          shopifyFailed.forEach((r) => {
            failed.push({
              productId: r.product_id,
              error: r.queued
                ? `Saved locally — Shopify sync queued for retry: ${r.error}`
                : `Shopify sync failed: ${r.error}`,
            });
          });
        }
      }
    } catch (e) {
      console.warn("Shopify tag push exception:", e);
      succeeded.forEach((id) =>
        failed.push({ productId: id, error: `Shopify sync error: ${(e as Error)?.message ?? e}` }),
      );
    }
  }

  // Mark mapping queue rows resolved when athlete/team tags were added.
  if (succeeded.length > 0 && (athleteSlugs.length > 0 || teamSlugs.length > 0)) {
    try {
      await supabase
        .from("shopify_mapping_queue")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .in("product_id", succeeded)
        .eq("resolved", false);
    } catch {
      /* non-fatal */
    }
  }

  return { succeeded, failed };
}
