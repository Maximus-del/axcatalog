import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a 1-hour signed URL for a private bucket file.
 * Re-runs when bucket/path changes. Pass null path to skip.
 */
export function useSignedUrl(bucket: string | null, path: string | null, expiresIn = 3600) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!bucket || !path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("createSignedUrl error", error);
          setUrl(null);
        } else {
          setUrl(data?.signedUrl ?? null);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path, expiresIn]);

  return { url, loading };
}

export async function getSignedUrl(bucket: string, path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) {
    console.error("getSignedUrl error", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
