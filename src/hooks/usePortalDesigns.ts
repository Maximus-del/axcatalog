import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  mapShelf,
  type ClientShelfRow,
  type PortalDesign,
} from "@/lib/portal/client-designs";

export type { PortalDesign } from "@/lib/portal/client-designs";
export { CLIENT_PREVIEW_BUCKET } from "@/lib/portal/client-designs";

/**
 * Designs AX has shared with this entity.
 *
 * Reads `public.client_design_shelf`, which applies the visibility ceiling (a
 * design is visible only if it AND its folder are marked visible) and returns
 * preview paths only. This hook previously joined design_athletes -> designs ->
 * design_files and handed whatever bucket the row named to createSignedUrl,
 * which meant a client session could be issued a signed URL for the production
 * PNG in `design-files`. Nothing was exposed — every account was an admin — but
 * the first non-admin login would have been. See AX_CLIENT_VISIBILITY.md.
 */
export function usePortalDesigns(athleteId: string | null) {
  const [designs, setDesigns] = useState<PortalDesign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!athleteId) {
      setDesigns([]);
      return;
    }
    let cancelled = false;
    setDesigns(null);
    setError(null);
    void (async () => {
      // `client_design_shelf` is applied in the database but absent from the
      // generated types (src/integrations/supabase/types.ts is behind the live
      // schema — see AX_OS_V2_SOURCE_OF_TRUTH.md). Typed narrowly here rather
      // than with a blanket `as never`, so the row shape is still checked
      // against ClientShelfRow at the mapping boundary.
      const rpc = supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error: err } = await rpc("client_design_shelf", { _athlete_id: athleteId });

      if (cancelled) return;
      if (err) {
        console.error("client_design_shelf error", err);
        setError(err.message);
        setDesigns([]);
        return;
      }
      setDesigns(mapShelf(data as unknown as ClientShelfRow[]));
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  return { designs, loading: designs === null, error };
}
