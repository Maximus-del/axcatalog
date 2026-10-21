// Pictures a client's portal shows: their logo, the room photo behind the home
// page, and the plaques/figures on their collection wall.
//
// They go in the public `content-media` bucket under portal/<entityId>/ — public
// because the portal renders them in a plain <img>, and every one of them is
// art the client is meant to see. Production artwork never goes here.
import { supabase } from "@/integrations/supabase/client";

const MAX_BYTES = 15 * 1024 * 1024;
const OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

/** Pure: a safe storage path for this upload. Exported for tests. */
export function portalAssetPath(entityId: string, kind: string, fileName: string, now = Date.now()): string {
  const ext = (fileName.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  const base = fileName
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `portal/${entityId}/${kind}/${now}-${base || "image"}.${ext}`;
}

export function portalAssetProblem(file: File): string | null {
  if (!OK_TYPES.includes(file.type)) return `${file.name}: use a PNG, JPG, WebP or SVG.`;
  if (file.size > MAX_BYTES) return `${file.name} is over 15 MB.`;
  return null;
}

/** Upload one picture and return the public address the portal will load. */
export async function uploadPortalAsset(entityId: string, kind: "logo" | "hero" | "plaque", file: File): Promise<string> {
  const problem = portalAssetProblem(file);
  if (problem) throw new Error(problem);
  const path = portalAssetPath(entityId, kind, file.name);
  const { error } = await supabase.storage.from("content-media").upload(path, file, {
    contentType: file.type,
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from("content-media").getPublicUrl(path).data.publicUrl;
}
