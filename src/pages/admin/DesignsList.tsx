import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ChevronLeft, ChevronRight, LayoutGrid, List, Palette, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DESIGN_STATUSES,
  type DesignStatus,
  designStatusBadgeClass,
  formatDesignStatus,
} from "@/lib/design-status";
import { DesignFormDialog } from "@/components/admin/designs/DesignFormDialog";
import { cn } from "@/lib/utils";

interface DesignRow {
  id: string;
  title: string;
  status: DesignStatus;
  season: string | null;
  campaign: string | null;
  primary_athlete_id: string | null;
  primary_team_id: string | null;
  primary_athlete_name: string | null;
  updated_at: string;
  thumb_url: string | null;
  file_count: number;
}

const PAGE_SIZE = 25;

export default function DesignsList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<DesignRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [athleteFilter, setAthleteFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [seasonFilter, setSeasonFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [athletes, setAthletes] = useState<Array<{ id: string; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [designsRes, athletesRes, teamsRes] = await Promise.all([
        supabase
          .from("designs")
          .select(
            "id, title, status, season, campaign, primary_athlete_id, primary_team_id, updated_at, primary_athlete:athletes!designs_primary_athlete_id_fkey(id, first_name, last_name, full_name)",
          )
          .order("updated_at", { ascending: false }),
        supabase.from("athletes").select("id, first_name, last_name, full_name").order("last_name"),
        supabase.from("teams").select("id, name").order("name"),
      ]);

      if (designsRes.error) console.error(designsRes.error);

      const designs = designsRes.data ?? [];
      setAthletes(
        (athletesRes.data ?? []).map((a) => ({
          id: a.id,
          name: a.full_name ?? `${a.first_name} ${a.last_name}`,
        })),
      );
      setTeams((teamsRes.data ?? []) as Array<{ id: string; name: string }>);

      const ids = designs.map((d) => d.id);
      const filesByDesign = new Map<string, { count: number; primary?: { bucket: string; path: string } }>();
      if (ids.length) {
        const filesRes = await supabase
          .from("design_files")
          .select("design_id, file_type, is_primary, storage_bucket, storage_path")
          .in("design_id", ids);
        (filesRes.data ?? []).forEach((f) => {
          const entry = filesByDesign.get(f.design_id) ?? { count: 0 };
          entry.count += 1;
          if (f.file_type === "mockup" && f.is_primary && !entry.primary) {
            entry.primary = { bucket: f.storage_bucket, path: f.storage_path };
          }
          filesByDesign.set(f.design_id, entry);
        });
      }

      // Generate signed URLs for primary mockups
      const thumbMap = new Map<string, string>();
      await Promise.all(
        Array.from(filesByDesign.entries()).map(async ([designId, info]) => {
          if (!info.primary) return;
          const { data } = await supabase.storage
            .from(info.primary.bucket)
            .createSignedUrl(info.primary.path, 3600);
          if (data?.signedUrl) thumbMap.set(designId, data.signedUrl);
        }),
      );

      setRows(
        designs.map((d) => {
          const a = Array.isArray(d.primary_athlete) ? d.primary_athlete[0] : d.primary_athlete;
          const info = filesByDesign.get(d.id);
          return {
            id: d.id,
            title: d.title,
            status: d.status as DesignStatus,
            season: d.season,
            campaign: d.campaign,
            primary_athlete_id: d.primary_athlete_id,
            primary_team_id: d.primary_team_id,
            primary_athlete_name: a ? a.full_name ?? `${a.first_name} ${a.last_name}` : null,
            updated_at: d.updated_at,
            thumb_url: thumbMap.get(d.id) ?? null,
            file_count: info?.count ?? 0,
          };
        }),
      );
    } catch (err) {
      console.error("DesignsList load failed:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const seasonQ = seasonFilter.trim().toLowerCase();
    const campaignQ = campaignFilter.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (athleteFilter !== "all" && r.primary_athlete_id !== athleteFilter) return false;
      if (teamFilter !== "all" && r.primary_team_id !== teamFilter) return false;
      if (seasonQ && !(r.season ?? "").toLowerCase().includes(seasonQ)) return false;
      if (campaignQ && !(r.campaign ?? "").toLowerCase().includes(campaignQ)) return false;
      if (!q) return true;
      return r.title.toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter, athleteFilter, teamFilter, seasonFilter, campaignFilter]);

  useEffect(() => setPage(1), [search, statusFilter, athleteFilter, teamFilter, seasonFilter, campaignFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const isEmpty = !loading && rows && rows.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Catalog</div>
          <h1 className="text-3xl font-bold">Designs</h1>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Design
        </Button>
      </header>

      {!isEmpty && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {DESIGN_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {formatDesignStatus(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={athleteFilter} onValueChange={setAthleteFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All athletes</SelectItem>
              {athletes.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Season"
            className="w-[140px]"
            value={seasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value)}
          />
          <Input
            placeholder="Campaign"
            className="w-[140px]"
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
          />
          <div className="ml-auto flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "px-2 py-1.5 text-xs flex items-center gap-1 transition-colors",
                view === "grid" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Grid
            </button>
            <button
              onClick={() => setView("table")}
              className={cn(
                "px-2 py-1.5 text-xs flex items-center gap-1 transition-colors border-l border-border",
                view === "table" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" /> Table
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-4">
          <Palette className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">
            No designs yet. Create your first design to start building collections.
          </p>
          <div className="flex justify-center">
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Design
            </Button>
          </div>
        </div>
      )}

      {!loading && rows && rows.length > 0 && view === "grid" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paged.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/admin/designs/${d.id}`)}
                className="ax-card p-0 overflow-hidden text-left transition-all duration-200 hover:border-accent hover:-translate-y-1 group"
              >
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {d.thumb_url ? (
                    <img
                      src={d.thumb_url}
                      alt={d.title}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <Palette className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold leading-tight">{d.title}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-xs border capitalize",
                        designStatusBadgeClass(d.status),
                      )}
                    >
                      {formatDesignStatus(d.status)}
                    </span>
                    {d.primary_athlete_name && (
                      <span className="text-xs text-muted-foreground truncate">
                        {d.primary_athlete_name}
                      </span>
                    )}
                  </div>
                  {d.season && <div className="text-xs text-muted-foreground">{d.season}</div>}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                    <span>{d.file_count} {d.file_count === 1 ? "file" : "files"}</span>
                    <span>{formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {!loading && rows && rows.length > 0 && view === "table" && (
        <div className="ax-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left p-3 w-16 text-muted-foreground font-medium">Thumb</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Title</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Status</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Athlete</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Season</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Files</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-border last:border-b-0 ax-row-hover cursor-pointer"
                    onClick={() => navigate(`/admin/designs/${d.id}`)}
                  >
                    <td className="p-3">
                      {d.thumb_url ? (
                        <img src={d.thumb_url} alt="" className="h-10 w-10 rounded-md object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center">
                          <Palette className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-medium">{d.title}</td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex px-2 py-0.5 rounded-full text-xs border capitalize",
                          designStatusBadgeClass(d.status),
                        )}
                      >
                        {formatDesignStatus(d.status)}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">{d.primary_athlete_name ?? "—"}</td>
                    <td className="p-3 text-muted-foreground">{d.season ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{d.file_count}</td>
                    <td className="p-3 text-right text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && rows && rows.length > 0 && filtered.length === 0 && (
        <div className="ax-card p-8 text-center text-sm text-muted-foreground">
          No designs match your filters.
        </div>
      )}

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </Button>
            <span className="text-muted-foreground tabular-nums">{page} / {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <DesignFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </div>
  );
}
