// Mobile-first. Test at 375px before merging.
//
// Videos tab: list of product_videos for this product. Each tile uses
// the lazy-loaded VideoPlayer (poster-only until tap). Admin can edit
// metadata, delete, or change visibility.
import { useEffect, useState } from "react";
import { Edit3, Loader2, Plus, Trash2, Video as VideoIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { toast } from "sonner";
import { getSignedUrl } from "@/lib/storage";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { VideoUploadDialog } from "./VideoUploadDialog";

interface VideoRow {
  id: string;
  title: string | null;
  description: string | null;
  storage_bucket: string;
  storage_path: string;
  thumbnail_path: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  video_type: string | null;
  visible_to_athlete: boolean | null;
  visible_on_storefront: boolean | null;
  sort_order: number | null;
  created_at: string;
}

interface Props {
  productId: string;
  organizationId: string;
  onCountChange?: (n: number) => void;
}

const TYPE_LABELS: Record<string, string> = {
  promo: "Promo",
  unboxing: "Unboxing",
  athlete_wearing: "Athlete wearing",
  behind_scenes: "Behind the scenes",
  other: "Other",
};

function fmtDuration(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function VideosTab({ productId, organizationId, onCountChange }: Props) {
  const [rows, setRows] = useState<VideoRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VideoRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VideoRow | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_videos")
      .select(
        "id, title, description, storage_bucket, storage_path, thumbnail_path, duration_seconds, video_type, visible_to_athlete, visible_on_storefront, sort_order, created_at",
      )
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }
    const mapped: VideoRow[] = await Promise.all(
      (data ?? []).map(async (r) => {
        let thumb: string | null = null;
        if (r.thumbnail_path) {
          thumb = await getSignedUrl(r.storage_bucket, r.thumbnail_path, 3600);
        }
        return { ...r, thumbnail_url: thumb } as VideoRow;
      }),
    );
    setRows(mapped);
    onCountChange?.(mapped.length);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function handleDelete(row: VideoRow) {
    setDeleteTarget(null);
    const paths = [row.storage_path];
    if (row.thumbnail_path) paths.push(row.thumbnail_path);
    // Best-effort storage cleanup, then DB delete
    await supabase.storage.from(row.storage_bucket).remove(paths);
    const { error } = await supabase.from("product_videos").delete().eq("id", row.id);
    if (error) {
      toast.error("Failed to delete video");
      return;
    }
    toast.success("Video deleted");
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Athlete-facing and behind-the-scenes videos. Stored privately in the{" "}
          <code className="text-xs">product-videos</code> bucket.
        </p>
        <Button onClick={() => setUploadOpen(true)} className="gap-2 h-10">
          <Plus className="h-4 w-4" /> Upload video
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-video rounded-lg" />
          ))}
        </div>
      ) : rows && rows.length === 0 ? (
        <div className="ax-card p-12 text-center space-y-3">
          <VideoIcon className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No videos uploaded yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(rows ?? []).map((v, i) => (
            <div
              key={v.id}
              className="ax-card p-3 space-y-3 stagger-fade"
              style={{ ["--i" as string]: i }}
            >
              <VideoPlayer
                bucket={v.storage_bucket}
                path={v.storage_path}
                poster={v.thumbnail_url}
                title={v.title}
              />
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium truncate" title={v.title ?? ""}>
                    {v.title ?? "Untitled"}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditTarget(v)}
                      aria-label="Edit"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(v)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[10px]">
                  {v.video_type && (
                    <span className="inline-flex px-1.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/20 capitalize">
                      {TYPE_LABELS[v.video_type] ?? v.video_type}
                    </span>
                  )}
                  {v.duration_seconds != null && (
                    <span className="text-muted-foreground tabular-nums">
                      {fmtDuration(v.duration_seconds)}
                    </span>
                  )}
                  {!v.visible_to_athlete && (
                    <span className="inline-flex px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                      Hidden from athlete
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <VideoUploadDialog
        open={uploadOpen}
        productId={productId}
        organizationId={organizationId}
        onOpenChange={setUploadOpen}
        onUploaded={load}
      />

      <EditVideoDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={load}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the video file and metadata. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───── Edit metadata dialog ───── */

interface EditDialogProps {
  target: VideoRow | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditVideoDialog({ target, onClose, onSaved }: EditDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoType, setVideoType] = useState("promo");
  const [visibleToAthlete, setVisibleToAthlete] = useState(true);
  const [visibleOnStorefront, setVisibleOnStorefront] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setTitle(target.title ?? "");
      setDescription(target.description ?? "");
      setVideoType(target.video_type ?? "promo");
      setVisibleToAthlete(target.visible_to_athlete ?? true);
      setVisibleOnStorefront(target.visible_on_storefront ?? false);
    }
  }, [target]);

  async function save() {
    if (!target) return;
    setSaving(true);
    const { error } = await supabase
      .from("product_videos")
      .update({
        title: title.trim() || null,
        description: description.trim() || null,
        video_type: videoType,
        visible_to_athlete: visibleToAthlete,
        visible_on_storefront: visibleOnStorefront,
      })
      .eq("id", target.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Video updated");
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit video</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={videoType} onValueChange={setVideoType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center justify-between p-3 ax-card cursor-pointer">
            <span className="text-sm">Visible to athlete</span>
            <Switch checked={visibleToAthlete} onCheckedChange={setVisibleToAthlete} />
          </label>
          <label className="flex items-center justify-between p-3 ax-card cursor-pointer">
            <span className="text-sm">Visible on storefront</span>
            <Switch checked={visibleOnStorefront} onCheckedChange={setVisibleOnStorefront} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
