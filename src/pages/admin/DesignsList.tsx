// Unified Designs page.
//
// Default view: collections grid (folders) + virtual "All designs" and
// "Uncollected" entries.
// Drill into a collection via ?c=<id> (or ?c=all / ?c=uncollected) to see
// its design grid with drag-and-drop PNG upload.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  Palette,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DESIGN_STATUSES,
  type DesignStatus,
  designStatusBadgeClass,
  formatDesignStatus,
} from "@/lib/design-status";
import { DesignFormDialog } from "@/components/admin/designs/DesignFormDialog";
import { DesignBulkTagBar } from "@/components/admin/designs/DesignBulkTagBar";
import { useAuth } from "@/auth/AuthProvider";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { uploadDesignsBatch, getCurrentUserOrgId } from "@/lib/upload-design";
import { useMarqueeSelection } from "@/hooks/useMarqueeSelection";
import { runMooneySweep } from "@/lib/mooney-sweep";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DesignsList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const collectionParam = searchParams.get("c");

  if (collectionParam) {
    return (
      <CollectionView
        collectionId={collectionParam}
        onBack={() => setSearchParams({})}
      />
    );
  }
  return (
    <CollectionsOverview
      onOpen={(id) => setSearchParams({ c: id })}
    />
  );
}

function MooneySweepButton({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      className="gap-2"
      onClick={async () => {
        setBusy(true);
        try {
          const r = await runMooneySweep();
          const msg = `Linked Mooney → ${r.productsLinked}/${r.productsScanned} products, ${r.designsLinked}/${r.designsScanned} designs`;
          if (r.errors.length) toast.error(`${msg} (${r.errors.join("; ")})`);
          else toast.success(msg);
          onDone?.();
        } catch (e: any) {
          toast.error(`Sweep failed: ${e?.message ?? e}`);
        } finally {
          setBusy(false);
        }
      }}
      title="Auto-link Darnell Mooney to anything mentioning Mooney, Mooney World, or MWrld"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
      Auto-link Mooney
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/* Collections overview                                                        */
/* -------------------------------------------------------------------------- */
interface CollectionRow {
  id: string;
  name: string;
  notes: string | null;
  design_count: number;
  cover_url: string | null;
}

function CollectionsOverview({ onOpen }: { onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<CollectionRow[] | null>(null);
  const [allCount, setAllCount] = useState(0);
  const [uncollectedCount, setUncollectedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<CollectionRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cRes = await supabase
        .from("design_collections")
        .select("id, name, notes")
        .order("name");
      if (cRes.error) throw cRes.error;
      const collections = cRes.data ?? [];

      const dRes = await supabase
        .from("designs")
        .select(
          `id, design_collection_id, updated_at,
           design_files(storage_bucket, storage_path, is_primary, sort_order)`,
        )
        .order("updated_at", { ascending: false });
      if (dRes.error) throw dRes.error;

      const allDesigns = dRes.data ?? [];
      setAllCount(allDesigns.length);
      setUncollectedCount(
        allDesigns.filter((d) => d.design_collection_id == null).length,
      );

      const countMap = new Map<string, number>();
      const coverMap = new Map<string, { bucket: string; path: string }>();
      allDesigns.forEach((d) => {
        const cid = d.design_collection_id as string | null;
        if (!cid) return;
        countMap.set(cid, (countMap.get(cid) ?? 0) + 1);
        if (!coverMap.has(cid)) {
          const files = (d.design_files ?? []) as Array<{
            storage_bucket: string;
            storage_path: string;
            is_primary: boolean;
            sort_order: number;
          }>;
          const sorted = [...files].sort(
            (a, b) =>
              Number(b.is_primary) - Number(a.is_primary) ||
              a.sort_order - b.sort_order,
          );
          if (sorted[0]) {
            coverMap.set(cid, {
              bucket: sorted[0].storage_bucket,
              path: sorted[0].storage_path,
            });
          }
        }
      });

      const coverUrlMap = new Map<string, string>();
      await Promise.all(
        Array.from(coverMap.entries()).map(async ([cid, info]) => {
          const { data } = await supabase.storage
            .from(info.bucket)
            .createSignedUrl(info.path, 3600);
          if (data?.signedUrl) coverUrlMap.set(cid, data.signedUrl);
        }),
      );

      setRows(
        collections.map((c) => ({
          id: c.id,
          name: c.name,
          notes: c.notes,
          design_count: countMap.get(c.id) ?? 0,
          cover_url: coverUrlMap.get(c.id) ?? null,
        })),
      );
    } catch (err) {
      console.error("DesignsList load failed:", err);
      toast.error("Failed to load collections");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("design_collections")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error("Failed to delete collection");
      return;
    }
    toast.success(
      `Deleted "${deleteTarget.name}". ${deleteTarget.design_count} design(s) moved to Uncollected.`,
    );
    setDeleteTarget(null);
    void load();
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Catalog</div>
          <h1 className="text-3xl font-bold">Designs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize artwork into collections. Drag-and-drop PNG files into a collection to upload.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <FolderPlus className="h-4 w-4" /> New Collection
        </Button>
      </header>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search collections…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <MooneySweepButton onDone={() => void load()} />
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* Virtual "All designs" */}
          <VirtualFolderCard
            label="All designs"
            count={allCount}
            onClick={() => onOpen("all")}
            tone="accent"
          />
          {/* Virtual "Uncollected" */}
          <VirtualFolderCard
            label="Uncollected"
            count={uncollectedCount}
            onClick={() => onOpen("uncollected")}
            tone="muted"
          />

          {filtered.map((c) => (
            <div key={c.id} className="relative group">
              <button
                onClick={() => onOpen(c.id)}
                className="ax-card p-0 overflow-hidden text-left transition-all duration-200 hover:border-accent hover:-translate-y-1 w-full"
              >
                <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
                  {c.cover_url ? (
                    <img
                      src={c.cover_url}
                      alt={c.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <FolderOpen className="h-12 w-12 text-muted-foreground" />
                  )}
                </div>
                <div className="p-4 space-y-1">
                  <div className="font-semibold leading-tight truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.design_count} {c.design_count === 1 ? "design" : "designs"}
                  </div>
                </div>
              </button>
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameTarget(c);
                  }}
                  className="h-8 w-8 rounded-md bg-background/80 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
                  title="Rename"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(c);
                  }}
                  className="h-8 w-8 rounded-md bg-background/80 border border-border flex items-center justify-center text-muted-foreground hover:text-destructive"
                  title="Delete collection"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {rows && rows.length > 0 && filtered.length === 0 && (
            <div className="col-span-full ax-card p-8 text-center text-sm text-muted-foreground">
              No collections match your search.
            </div>
          )}

          {rows && rows.length === 0 && (
            <div className="col-span-full ax-card p-8 text-center text-sm text-muted-foreground">
              No collections yet. Create one to start organizing artwork — or open "All designs"
              to browse everything.
            </div>
          )}
        </div>
      )}

      <CollectionFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => void load()}
      />

      <CollectionFormDialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
        existing={renameTarget ?? undefined}
        onSaved={() => {
          setRenameTarget(null);
          void load();
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The {deleteTarget?.design_count ?? 0} design(s) inside will become uncollected (not
              deleted). You can move them into another collection later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete collection</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VirtualFolderCard({
  label,
  count,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  onClick: () => void;
  tone: "accent" | "muted";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "ax-card p-0 overflow-hidden text-left transition-all duration-200 hover:border-accent hover:-translate-y-1",
      )}
    >
      <div
        className={cn(
          "aspect-[4/3] flex items-center justify-center",
          tone === "accent" ? "bg-accent/10" : "bg-muted",
        )}
      >
        <Palette
          className={cn(
            "h-12 w-12",
            tone === "accent" ? "text-accent" : "text-muted-foreground",
          )}
        />
      </div>
      <div className="p-4 space-y-1">
        <div className="font-semibold leading-tight truncate">{label}</div>
        <div className="text-xs text-muted-foreground">
          {count} {count === 1 ? "design" : "designs"}
        </div>
      </div>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Inside-collection view                                                      */
/* -------------------------------------------------------------------------- */
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

function CollectionView({
  collectionId,
  onBack,
}: {
  collectionId: string;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAll = collectionId === "all";
  const isUncollected = collectionId === "uncollected";
  const isVirtual = isAll || isUncollected;

  const [collection, setCollection] = useState<{
    id: string;
    name: string;
    notes: string | null;
  } | null>(null);
  const [rows, setRows] = useState<DesignRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const marquee = useMarqueeSelection({
    selected,
    onChange: setSelected,
  });

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const collectionPromise = isVirtual
        ? Promise.resolve({ data: null, error: null })
        : supabase
            .from("design_collections")
            .select("id, name, notes")
            .eq("id", collectionId)
            .maybeSingle();

      let designsQuery = supabase
        .from("designs")
        .select(
          `id, title, status, season, campaign, primary_athlete_id, primary_team_id,
           updated_at, design_collection_id,
           primary_athlete:athletes!designs_primary_athlete_id_fkey(id, first_name, last_name, full_name)`,
        )
        .order("updated_at", { ascending: false });
      if (isUncollected) {
        designsQuery = designsQuery.is("design_collection_id", null);
      } else if (!isAll) {
        designsQuery = designsQuery.eq("design_collection_id", collectionId);
      }

      const [cRes, designsRes, athletesRes, teamsRes] = await Promise.all([
        collectionPromise,
        designsQuery,
        supabase.from("athletes").select("id, first_name, last_name, full_name").order("last_name"),
        supabase.from("teams").select("id, name").order("name"),
      ]);

      if (designsRes.error) throw designsRes.error;
      if (cRes.error) throw cRes.error;

      if (isAll) {
        setCollection({ id: "all", name: "All designs", notes: null });
      } else if (isUncollected) {
        setCollection({ id: "uncollected", name: "Uncollected", notes: null });
      } else {
        setCollection(cRes.data ?? null);
      }

      const designs = designsRes.data ?? [];
      setAthletes(
        (athletesRes.data ?? []).map((a) => ({
          id: a.id,
          name: a.full_name ?? `${a.first_name} ${a.last_name}`,
        })),
      );
      setTeams((teamsRes.data ?? []) as Array<{ id: string; name: string }>);

      // file count + primary mockup thumbs
      const ids = designs.map((d) => d.id);
      const filesByDesign = new Map<
        string,
        { count: number; primary?: { bucket: string; path: string } }
      >();
      if (ids.length) {
        const filesRes = await supabase
          .from("design_files")
          .select("design_id, file_type, is_primary, storage_bucket, storage_path, sort_order")
          .in("design_id", ids);
        (filesRes.data ?? []).forEach((f) => {
          const entry = filesByDesign.get(f.design_id) ?? { count: 0 };
          entry.count += 1;
          if (!entry.primary && (f.is_primary || f.file_type === "mockup")) {
            entry.primary = { bucket: f.storage_bucket, path: f.storage_path };
          }
          filesByDesign.set(f.design_id, entry);
        });
        // fallback: any first file if no primary set
        (filesRes.data ?? []).forEach((f) => {
          const entry = filesByDesign.get(f.design_id);
          if (entry && !entry.primary) {
            entry.primary = { bucket: f.storage_bucket, path: f.storage_path };
          }
        });
      }

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
            primary_athlete_name: a
              ? a.full_name ?? `${a.first_name} ${a.last_name}`
              : null,
            updated_at: d.updated_at,
            thumb_url: thumbMap.get(d.id) ?? null,
            file_count: info?.count ?? 0,
          };
        }),
      );
    } catch (err) {
      console.error("CollectionView load failed:", err);
      toast.error("Failed to load designs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [collectionId, isAll, isUncollected, isVirtual]);

  useEffect(() => {
    void load();
  }, [load]);

  // --- drag-drop PNG upload ---
  async function handleUpload(files: File[]) {
    if (!user) return;
    if (isVirtual) {
      toast.error("Open a real collection to upload, or use New Design.");
      return;
    }
    const pngs = files.filter((f) => f.type === "image/png");
    const rejected = files.length - pngs.length;
    if (rejected > 0) toast.error(`Skipped ${rejected} non-PNG file(s)`);
    if (!pngs.length) return;

    setUploading(true);
    try {
      const orgId = await getCurrentUserOrgId(user.id);
      if (!orgId) throw new Error("No organization");

      const { successes, failures } = await uploadDesignsBatch(
        pngs,
        orgId,
        collectionId,
      );
      if (successes.length) {
        toast.success(`Uploaded ${successes.length} design(s)`);
      }
      if (failures.length) {
        toast.error(
          `${failures.length} upload(s) failed: ${failures
            .map((f) => f.file.name)
            .join(", ")}`,
        );
      }
      void load();
    } catch (err) {
      console.error("Upload failed:", err);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const { isOver, dropProps } = useFileDropZone({
    onFiles: handleUpload,
    accept: ["image/png"],
    disabled: uploading || isVirtual,
  });

  function onPickClick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png";
    input.multiple = true;
    input.onchange = () => {
      if (input.files) void handleUpload(Array.from(input.files));
    };
    input.click();
  }

  // --- filter + paginate ---
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

  useEffect(
    () => setPage(1),
    [search, statusFilter, athleteFilter, teamFilter, seasonFilter, campaignFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" /> All collections
        </button>
      </div>

      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">
            {isVirtual ? "View" : "Collection"}
          </div>
          <h1 className="text-3xl font-bold">{collection?.name ?? "…"}</h1>
          {collection?.notes && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{collection.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isVirtual && (
            <Button
              variant="outline"
              onClick={onPickClick}
              className="gap-2"
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload PNG
            </Button>
          )}
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Design
          </Button>
        </div>
      </header>

      {/* Filters */}
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
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
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
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All athletes</SelectItem>
            {athletes.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All teams</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
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
              view === "grid"
                ? "bg-accent/15 text-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Grid
          </button>
          <button
            onClick={() => setView("table")}
            className={cn(
              "px-2 py-1.5 text-xs flex items-center gap-1 transition-colors border-l border-border",
              view === "table"
                ? "bg-accent/15 text-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <List className="h-3.5 w-3.5" /> Table
          </button>
        </div>
      </div>

      {/* Drop zone wraps the gallery */}
      <div
        {...dropProps}
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-colors min-h-[200px] p-4",
          isOver ? "border-accent bg-accent/5" : "border-transparent",
        )}
      >
        {isOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-xl pointer-events-none">
            <div className="text-center">
              <Upload className="h-10 w-10 mx-auto text-accent" />
              <p className="mt-2 font-medium">Drop PNG files to upload</p>
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

        {!loading && rows && rows.length === 0 && (
          <div className="ax-card p-12 text-center space-y-4">
            <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No designs in this {isVirtual ? "view" : "collection"} yet.
              {!isVirtual && " Drag PNG files here or use Upload PNG."}
            </p>
            <div className="flex justify-center">
              <Button onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> New Design
              </Button>
            </div>
          </div>
        )}

        {!loading && rows && rows.length > 0 && view === "grid" && (
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
                  {d.season && (
                    <div className="text-xs text-muted-foreground">{d.season}</div>
                  )}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
                    <span>
                      {d.file_count} {d.file_count === 1 ? "file" : "files"}
                    </span>
                    <span>
                      {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
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
                          <img
                            src={d.thumb_url}
                            alt=""
                            className="h-10 w-10 rounded-md object-cover"
                          />
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
                      <td className="p-3 text-muted-foreground">
                        {d.primary_athlete_name ?? "—"}
                      </td>
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
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
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
            <span className="text-muted-foreground tabular-nums">
              {page} / {totalPages}
            </span>
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

      <DesignFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={load}
        defaultCollectionId={isVirtual ? null : collectionId}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create / rename collection dialog                                          */
/* -------------------------------------------------------------------------- */
function CollectionFormDialog({
  open,
  onOpenChange,
  onSaved,
  existing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  existing?: { id: string; name: string; notes: string | null };
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isEdit = !!existing;

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? "");
      setNotes(existing?.notes ?? "");
    } else {
      setName("");
      setNotes("");
    }
  }, [open, existing]);

  async function handleSubmit() {
    if (!name.trim() || !user) return;
    setSubmitting(true);
    try {
      if (isEdit && existing) {
        const res = await supabase
          .from("design_collections")
          .update({ name: name.trim(), notes: notes.trim() || null })
          .eq("id", existing.id);
        if (res.error) {
          if (res.error.code === "23505") {
            toast.error("A collection with that name already exists");
          } else {
            throw res.error;
          }
          return;
        }
        toast.success("Collection updated");
      } else {
        const profileRes = await supabase
          .from("user_profiles")
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();
        const orgId = profileRes.data?.organization_id;
        if (!orgId) throw new Error("No organization");

        const res = await supabase
          .from("design_collections")
          .insert({ organization_id: orgId, name: name.trim(), notes: notes.trim() || null });
        if (res.error) {
          if (res.error.code === "23505") {
            toast.error("A collection with that name already exists");
          } else {
            throw res.error;
          }
          return;
        }
        toast.success("Collection created");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(isEdit ? "Failed to update collection" : "Failed to create collection");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Rename Collection" : "New Collection"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              placeholder="e.g. Rams, Falcons, Strength Club"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Textarea
              placeholder="What's in this collection…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !name.trim()}>
            {submitting ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
