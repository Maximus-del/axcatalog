import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PortalDesign {
  id: string;
  title: string | null;
  status: string | null;
  /** First design file, for a thumbnail (bucket is usually private). */
  file: { bucket: string; path: string } | null;
}

function first<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** Designs AX has created for this athlete (via design_athletes). */
export function usePortalDesigns(athleteId: string | null) {
  const [designs, setDesigns] = useState<PortalDesign[] | null>(null);

  useEffect(() => {
    if (!athleteId) {
      setDesigns([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("design_athletes")
        .select(
          `design:designs!inner(id, title, status,
             files:design_files(storage_path, storage_bucket, is_primary))`,
        )
        .eq("athlete_id", athleteId);

      if (cancelled) return;
      const rows = (data ?? [])
        .map((r) => first(r.design) as {
          id: string;
          title: string | null;
          status: string | null;
          files: Array<{ storage_path: string; storage_bucket: string; is_primary: boolean }>;
        } | null)
        .filter(Boolean) as Array<{
        id: string;
        title: string | null;
        status: string | null;
        files: Array<{ storage_path: string; storage_bucket: string; is_primary: boolean }>;
      }>;

      setDesigns(
        rows.map((d) => {
          const files = [...(d.files ?? [])].sort(
            (a, b) => Number(b.is_primary) - Number(a.is_primary),
          );
          const f = files[0];
          return {
            id: d.id,
            title: d.title,
            status: d.status,
            file: f ? { bucket: f.storage_bucket, path: f.storage_path } : null,
          };
        }),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  return { designs, loading: designs === null };
}
