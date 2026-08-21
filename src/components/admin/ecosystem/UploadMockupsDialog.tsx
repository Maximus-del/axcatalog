// Mockups: presentation imagery that isn't a product.
//
// Flat lays, on-model shots, lookbook frames. They live in their own private
// bucket and are attached to the entity, so they can exist before any product
// does — and a product can borrow one later without the image being re-uploaded.
import { useState } from "react";
import { Loader2, X, Images, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { CHECKERBOARD } from "@/components/admin/ecosystem/ImageLightbox";
import { PngCreationPanel } from "@/components/admin/ecosystem/PngCreationPanel";
import { Input } from "@/components/ui/input";

const SHOT_TYPES = ["flat_lay", "model_front", "model_back", "detail_close_up", "lookbook", "action", "other"] as const;

interface Draft { file: File; title: string; preview: string }

export function UploadMockupsDialog({
  entity, onClose, onCreated,
}: {
  entity: { id: string; organization_id: string; name: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [shotType, setShotType] = useState<string>("flat_lay");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  function addFiles(files: File[]) {
    setDrafts((prev) => [
      ...prev,
      ...files.map((file) => ({
        file,
        title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Mockup",
        preview: URL.createObjectURL(file),
      })),
    ]);
  }

  const { isOver, dropProps } = useFileDropZone({ onFiles: addFiles, accept: ["image/"], paste: true });

  async function save() {
    if (drafts.length === 0) return;
    setSaving(true);
    setProgress(0);
    try {
      for (const [i, d] of drafts.entries()) {
        // The row comes first: storage policy keys off the mockup id in the path.
        const { data, error } = await supabase
          .from("mockups" as never)
          .insert({
            organization_id: entity.organization_id,
            athlete_id: entity.id,
            title: d.title.trim() || "Mockup",
            shot_type: shotType,
            status: "draft",
            storage_bucket: "mockups",
            storage_path: "",
            file_name: d.file.name,
            file_type: d.file.type,
            file_size: d.file.size,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        const mockupId = (data as unknown as { id: string }).id;

        try {
          const ext = d.file.name.split(".").pop()?.toLowerCase() || "png";
          const path = `${mockupId}/${crypto.randomUUID()}.${ext}`;
          const up = await supabase.storage.from("mockups").upload(path, d.file);
          if (up.error) throw up.error;
          const linked = await supabase.from("mockups" as never).update({ storage_path: path } as never).eq("id", mockupId);
          if (linked.error) throw linked.error;
        } catch (inner) {
          // A mockup row with no file is just a broken thumbnail — don't keep it.
          await supabase.from("mockups" as never).delete().eq("id", mockupId);
          throw inner;
        }
        setProgress(i + 1);
      }
      toast.success(`${drafts.length} mockup${drafts.length === 1 ? "" : "s"} uploaded`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">Upload mockups</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
              Presentation imagery for {entity.name} — flat lays, on-model shots, lookbook frames. Drop, browse, or paste
              with Ctrl+V.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">Shot type</div>
          <div className="flex flex-wrap gap-1.5">
            {SHOT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setShotType(t)}
                className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border capitalize ${
                  shotType === t
                    ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                    : "border-[hsl(var(--ax-border))] text-muted-foreground"
                }`}
              >
                {t.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>

        <PngCreationPanel
          organizationId={entity.organization_id}
          designName={drafts.length === 1 ? drafts[0].title : undefined}
        />

        <div
          {...dropProps}
          className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
            isOver ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]" : "border-[hsl(var(--ax-border))]"
          }`}
        >
          <Images className="h-6 w-6 mx-auto text-[hsl(var(--ax-faint))]" />
          <p className="text-[13px] text-muted-foreground mt-2">Drop mockups here, or paste with Ctrl+V</p>
          <label className="inline-block mt-2 text-[12px] font-semibold text-[hsl(var(--ax-accent))] cursor-pointer">
            or browse
            <input
              type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
            />
          </label>
        </div>

        {drafts.length > 0 && (
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {drafts.map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="h-14 w-14 rounded overflow-hidden border border-[hsl(var(--ax-border))] shrink-0" style={CHECKERBOARD}>
                  <img src={d.preview} alt="" className="h-full w-full object-contain" />
                </span>
                <Input
                  value={d.title}
                  onChange={(e) => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  className="h-9 text-[13px]"
                />
                <button
                  onClick={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-muted-foreground">
            {saving ? `Uploading ${progress} of ${drafts.length}…` : `${drafts.length} mockup${drafts.length === 1 ? "" : "s"}`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
            <button
              onClick={save}
              disabled={saving || drafts.length === 0}
              className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Save mockups
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
