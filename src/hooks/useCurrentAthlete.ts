import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export type CurrentAthlete = {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  full_name: string | null;
  slug: string;
  jersey_number: string | null;
  position: string | null;
  league: string | null;
  current_team_id: string | null;
};

interface State {
  athlete: CurrentAthlete | null;
  loading: boolean;
  error: string | null;
  /** True when an admin is viewing as someone else via ?as=. */
  isImpersonating: boolean;
  /** No athlete resolvable for this user. */
  noAccess: boolean;
}

/**
 * Resolves the "current athlete" for the portal:
 *  - If admin AND ?as=<athlete_id> is present, use that.
 *  - Else first linked athlete (user_athlete_links).
 *  - Else noAccess = true.
 */
export function useCurrentAthlete(): State {
  const { user, role, linkedAthleteIds, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const asParam = searchParams.get("as");

  const [athlete, setAthlete] = useState<CurrentAthlete | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  const isImpersonating = isAdmin && !!asParam;

  // Determine target athlete id
  const targetId = (() => {
    if (!user) return null;
    if (isImpersonating) return asParam!;
    return linkedAthleteIds[0] ?? null;
  })();

  const noAccess = !authLoading && !!user && !targetId;

  useEffect(() => {
    if (authLoading) return;
    if (!targetId) {
      setAthlete(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const { data, error: err } = await supabase
        .from("athletes")
        .select(
          "id, organization_id, first_name, last_name, full_name, slug, jersey_number, position, league, current_team_id",
        )
        .eq("id", targetId)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setAthlete(null);
      } else {
        setAthlete(data ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId, authLoading]);

  return {
    athlete,
    loading: authLoading || loading,
    error,
    isImpersonating,
    noAccess,
  };
}
