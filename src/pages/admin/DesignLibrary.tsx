// Design Library — folder/collection view of artwork PNGs.
//
// /admin/design-library                  → grid of collections
// /admin/design-library?c=<collectionId> → designs inside that collection
//
// Designs here use the existing `designs` + `design_files` tables, scoped by
// the new `design_collection_id` foreign key on `designs`. Files are PNGs in
// the private `design-files` bucket; we resolve thumbs via signed URLs.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronLeft,
  FolderOpen,
  FolderPlus,
  ImageIcon,
  Loader2,
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
import { useAuth } from "@/auth/AuthProvider";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";

const DESIGN_BUCKET = "design-files";

interface CollectionRow {
  id: string;
  name: string;
  notes: string | null;
  design_count: number;
  cover_url: string | null;
}

interface DesignRow {
  id: string;
  title: string;
  thumb_url: string | null;
}

export default function DesignLibrary() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const collectionId = searchParams.get("c");

  if (collectionId) {
    return <CollectionView collectionId={collectionId} onBack={() => setSearchParams({})} />;
  }
  return <CollectionsGrid onOpen={(id) => setSearchParams({ c: id })} />;
}

/* -------------------------------------------------------------------------- */
/* Collections grid                                                           */
/* -------------------------------------------------------------------------- */
function CollectionsGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<CollectionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CollectionRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const cRes = await supabase
        .from("design_collections")
        .select("id, name, notes, created_at")
        .order("name");
      if (cRes.error) throw cRes.error;
      const collections = cRes.data ?? [];

      // counts + cover thumbs
      const ids = collections.map((c) => c.id);
      const countMap = new Map<string, number>();
      const coverMap = new Map<string, { bucket: string; path: string }>();
      if (ids.length) {
        const dRes = await supabase
          .from("designs")
          .select(
            `id, design_collection_id, updated_at,
             design_files(storage_bucket, storage_path, is_primary, sort_order)`,
          )
          .in("design_collection_id", ids)
          .order("updated_at", { ascending: false });

        (dRes.data ?? []).forEach((d) => {
          const cid = d.design_collection_id as string;
          countMap.set(cid, (countMap.get(cid) ?? 0) + 1);
          if (!coverMap.has(cid)) {
            const files = (d.design_files ?? []) as Array<{
              storage_bucket: string;
              storage_path: string;
              is_primary: boolean;
              sort_order: number;
            }>;
            const sorted = [...files].sort(
              (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
            );
            if (sorted[0]) {
              coverMap.set(cid, {
                bucket: sorted[0].storage_bucket,
                path: sorted[0].storage_path,
              });
            }
          }
        });
      }

      // signed URLs for covers
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
      console.error("DesignLibrary load failed:", err);
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
      `Deleted "${deleteTarget.name}". ${deleteTarget.design_count} design(s) are now uncollected.`,
    );
    setDeleteTarget(null);
    void load();
  }

  const isEmpty = !loading && rows && rows.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Catalog</div>
          <h1 className="text-3xl font-bold">Design Library</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize your artwork into folders. Drag-and-drop PNG files into a collection to upload.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <FolderPlus className="h-4 w-4" /> New Collection
        </Button>
      </header>

      {!isEmpty && (
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
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-4">
          <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">
            No collections yet. Create your first collection to start organizing artwork.
          </p>
          <div className="flex justify-center">
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <FolderPlus className="h-4 w-4" /> New Collection
            </Button>
          </div>
        </div>
      )}

      {!loading && rows && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(c);
                }}
                className="absolute top-2 right-2 h-8 w-8 rounded-md bg-background/80 border border-border flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                title="Delete collection"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full ax-card p-8 text-center text-sm text-muted-foreground">
              No collections match your search.
            </div>
          )}
        </div>
      )}

      <CreateCollectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void load()}
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

