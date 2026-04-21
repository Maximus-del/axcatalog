// Shared helper to upload a PNG into the design library.
//
// Each call creates ONE design row + ONE design_files row, and uploads the
// file to the private `design-files` bucket.
//
// IMPORTANT: storage RLS on the `design-files` bucket requires the FIRST
// path segment to be the design's UUID (it joins back to `designs` to check
// the org). So we always upload to `<designId>/<filename>` — never prefix
// with org id or anything else.
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slug";

export const DESIGN_BUCKET = "design-files";

export interface UploadDesignArgs {
  file: File;
  organizationId: string;
  collectionId: string | null;
  /** Optional metadata override — if omitted, derived from filename. */
  titleOverride?: string;
}

export interface UploadDesignResult {
  designId: string;
  title: string;
}

/**
 * Create a design + upload its primary PNG file. Single source of truth used
 * by both the drag-drop handler and the "New Design" form when a file is
 * attached.
 *
 * Throws on any failure. Caller should catch per-file to allow partial
 * success in multi-file flows.
 */
export async function uploadDesignFromFile({
  file,
  organizationId,
  collectionId,
  titleOverride,
}: UploadDesignArgs): Promise<UploadDesignResult> {
  if (file.type !== "image/png") {
    throw new Error(`Not a PNG file: ${file.name}`);
  }

  const baseName = file.name.replace(/\.[^.]+$/, "");
  const title = (titleOverride ?? baseName).trim() || "Untitled";
  // Slug must be unique-ish — append timestamp+random suffix.
  const slug = `${slugify(title) || "design"}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  // 1. Create the design row first so storage RLS can verify ownership via designId.
  const designRes = await supabase
    .from("designs")
    .insert({
      organization_id: organizationId,
      title,
      slug,
      status: "concept" as const,
      design_collection_id: collectionId,
    })
    .select("id")
    .single();
  if (designRes.error) throw designRes.error;
  const designId = designRes.data.id;

  // 2. Upload to storage. Path MUST start with designId to satisfy RLS.
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${designId}/${Date.now()}-${safeName}`;
  const upRes = await supabase.storage.from(DESIGN_BUCKET).upload(path, file, {
    contentType: "image/png",
    upsert: false,
  });
  if (upRes.error) {
    // Roll back the orphan design row so we don't litter the table.
    await supabase.from("designs").delete().eq("id", designId);
    throw upRes.error;
  }

  // 3. Link the file row.
  const fileRes = await supabase.from("design_files").insert({
    design_id: designId,
    file_type: "mockup",
    storage_bucket: DESIGN_BUCKET,
    storage_path: path,
    file_name: file.name,
    file_extension: "png",
    mime_type: "image/png",
    file_size_bytes: file.size,
    is_primary: true,
  });
  if (fileRes.error) {
    // Roll back storage + design row on link failure.
    await supabase.storage.from(DESIGN_BUCKET).remove([path]);
    await supabase.from("designs").delete().eq("id", designId);
    throw fileRes.error;
  }

  return { designId, title };
}

export interface BatchResult {
  successes: Array<{ file: File; designId: string; title: string }>;
  failures: Array<{ file: File; error: string }>;
}

/**
 * Upload many PNGs. Each file is independent — one failure does not abort
 * the others. Returns a per-file breakdown.
 */
export async function uploadDesignsBatch(
  files: File[],
  organizationId: string,
  collectionId: string | null,
  onFileDone?: (file: File, ok: boolean) => void,
): Promise<BatchResult> {
  const successes: BatchResult["successes"] = [];
  const failures: BatchResult["failures"] = [];

  for (const file of files) {
    try {
      const { designId, title } = await uploadDesignFromFile({
        file,
        organizationId,
        collectionId,
      });
      successes.push({ file, designId, title });
      onFileDone?.(file, true);
    } catch (err) {
      console.error("uploadDesignsBatch: file failed", file.name, err);
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ file, error: message });
      onFileDone?.(file, false);
    }
  }

  return { successes, failures };
}

/** Helper: resolve current user's organization_id (cached per call). */
export async function getCurrentUserOrgId(userId: string): Promise<string | null> {
  const res = await supabase
    .from("user_profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  return res.data?.organization_id ?? null;
}
