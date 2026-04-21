// Design Library item detail — large preview + edit name/notes, move
// to a different collection, or delete (also deletes underlying file).
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ChevronLeft, ImageIcon, Loader2, Trash2 } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DesignDetail {
  id: string;
  title: string;
  notes: string | null;
  design_collection_id: string | null;
  files: Array<{
    id: string;
    storage_bucket: string;
    storage_path: string;
    file_name: string;
    is_primary: boolean;
    sort_order: number;
  }>;
}

interface CollectionOption {
  id: string;
  name: string;
}

export default function DesignLibraryItem() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const fromCollection = searchParams.get("from");
  const navigate = useNavigate();

  const [design, setDesign] = useState<DesignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [collections, setCollections] = useState<CollectionOption[]>([]);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [collectionId, setCollectionId] = useState<string>("none");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [dRes, cRes] = await Promise.all([
        supabase
          .from("designs")
          .select(
            `id, title, notes, design_collection_id,
             design_files(id, storage_bucket, storage_path, file_name, is_primary, sort_order)`,
          )
          .eq("id", id)
          .maybeSingle(),
        supabase.from("design_collections").select("id, name").order("name"),
      ]);
      if (dRes.error) throw dRes.error;
      if (cRes.error) throw cRes.error;

      const d = dRes.data;
      if (!d) throw new Error("Design not found");

      const files = ((d.design_files ?? []) as DesignDetail["files"]).slice().sort(
        (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
      );
      const detail: DesignDetail = {
        id: d.id,
        title: d.title,
        notes: d.notes,
        design_collection_id: d.design_collection_id,
        files,
      };
      setDesign(detail);
      setTitle(detail.title);
      setNotes(detail.notes ?? "");
      setCollectionId(detail.design_collection_id ?? "none");
      setCollections((cRes.data ?? []) as CollectionOption[]);

      if (files[0]) {
        const { data } = await supabase.storage
          .from(files[0].storage_bucket)
          .createSignedUrl(files[0].storage_path, 3600);
        setPreviewUrl(data?.signedUrl ?? null);
      }
    } catch (err) {
      console.error("DesignLibraryItem load failed:", err);
      toast.error("Failed to load design");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function backTo() {
    if (fromCollection) navigate(`/admin/design-library?c=${fromCollection}`);
    else navigate("/admin/design-library");
  }

  async function handleSave() {
    if (!design) return;
    if (!title.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await supabase
        .from("designs")
        .update({
          title: title.trim(),
          notes: notes.trim() || null,
          design_collection_id: collectionId === "none" ? null : collectionId,
        })
        .eq("id", design.id);
      if (res.error) throw res.error;
      toast.success("Saved");
      void load();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!design) return;
    try {
      // Delete underlying storage files
      if (design.files.length) {
        const byBucket = new Map<string, string[]>();
        design.files.forEach((f) => {
          const arr = byBucket.get(f.storage_bucket) ?? [];
          arr.push(f.storage_path);
          byBucket.set(f.storage_bucket, arr);
        });
        await Promise.all(
          Array.from(byBucket.entries()).map(([bucket, paths]) =>
            supabase.storage.from(bucket).remove(paths),
          ),
        );
      }
      // Delete the design row (design_files cascade)
      const res = await supabase.from("designs").delete().eq("id", design.id);
      if (res.error) throw res.error;
      toast.success("Design deleted");
      backTo();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!design) {
    return (
      <div className="p-6 text-center text-muted-foreground">Design not found.</div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={backTo}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="ax-card p-0 overflow-hidden bg-muted aspect-square flex items-center justify-center">
          {previewUrl ? (
            <img src={previewUrl} alt={design.title} className="w-full h-full object-contain" />
          ) : (
            <ImageIcon className="h-16 w-16 text-muted-foreground" />
          )}
        </div>

        <div className="space-y-6">
          <div className="ax-card p-5 space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                rows={4}
                placeholder="Add notes about this design…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Collection</Label>
              <Select value={collectionId} onValueChange={setCollectionId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Uncollected —</SelectItem>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>

          <div className="ax-card p-5 space-y-3">
            <div className="ax-section-header">Danger zone</div>
            <p className="text-xs text-muted-foreground">
              Deletes this design and its underlying file from storage. Cannot be undone.
            </p>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(true)}
              className="w-full text-destructive border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete design
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{design.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the design record and the PNG file from storage. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}