import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TeamRow {
  id: string;
  name: string;
  city: string | null;
  league: string | null;
  status: "active" | "inactive" | "archived";
  primary_color: string | null;
  secondary_color: string | null;
  organization: { id: string; name: string } | null;
  roster_count: number;
  collection_count: number;
}

const LEAGUES = ["NFL", "NBA", "MLB", "NHL", "MLS", "WNBA", "NCAA", "OTHER"];

function tallyBy<T extends Record<string, string>>(data: T[] | null, key: keyof T) {
  const m = new Map<string, number>();
  (data ?? []).forEach((r) => {
    const k = r[key] as unknown as string;
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  });
  return m;
}

export default function TeamsList() {
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    const { data: rows } = await supabase
      .from("teams")
      .select(
        `id, name, city, league, status, primary_color, secondary_color,
         organization:organizations!teams_organization_id_fkey(id, name)`,
      )
      .order("status", { ascending: true })
      .order("name", { ascending: true });

    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length === 0) {
      setTeams([]);
      setLoading(false);
      return;
    }

    const [roster, col] = await Promise.all([
      supabase.from("athletes").select("current_team_id").in("current_team_id", ids),
      supabase.from("collections").select("team_id").in("team_id", ids),
    ]);
    const rosterCounts = tallyBy(roster.data, "current_team_id");
    const collectionCounts = tallyBy(col.data, "team_id");

    setTeams(
      (rows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        league: r.league,
        status: r.status,
        primary_color: r.primary_color,
        secondary_color: r.secondary_color,
        organization: Array.isArray(r.organization)
          ? (r.organization[0] ?? null)
          : (r.organization as TeamRow["organization"]),
        roster_count: rosterCounts.get(r.id) ?? 0,
        collection_count: collectionCounts.get(r.id) ?? 0,
      })) as TeamRow[],
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!teams) return [];
    const q = search.trim().toLowerCase();
    return teams.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (leagueFilter !== "all" && t.league !== leagueFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        (t.city ?? "").toLowerCase().includes(q)
      );
    });
  }, [teams, search, statusFilter, leagueFilter]);

  const isEmpty = !loading && teams && teams.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Clients</div>
          <h1 className="text-3xl font-bold">Teams</h1>
        </div>
      </header>

      {!isEmpty && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search teams…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={leagueFilter} onValueChange={setLeagueFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All leagues</SelectItem>
              {LEAGUES.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ax-card space-y-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-[12px] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] flex items-center justify-center">
            <Trophy className="h-5 w-5" />
          </div>
          <p className="text-muted-foreground">No teams yet.</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((t) => {
            const meta = [t.city, t.league].filter(Boolean);
            return (
              <Link
                to={`/admin/teams/${t.id}`}
                key={t.id}
                className="ax-card-hover block group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex shrink-0 rounded-[10px] overflow-hidden h-10 w-10 border border-border">
                    <span
                      className="flex-1"
                      style={{ background: t.primary_color ?? "hsl(var(--muted))" }}
                    />
                    <span
                      className="flex-1"
                      style={{ background: t.secondary_color ?? "hsl(var(--muted-foreground))" }}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {t.organization?.name ?? "—"}
                    </div>
                  </div>
                </div>
                {meta.length > 0 && (
                  <div className="mt-3 text-xs text-muted-foreground">{meta.join(" · ")}</div>
                )}
                <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground tabular-nums">
                  {t.roster_count} athletes · {t.collection_count} collections
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!loading && teams && teams.length > 0 && filtered.length === 0 && (
        <div className="ax-card p-8 text-center text-sm text-muted-foreground">
          No teams match your filters.
        </div>
      )}
    </div>
  );
}
