import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// WHAT AN ATHLETE OR CLIENT IS SHOWN OF THE MOCKUP LIBRARY.
//
// Reads `public.client_mockups` and nothing else. That view is the security
// boundary, not this file: it exposes only mockups explicitly marked
// client_visible, only for an athlete the signed-in user is linked to, and only
// the columns a client surface needs — no design lineage, no notes, no
// approval state, no folders. See supabase/proposed/20260831_client_visible_mockups.sql.
//
// THE VIEW MAY NOT EXIST YET. It is deliberately gated on Chase's sign-off,
// because it widens what a client session can read. So a missing view is a
// normal, expected state here rather than an error to shout about: `available`
// comes back false, the page says the feature is not switched on, and nothing
// in the portal breaks.

export interface ClientMockup {
  id: string;
  title: string;
  colorName: string | null;
  blankName: string | null;
  imageUrl: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  createdAt: string;
}

interface State {
  mockups: ClientMockup[];
  loading: boolean;
  /** False when the read path is not switched on yet. */
  available: boolean;
  error: string | null;
  refetch: () => void;
}

/** Postgres says 42P01 for "relation does not exist". */
const MISSING_RELATION = "42P01";

export function useClientMockups(athleteId: string | null | undefined): State {
  const [mockups, setMockups] = useState<ClientMockup[]>([]);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!athleteId) {
      setMockups([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      const res = await supabase
        .from("client_mockups" as never)
        .select("id, athlete_id, title, color_name, blank_name, storage_bucket, storage_path, image_url, created_at")
        .eq("athlete_id", athleteId)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (res.error) {
        const code = (res.error as { code?: string }).code;
        if (code === MISSING_RELATION) {
          setAvailable(false);
          setMockups([]);
          setLoading(false);
          return;
        }
        setError(res.error.message);
        setMockups([]);
        setLoading(false);
        return;
      }

      setAvailable(true);
      const rows = (res.data ?? []) as unknown as Array<Record<string, unknown>>;

      // The composite lives in a private bucket, so each one needs a signed
      // URL. Signed in a single batch rather than per card: thirty mockups
      // should not be thirty round trips.
      const paths = rows
        .map((r) => (typeof r.storage_path === "string" ? r.storage_path : null))
        .filter((p): p is string => Boolean(p));

      const signed = new Map<string, string>();
      if (paths.length > 0) {
        const { data } = await supabase.storage.from("mockups").createSignedUrls(paths, 3600);
        for (const entry of data ?? []) {
          if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
        }
      }

      if (cancelled) return;
      setMockups(
        rows.map((r) => {
          const path = typeof r.storage_path === "string" ? r.storage_path : null;
          return {
            id: String(r.id),
            title: String(r.title ?? "Mockup"),
            colorName: typeof r.color_name === "string" ? r.color_name : null,
            blankName: typeof r.blank_name === "string" ? r.blank_name : null,
            // The signed composite first; the blank's own public photo is the
            // only fallback, and it is a plain garment rather than the mockup.
            imageUrl: (path ? signed.get(path) : null) ?? (typeof r.image_url === "string" ? r.image_url : null),
            storageBucket: typeof r.storage_bucket === "string" ? r.storage_bucket : null,
            storagePath: path,
            createdAt: String(r.created_at ?? ""),
          };
        }),
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [athleteId, nonce]);

  return { mockups, loading, available, error, refetch };
}
