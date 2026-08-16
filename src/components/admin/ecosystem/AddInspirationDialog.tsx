// Inspiration: what we looked at, stored apart from what we made.
//
// Same upload behaviour as everywhere else — drop, paste, browse, or drag an
// image straight from another tab. Kept out of mockups deliberately: this is
// reference material, and it should never end up in a client-facing collection.
import { useState } from "react";
import { Loader2, X, Lightbulb, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { addInspirationFile, addInspirationUrl } from "@/lib/ecosystem/board";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { CHECKERBOARD } from "@/components/admin/ecosystem/ImageLightbox";
import { Input } from "@/components/ui/input";

interface Draft { file: File; title: string; preview: string }

export function AddInspirationDialog({
  entity, onClose, onCreated,
}: {
  entity: { id: string; organization_id: string; name: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  function addFiles(files: File[]) {
    setDrafts((prev) => [
      ...prev,
      ...files.map((file) => ({
        file,
        title: file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Inspiration",
        preview: URL.createObjectURL(file),
      })),
    ]);
  }

  const { isOver, dropProps } = useFileDropZone({
    onFiles: addFiles,
    onUrls: (u) => setUrls((prev) => Array.from(new Set([...prev, ...u]))),
    accept: ["image/"],
    paste: true,
  });

  const total = drafts.length + urls.length;

  async function save() {
    if (total === 0) return;
    setSaving(true);
    setProgress(0);
    try {
      let done = 0;
      for (const [i, d] of drafts.entries()) {
        await addInspirationFile({
          organization_id: entity.organization_id,
          athlete_id: entity.id,
          file: d.file,
          title: d.title.trim(),
          sort_order: i,
        });
        setProgress(++done);
      }
      for (const u of urls) {
        await addInspirationUrl({
          organization_id: entity.organization_id,
          athlete_id: entity.id,
          url: u,
          source_url: u,
        });
        setProgress(++done);
      }
      toast.success(`${total} added to inspiration`);
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">Add inspiration</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
              Reference imagery for {entity.name} — what you're drawing from, kept so you can check the finished work
              didn't land too close to it. Internal only.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div
          {...dropProps}
          className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
            isOver ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]" : "border-[hsl(var(--ax-border))]"
          }`}
        >
          <Lightbulb className="h-6 w-6 mx-auto text-[hsl(var(--ax-faint))]" />
          <p className="text-[13px] text-muted-foreground mt-2">
            Drop images, paste with Ctrl+V, or drag one straight from another tab
          </p>
          <label className="inline-block mt-2 text-[12px] font-semibold text-[hsl(var(--ax-accent))] cursor-pointer">
            or browse
            <input
              type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
            />
          </label>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Paste an image URL…"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && urlDraft.trim()) {
                  setUrls((prev) => Array.from(new Set([...prev, urlDraft.trim()])));
                  setUrlDraft("");
                }
              }}
              className="pl-8 h-9 text-[13px]"
            />
          </div>
        </div>

        {(drafts.length > 0 || urls.length > 0) && (
          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {drafts.map((d, i) => (
              <div key={`f${i}`} className="flex items-center gap-3">
                <span className="h-12 w-12 rounded overflow-hidden border border-[hsl(var(--ax-border))] shrink-0" style={CHECKERBOARD}>
                  <img src={d.preview} alt="" className="h-full w-full object-cover" />
                </span>
                <Input
                  value={d.title}
                  onChange={(e) => setDrafts((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  className="h-9 text-[13px]"
                />
                <button onClick={() => setDrafts((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {urls.map((u, i) => (
              <div key={`u${i}`} className="flex items-center gap-3">
                <span className="h-12 w-12 rounded overflow-hidden border border-[hsl(var(--ax-border))] shrink-0" style={CHECKERBOARD}>
                  <img src={u} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="text-[12px] text-muted-foreground truncate flex-1">{u}</span>
                <button onClick={() => setUrls((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-muted-foreground">
            {saving ? `Saving ${progress} of ${total}…` : `${total} item${total === 1 ? "" : "s"}`}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
            <button
              onClick={save}
              disabled={saving || total === 0}
              className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />} Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
