// Mobile-first. Test at 375px before merging.
//
// Modal for uploading a product video.
//   1. User picks a file (.mp4, .mov, .webm)
//   2. We auto-extract the first frame as a JPEG thumbnail (client-side)
//   3. User fills title / description / type / visibility toggles
//   4. On submit:
//      - upload thumbnail to product-videos/{product_id}/thumbs/{uuid}.jpg
//      - upload video    to product-videos/{product_id}/{uuid}.{ext}
//      - insert product_videos row
import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { extractFirstFrame } from "@/lib/video-thumb";

const VIDEO_BUCKET = "product-videos";
const VIDEO_TYPES: Array<{ value: string; label: string }> = [
  { value: "promo", label: "Promo" },
  { value: "unboxing", label: "Unboxing" },
  { value: "athlete_wearing", label: "Athlete wearing" },
  { value: "behind_scenes", label: "Behind the scenes" },
  { value: "other", label: "Other" },
];
const ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm";

interface Props {
  open: boolean;
  productId: string;
  organizationId: string;
  onOpenChange: (o: boolean) => void;
  onUploaded: () => void;
}

function uuid() {
  // Cheap random id — not cryptographic, just unique-enough for filenames
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function VideoUploadDialog({
  open,
  productId,
  organizationId,
  onOpenChange,
  onUploaded,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [thumbBlob, setThumbBlob] = useState<Blob | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoType, setVideoType] = useState("promo");
  const [visibleToAthlete, setVisibleToAthlete] = useState(true);
  const [visibleOnStorefront, setVisibleOnStorefront] = useState(false);

  // Reset state on open/close
  useEffect(() => {
    if (!open) {
      setFile(null);
      setThumbBlob(null);
      if (thumbPreview) URL.revokeObjectURL(thumbPreview);
      setThumbPreview(null);
      setDuration(null);
      setTitle("");
      setDescription("");
      setVideoType("promo");
      setVisibleToAthlete(true);
      setVisibleOnStorefront(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handlePick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    setExtracting(true);
    const result = await extractFirstFrame(f, { maxWidth: 800 });
    setExtracting(false);
    if (result) {
      setThumbBlob(result.blob);
      const url = URL.createObjectURL(result.blob);
      if (thumbPreview) URL.revokeObjectURL(thumbPreview);
      setThumbPreview(url);
      setDuration(result.durationSec);
    } else {
      // Auto-extract failed silently — upload can still proceed without poster
      setThumbBlob(null);
      setThumbPreview(null);
      toast.warning("Could not auto-extract a thumbnail — video will upload without a poster.");
    }
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const id = uuid();
      const ext = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "mp4";
      const videoPath = `${productId}/${id}.${ext}`;
      const thumbPath = `${productId}/thumbs/${id}.jpg`;

      const { error: vErr } = await supabase.storage
        .from(VIDEO_BUCKET)
        .upload(videoPath, file, { contentType: file.type || "video/mp4", upsert: false });
      if (vErr) {
        toast.error(`Video upload failed: ${vErr.message}`);
        setUploading(false);
        return;
      }

      let storedThumbPath: string | null = null;
      if (thumbBlob) {
        const { error: tErr } = await supabase.storage
          .from(VIDEO_BUCKET)
          .upload(thumbPath, thumbBlob, { contentType: "image/jpeg", upsert: false });
        if (tErr) {
          // non-fatal — video is already uploaded; just skip the thumbnail
          console.warn("Thumbnail upload failed:", tErr);
        } else {
          storedThumbPath = thumbPath;
        }
      }

      const { error: insErr } = await supabase.from("product_videos").insert({
        organization_id: organizationId,
        product_id: productId,
        storage_bucket: VIDEO_BUCKET,
        storage_path: videoPath,
        thumbnail_path: storedThumbPath,
        title: title.trim() || file.name,
        description: description.trim() || null,
        video_type: videoType,
        duration_seconds: duration,
        visible_to_athlete: visibleToAthlete,
        visible_on_storefront: visibleOnStorefront,
        sort_order: 0,
      });
      if (insErr) {
        // Rollback storage so we don't leak orphan files
        await supabase.storage
          .from(VIDEO_BUCKET)
          .remove(storedThumbPath ? [videoPath, storedThumbPath] : [videoPath]);
        toast.error(`Failed to save video metadata: ${insErr.message}`);
        setUploading(false);
        return;
      }

      toast.success("Video uploaded");
      onUploaded();
      onOpenChange(false);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload video</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!file ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full ax-card p-8 text-center border-dashed hover:border-accent hover:bg-accent/5 transition-colors space-y-2"
            >
              <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
              <div className="text-sm font-medium">Pick a video file</div>
              <div className="text-xs text-muted-foreground">.mp4, .mov, or .webm</div>
            </button>
          ) : (
            <div className="ax-card p-3 flex items-start gap-3">
              <div className="relative w-24 h-24 shrink-0 rounded-md overflow-hidden bg-muted">
                {thumbPreview ? (
                  <img src={thumbPreview} alt="Thumbnail" className="w-full h-full object-cover" />
                ) : extracting ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground text-center px-1">
                    No thumbnail
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                  {duration != null && ` • ${duration}s`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setThumbBlob(null);
                  if (thumbPreview) URL.revokeObjectURL(thumbPreview);
                  setThumbPreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => handlePick(e.target.files)}
          />

          <div className="space-y-1.5">
            <Label htmlFor="vid-title">Title</Label>
            <Input
              id="vid-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Athlete unboxing — Mooney drop 1"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vid-desc">Description (optional)</Label>
            <Textarea
              id="vid-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Video type</Label>
            <Select value={videoType} onValueChange={setVideoType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIDEO_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="flex items-center justify-between p-3 ax-card cursor-pointer">
              <div>
                <div className="text-sm font-medium">Visible to athlete</div>
                <div className="text-xs text-muted-foreground">
                  Athletes assigned to this product can see this video.
                </div>
              </div>
              <Switch checked={visibleToAthlete} onCheckedChange={setVisibleToAthlete} />
            </label>
            <label className="flex items-center justify-between p-3 ax-card cursor-pointer">
              <div>
                <div className="text-sm font-medium">Visible on storefront</div>
                <div className="text-xs text-muted-foreground">
                  Future use — push to Shopify product page.
                </div>
              </div>
              <Switch checked={visibleOnStorefront} onCheckedChange={setVisibleOnStorefront} />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!file || uploading || extracting}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…
              </>
            ) : (
              "Upload video"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
// Required to satisfy organizationId in callers — we read it from products.
export type { Props as VideoUploadDialogProps };