/* -------------------------------------------------------------------------- */
/* Inside-collection view                                                     */
/* -------------------------------------------------------------------------- */
function CollectionView({ collectionId, onBack }: { collectionId: string; onBack: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [collection, setCollection] = useState<{ id: string; name: string; notes: string | null } | null>(
    null,
  );
  const [designs, setDesigns] = useState<DesignRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, dRes] = await Promise.all([
        supabase
          .from("design_collections")
          .select("id, name, notes")
          .eq("id", collectionId)
          .maybeSingle(),
        supabase
          .from("designs")
          .select(
            `id, title, updated_at,
             design_files(storage_bucket, storage_path, is_primary, sort_order, mime_type)`,
          )
          .eq("design_collection_id", collectionId)
          .order("updated_at", { ascending: false }),
      ]);
      if (cRes.error) throw cRes.error;
      if (dRes.error) throw dRes.error;
      setCollection(cRes.data ?? null);

      const ds = dRes.data ?? [];
      const thumbInputs: Array<{ designId: string; bucket: string; path: string }> = [];
      ds.forEach((d) => {
        const files = (d.design_files ?? []) as Array<{
          storage_bucket: string;
          storage_path: string;
          is_primary: boolean;
          sort_order: number;
        }>;
        const sorted = [...files].sort(
          (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
        );
        if (sorted[0]) {
          thumbInputs.push({
            designId: d.id,
            bucket: sorted[0].storage_bucket,
            path: sorted[0].storage_path,
          });
        }
      });

      const thumbMap = new Map<string, string>();
      await Promise.all(
        thumbInputs.map(async (t) => {
          const { data } = await supabase.storage.from(t.bucket).createSignedUrl(t.path, 3600);
          if (data?.signedUrl) thumbMap.set(t.designId, data.signedUrl);
        }),
      );

      setDesigns(
        ds.map((d) => ({
          id: d.id,
          title: d.title,
          thumb_url: thumbMap.get(d.id) ?? null,
        })),
      );
    } catch (err) {
      console.error("CollectionView load failed:", err);
      toast.error("Failed to load collection");
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUpload(files: File[]) {
    if (!user || !collection) return;
    const pngs = files.filter((f) => f.type === "image/png");
    const rejected = files.length - pngs.length;
    if (rejected > 0) toast.error(`Skipped ${rejected} non-PNG file(s)`);
    if (!pngs.length) return;

    setUploading(true);
    try {
      const profileRes = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();
      const orgId = profileRes.data?.organization_id;
      if (!orgId) throw new Error("No organization");

      let createdCount = 0;
      for (const file of pngs) {
        const baseName = file.name.replace(/\.[^.]+$/, "");
        const title = baseName || "Untitled";

        const designRes = await supabase
          .from("designs")
          .insert({
            organization_id: orgId,
            title,
            slug: `${slugify(title)}-${Date.now().toString(36)}`,
            status: "concept",
            design_collection_id: collectionId,
          })
          .select("id")
          .single();
        if (designRes.error) throw designRes.error;
        const designId = designRes.data.id;

        const path = `${orgId}/${designId}/${Date.now()}-${file.name}`;
        const upRes = await supabase.storage.from(DESIGN_BUCKET).upload(path, file, {
          contentType: "image/png",
          upsert: false,
        });
        if (upRes.error) throw upRes.error;

        const fileRes = await supabase.from("design_files").insert({
          design_id: designId,
          file_type: "mockup",
          storage_bucket: DESIGN_BUCKET,
          storage_path: path,
          file_name: file.name,
          file_extension: "png",
          mime_type: "image/png",
          file_size_bytes: file.size,
          is_primary: true,
        });
        if (fileRes.error) throw fileRes.error;
        createdCount++;
      }
      toast.success(`Uploaded ${createdCount} design(s)`);
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
    disabled: uploading,
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
          <div className="ax-section-header mb-2">Collection</div>
          <h1 className="text-3xl font-bold">{collection?.name ?? "…"}</h1>
          {collection?.notes && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{collection.notes}</p>
          )}
        </div>
        <Button onClick={onPickClick} className="gap-2" disabled={uploading}>
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Upload PNG
        </Button>
      </header>

      <div
        {...dropProps}
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-colors min-h-[200px] p-4",
          isOver
            ? "border-accent bg-accent/5"
            : "border-border",
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-lg" />
            ))}
          </div>
        )}

        {!loading && designs && designs.length === 0 && (
          <div className="text-center py-16 space-y-3">
            <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No designs in this collection yet. Drag PNG files here or use the upload button.
            </p>
          </div>
        )}

        {!loading && designs && designs.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {designs.map((d) => (
              <button
                key={d.id}
                onClick={() => navigate(`/admin/design-library/item/${d.id}?from=${collectionId}`)}
                className="ax-card p-0 overflow-hidden text-left transition-all duration-200 hover:border-accent hover:-translate-y-1 group"
              >
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {d.thumb_url ? (
                    <img
                      src={d.thumb_url}
                      alt={d.title}
                      className="w-full h-full object-contain transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="p-3">
                  <div className="text-sm font-medium truncate">{d.title}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create-collection dialog                                                   */
/* -------------------------------------------------------------------------- */
function CreateCollectionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setNotes("");
    }
  }, [open]);

  async function handleCreate() {
    if (!name.trim() || !user) return;
    setSubmitting(true);
    try {
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
      onCreated();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create collection");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Collection</DialogTitle>
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
                  void handleCreate();
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
          <Button onClick={handleCreate} disabled={submitting || !name.trim()}>
            {submitting ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}