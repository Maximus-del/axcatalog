import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OrgClient = {
  id: string;
  name: string;
  kind: "athlete" | "brand";
  status: "active" | "inactive" | "archived";
  team_name: string | null;
};

interface State {
  clients: OrgClient[];
  loading: boolean;
}

const STATUS_RANK: Record<OrgClient["status"], number> = {
  active: 0,
  inactive: 1,
  archived: 2,
};

/**
 * Loads athletes (+ brand-type teams) in the current admin's org for the
 * impersonation switcher. Sorts active → inactive → archived, then by name.
 */
export function useOrgClients(enabled = true): State {
  const [clients, setClients] = useState<OrgClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [athletesRes, teamsRes] = await Promise.all([
        supabase
          .from("athletes")
          .select(
            "id, full_name, first_name, last_name, status, current_team:teams!athletes_current_team_id_fkey(name)",
          ),
        supabase.from("teams").select("id, name, status, metadata"),
      ]);
      if (cancelled) return;

      const athletes: OrgClient[] = (athletesRes.data ?? []).map((a) => {
        const team = Array.isArray(a.current_team)
          ? a.current_team[0]
          : (a.current_team as { name: string } | null);
        return {
          id: a.id,
          name: a.full_name || `${a.first_name} ${a.last_name}`.trim(),
          kind: "athlete" as const,
          status: a.status as OrgClient["status"],
          team_name: team?.name ?? null,
        };
      });
      const brands: OrgClient[] = (teamsRes.data ?? [])
        .filter((t) => {
          const meta = t.metadata as Record<string, unknown> | null;
          return meta && meta.entity_type === "brand";
        })
        .map((t) => ({
          id: t.id,
          name: t.name,
          kind: "brand" as const,
          status: (t.status as OrgClient["status"]) ?? "active",
          team_name: null,
        }));

      const combined = [...athletes, ...brands].sort((a, b) => {
        const sr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (sr !== 0) return sr;
        return a.name.localeCompare(b.name);
      });
      setClients(combined);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { clients, loading };
}
