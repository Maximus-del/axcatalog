import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { parsePortalTheme, type PortalTheme } from "@/lib/portal/portal-theme";
import { resolvePortalRole } from "@/lib/portal/roles";
import type { PortalRole } from "@/lib/portal/invites";

export type CurrentAthlete = {
  id: string;
  organization_id: string;
  /**
   * Authoritative name. full_name is a generated column (first || ' ' || last)
   * and reads "Dashletics ." for an organisation whose last_name is a period —
   * resolve through entityVoice(), never by concatenating.
   */
  display_name: string | null;
  /** What this entity IS. Portal voice branches on it. */
  entity_type: string | null;
  /** How AX works with it — athlete, client, partner… */
  roles: string[] | null;
  first_name: string;
  last_name: string;
  full_name: string | null;
  slug: string;
  jersey_number: string | null;
  position: string | null;
  league: string | null;
  current_team_id: string | null;
  /**
   * How this client's portal looks, set by AX from the V2 entity page. Always
   * a complete theme — parsePortalTheme() fills anything missing with the
   * original AX look — so callers never null-check a colour.
   */
  portal_theme: PortalTheme;
};

interface State {
  athlete: CurrentAthlete | null;
  loading: boolean;
  error: string | null;
  /** True when an admin is viewing as someone else via ?as=. */
  isImpersonating: boolean;
  /** No athlete resolvable for this user. */
  noAccess: boolean;
  /** Owner (C-level, sees money) or Team (gear only). Admins preview Team with ?view=team. */
  portalRole: PortalRole;
}

/**
 * Only the theme key of metadata, never the whole blob — the rest of metadata
 * is operator configuration the portal has no use for. Typed as a plain string
 * because the generated types cannot follow a JSON path in a select.
 */
const ATHLETE_COLUMNS: string =
  "id, organization_id, display_name, first_name, last_name, full_name, slug, jersey_number, position, league, current_team_id, entity_type, roles, portal_theme:metadata->portal_theme";

/**
 * Resolves the "current athlete" for the portal:
 *  - If admin AND ?as=<athlete_id> is present, use that.
 *  - Else first linked athlete (user_athlete_links).
 *  - Else noAccess = true.
 */
export function useCurrentAthlete(): State {
  const { user, role, linkedAthleteIds, portalRoles, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const asParam = searchParams.get("as");

  const [athlete, setAthlete] = useState<CurrentAthlete | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = role === "admin";
  // A demo-link account walks the real portal read-only, exactly like View-as.
  const isDemo = (user?.user_metadata as { ax_demo?: boolean } | undefined)?.ax_demo === true;
  const isImpersonating = (isAdmin && !!asParam) || isDemo;

  // Determine target athlete id
  const targetId = (() => {
    if (!user) return null;
    if (isAdmin && asParam) return asParam;
    return linkedAthleteIds[0] ?? null;
  })();

  const noAccess = !authLoading && !!user && !targetId;
  const portalRole = resolvePortalRole({
    isAdmin,
    viewParam: searchParams.get("view"),
    linkRole: targetId ? portalRoles[targetId] : undefined,
  });

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
        .select(ATHLETE_COLUMNS)
        .eq("id", targetId)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setAthlete(null);
      } else {
        const row = data as unknown as (Omit<CurrentAthlete, "portal_theme"> & { portal_theme: unknown }) | null;
        setAthlete(row ? { ...row, portal_theme: parsePortalTheme(row.portal_theme) } : null);
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
    portalRole,
  };
}
