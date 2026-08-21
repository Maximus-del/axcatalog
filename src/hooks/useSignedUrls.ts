// Previews for private buckets.
//
// design-files and mockups are private, so getPublicUrl() returns a URL that
// 400s — which is exactly why designs rendered as blank placeholders and there
// was no way to tell an upload had worked. These need signed URLs, batched per
// bucket so a grid of twenty designs is two requests rather than twenty.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PUBLIC_BUCKETS = new Set(["product-images", "design-references", "content-media", "blanks", "product-social-assets"]);
const TTL_SECONDS = 60 * 60;

export interface StoredFile { storage_bucket: string | null; storage_path: string | null }

export function storageKey(f: StoredFile): string {
  return `${f.storage_bucket ?? ""}::${f.storage_path ?? ""}`;
}

/**
 * Resolves a mixed list of stored files to displayable URLs. Public buckets
 * resolve synchronously; private ones are signed in one call per bucket.
 * Returns a map keyed by "bucket::path".
 */
export function useSignedUrls(files: StoredFile[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Identity of the request, so unrelated re-renders don't re-sign.
  const signature = files
    .map((f) => storageKey(f))
    .sort()
    .join("|");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const resolved: Record<string, string> = {};
      const byBucket = new Map<string, string[]>();

      for (const f of files) {
        if (!f.storage_path) continue;
        const bucket = f.storage_bucket || "product-images";
        const key = storageKey(f);

        if (bucket === "external") {
          resolved[key] = f.storage_path;
          continue;
        }
        if (PUBLIC_BUCKETS.has(bucket)) {
          resolved[key] = supabase.storage.from(bucket).getPublicUrl(f.storage_path).data.publicUrl;
          continue;
        }
        if (!byBucket.has(bucket)) byBucket.set(bucket, []);
        byBucket.get(bucket)!.push(f.storage_path);
      }

      if (!cancelled && Object.keys(resolved).length) setUrls((prev) => ({ ...prev, ...resolved }));

      for (const [bucket, paths] of byBucket) {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, TTL_SECONDS);
        if (error || !data || cancelled) continue;
        const signed: Record<string, string> = {};
        for (const row of data) {
          if (row.signedUrl && row.path) signed[`${bucket}::${row.path}`] = row.signedUrl;
        }
        if (!cancelled && Object.keys(signed).length) setUrls((prev) => ({ ...prev, ...signed }));
      }
    })();

    return () => { cancelled = true; };
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  return urls;
}

/** Single-file convenience for detail views. */
export function useSignedUrl(file: StoredFile | null | undefined): string | null {
  const urls = useSignedUrls(file?.storage_path ? [file] : []);
  return file?.storage_path ? urls[storageKey(file)] ?? null : null;
}
