import { useEffect, useMemo, useState } from "react";
import {
  DIRECTORY_FILTERS, displayNameOf, entityTypeOf, matchesFilter, rolesOf,
  AX_ROLES, ENTITY_TYPES, isPerson,
} from "@/lib/ecosystem/entity";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { AthleteFormDialog } from "@/components/admin/athletes/AthleteFormDialog";

interface AthleteRow {
  id: string;
  display_name?: string | null;
  entity_type?: string | null;
  roles?: string[] | null;
  first_name: string;
  last_name: string;
  full_name: string | null;
  position: string | null;
  jersey_number: string | null;
  league: string | null;
  status: "active" | "inactive" | "archived";
  current_team: { id: string; name: string } | null;
  product_count: number;
  design_count: number;
  collection_count: number;
}

const LEAGUES = ["NFL", "NBA", "MLB", "NHL", "MLS", "WNBA", "NCAA", "OTHER"];

export default function AthletesList() {
  const [athletes, setAthletes] = useState<AthleteRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  // Directory tabs are role/type based: a person who is both athlete and client
  // appears under both, as the same record.
  const [directory, setDirectory] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    setLoading(true);
    const { data: rows } = await supabase
      .from("athletes")
      .select(
`id, first_name, last_name, full_name, display_name, entity_type, roles, position, jersey_number, league, status,
         current_team:teams!athletes_current_team_id_fkey(id, name)`,
      )
      .order("status", { ascending: true })
      .order("last_name", { ascending: true });

    const ids = (rows ?? []).map((r) => r.id);
    if (ids.length === 0) {
      setAthletes([]);
      setLoading(false);
      return;
    }

    // Counts in parallel via grouped fetches
    const [pa, da, col] = await Promise.all([
      supabase.from("product_athletes").select("athlete_id").in("athlete_id", ids),
      supabase.from("design_athletes").select("athlete_id").in("athlete_id", ids),
      supabase.from("collections").select("athlete_id").in("athlete_id", ids),
    ]);
    const tally = (data: Array<{ athlete_id: string }> | null) => {
      const m = new Map<string, number>();
      (data ?? []).forEach((r) => m.set(r.athlete_id, (m.get(r.athlete_id) ?? 0) + 1));
      return m;
    };
    const productCounts = tally(pa.data);
    const designCounts = tally(da.data);
    const collectionCounts = tally(col.data);

    setAthletes(
      (rows ?? []).map((r) => ({
        ...r,
        current_team: Array.isArray(r.current_team)
          ? (r.current_team[0] ?? null)
          : (r.current_team as AthleteRow["current_team"]),
        product_count: productCounts.get(r.id) ?? 0,
        design_count: designCounts.get(r.id) ?? 0,
        collection_count: collectionCounts.get(r.id) ?? 0,
      })) as AthleteRow[],
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!athletes) return [];
    const q = search.trim().toLowerCase();
    return athletes.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (leagueFilter !== "all" && a.league !== leagueFilter) return false;
      if (!q) return true;
      if (!matchesFilter(a, directory)) return false;
      const name = displayNameOf(a).toLowerCase();
      return name.includes(q);
    });
  }, [athletes, search, statusFilter, leagueFilter, directory]);

  const isEmpty = !loading && athletes && athletes.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Roster</div>
          <h1 className="text-3xl font-bold">Athletes</h1>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add Athlete
        </Button>
      </header>

      {!isEmpty && (
        <>
        <div className="flex flex-wrap gap-1.5">
          {DIRECTORY_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setDirectory(f.key)}
              className={`text-[12px] font-semibold rounded-full px-3 py-1 border ${
                directory === f.key
                  ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                  : "border-[hsl(var(--ax-border))] text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search athletes…"
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
        </>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ax-card space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-4">
          <p className="text-muted-foreground">
            No athletes yet. Add your first athlete to start building collections.
          </p>
          <Button onClick={() => setAddOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Athlete
          </Button>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((a) => {
            const name = displayNameOf(a);
            const meta = [
              a.position,
              a.jersey_number ? `#${a.jersey_number.replace(/^#/, "")}` : null,
              a.league,
            ].filter(Boolean);
            return (
              <Link
                to={`/admin/athletes/${a.id}`}
                key={a.id}
                className="ax-card-hover block group"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center h-14 w-14 rounded-full text-sm font-semibold text-white shrink-0"
                    style={{ background: avatarColorFor(name) }}
                  >
                    {initialsFor(name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {a.current_team?.name ?? (
                        <span className="italic">Free Agent</span>
                      )}
                    </div>
                  </div>
                </div>
                {meta.length > 0 && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    {meta.join(" · ")}
                  </div>
                )}
                <div className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground tabular-nums">
                  {a.product_count} products · {a.design_count} designs ·{" "}
                  {a.collection_count} collections
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!loading && athletes && athletes.length > 0 && filtered.length === 0 && (
        <div className="ax-card p-8 text-center text-sm text-muted-foreground">
          No athletes match your filters.
        </div>
      )}

      <AthleteFormDialog open={addOpen} onOpenChange={setAddOpen} onSaved={load} />
    </div>
  );
}
