// Reusable uploader for Content media (images/video) into the public
// `content-media` bucket. Returns a public URL suitable for hero_url / media.
import { supabase } from "@/integrations/supabase/client";

export const CONTENT_MEDIA_BUCKET = "content-media";

function safeName(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}.${ext || "bin"}`;
}

export async function uploadContentMedia(file: File, organizationId: string, athleteId?: string): Promise<string> {
  const path = `${organizationId}/${athleteId ?? "org"}/${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from(CONTENT_MEDIA_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from(CONTENT_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadContentMediaBatch(files: File[], organizationId: string, athleteId?: string): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) out.push(await uploadContentMedia(f, organizationId, athleteId));
  return out;
}
