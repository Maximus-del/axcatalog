// Cover image for a design template. Without one, every style renders as a
// gradient plate with its name on it — fine as a fallback, useless for telling
// Heritage from Luxury at a glance. Upload a file or paste a URL.
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Link as LinkIcon, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { setTemplateCover, templatePreviewUrl, uploadTemplateCover, type DesignTemplateFull } from "@/lib/ecosystem/commerce";
import { Input } from "@/components/ui/input";

export function TemplateCoverButton({ template }: { template: DesignTemplateFull }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  const existing = templatePreviewUrl(template);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["design-template", template.id] });
    qc.invalidateQueries({ queryKey: ["design-template-library"] });
  }

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const cover = await uploadTemplateCover(template.id, file);
      await setTemplateCover(template.id, cover);
      toast.success("Cover image set");
      refresh();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(false); }
  }

  async function saveUrl() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await setTemplateCover(template.id, { url: url.trim() });
      toast.success("Cover image set");
      setUrl("");
      refresh();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  async function clear() {
    setBusy(true);
    try {
      await setTemplateCover(template.id, null);
      toast.success("Cover removed");
      refresh();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[hsl(var(--ax-line))]"
      >
        <ImagePlus className="h-4 w-4 text-[hsl(var(--ax-accent))]" /> {existing ? "Change cover" : "Add cover"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg">Cover image</h3>
                <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
                  Shown on the {template.name} card and header. Use something that reads as this style instantly.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            {existing && (
              <img src={existing} alt="" className="w-full h-40 object-cover rounded-lg border border-[hsl(var(--ax-border))]" />
            )}

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />
            <button
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="w-full h-10 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Upload image
            </button>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="…or paste an image URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveUrl(); }}
                  className="pl-8 h-9 text-[13px]"
                />
              </div>
              <button
                onClick={saveUrl}
                disabled={busy || !url.trim()}
                className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold shrink-0 disabled:opacity-60"
              >
                Use
              </button>
            </div>

            {existing && (
              <button
                onClick={clear}
                disabled={busy}
                className="text-[12px] font-semibold text-muted-foreground hover:text-destructive inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove cover — go back to the generated plate
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
