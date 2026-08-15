// Reference Sets — curated groups of examples, picked once and reused, instead
// of hunting down individual images for every generation. Images can be
// uploaded or pasted as links, because early-stage references usually start as
// links and only get curated into uploads once a set proves itself.
import { useRef, useState } from "react";
import { Images, Plus, Trash2, Loader2, Link as LinkIcon, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  addReferenceImageUrl,
  createReferenceSet,
  deleteReferenceSet,
  referenceImageUrl,
  removeReferenceImage,
  uploadReferenceImage,
  type ReferenceSet,
} from "@/lib/ecosystem/creative";
import { useReferenceSets } from "@/hooks/useCreative";
import { getCurrentOrgId } from "@/hooks/useTasks";
import { useAuth } from "@/auth/AuthProvider";
import { Input } from "@/components/ui/input";

export function ReferenceSetsCard({ templateId, referencePolicy }: { templateId: string; referencePolicy: string }) {
  const qc = useQueryClient();
  const { data: sets = [], isLoading } = useReferenceSets(templateId);
  const [open, setOpen] = useState(false);

  const total = sets.reduce((n, s) => n + s.images.length, 0);

  return (
    <section className="ax-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">References</h2>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
            Curated sets, chosen at generation time instead of re-picking images.
          </p>
        </div>
        <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
          referencePolicy === "required"
            ? "bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))]"
            : "text-[hsl(var(--ax-faint))] border border-[hsl(var(--ax-border))]"
        }`}>
          {referencePolicy}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">{total}</span>
        <span className="text-[12px] text-muted-foreground">
          image{total === 1 ? "" : "s"} across {sets.length} set{sets.length === 1 ? "" : "s"}
        </span>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground mt-3">Loading…</div>
      ) : sets.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">
          No reference sets yet. Build one — "Classic", "Vintage", "Mascot" — and pick it at generation time.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {sets.slice(0, 3).map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <div className="flex -space-x-2 shrink-0">
                {s.images.slice(0, 4).map((img) => {
                  const url = referenceImageUrl(img);
                  return url ? (
                    <img key={img.id} src={url} alt="" className="h-7 w-7 rounded object-cover border border-[hsl(var(--ax-border))]" />
                  ) : null;
                })}
                {s.images.length === 0 && <span className="h-7 w-7 rounded bg-[hsl(var(--ax-line))]" />}
              </div>
              <span className="text-[13px] font-semibold truncate flex-1">{s.name}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{s.images.length}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(true)}
        className="mt-4 h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5"
      >
        <Images className="h-3.5 w-3.5" /> Manage sets
      </button>

      {open && <ReferenceSetsManager templateId={templateId} sets={sets} onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["reference-sets", templateId] }); }} />}
    </section>
  );
}

function ReferenceSetsManager({ templateId, sets, onClose }: { templateId: string; sets: ReferenceSet[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = () => qc.invalidateQueries({ queryKey: ["reference-sets", templateId] });

  async function addSet() {
    if (newName.trim().length < 2) return;
    setBusy("new");
    try {
      const orgId = await getCurrentOrgId();
      if (!orgId) { toast.error("No organization on your profile."); return; }
      await createReferenceSet({ organization_id: orgId, template_id: templateId, name: newName, created_by: user?.id ?? null });
      setNewName("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(null); }
  }

  async function addUrl(setId: string) {
    const url = (urlDraft[setId] ?? "").trim();
    if (!url) return;
    setBusy(setId);
    try {
      const orgId = await getCurrentOrgId();
      if (!orgId) return;
      await addReferenceImageUrl({ organization_id: orgId, reference_set_id: setId, url });
      setUrlDraft((d) => ({ ...d, [setId]: "" }));
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(null); }
  }

  async function upload(setId: string, files: FileList | null) {
    if (!files?.length) return;
    setBusy(setId);
    try {
      const orgId = await getCurrentOrgId();
      if (!orgId) return;
      for (const file of Array.from(files)) {
        await uploadReferenceImage({ organization_id: orgId, reference_set_id: setId, file });
      }
      toast.success(`${files.length} image${files.length === 1 ? "" : "s"} uploaded`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg">Reference sets</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))]">Paste links or upload files. 3–5 strong examples beats 20 loose ones.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex gap-2">
          <Input placeholder="New set name — e.g. Vintage Collegiate" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button
            onClick={addSet}
            disabled={busy === "new" || newName.trim().length < 2}
            className="h-10 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[13px] font-bold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-60"
          >
            {busy === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>

        <div className="space-y-4 max-h-[55vh] overflow-y-auto">
          {sets.map((s) => (
            <div key={s.id} className="border border-[hsl(var(--ax-border))] rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-sm">{s.name}</div>
                <button
                  onClick={async () => { await deleteReferenceSet(s.id); refresh(); }}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Delete set"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {s.images.length > 0 && (
                <div className="grid grid-cols-6 gap-2 mt-2">
                  {s.images.map((img) => {
                    const url = referenceImageUrl(img);
                    return (
                      <div key={img.id} className="relative group aspect-square">
                        {url ? (
                          <img src={url} alt="" className="h-full w-full object-cover rounded border border-[hsl(var(--ax-border))]" />
                        ) : (
                          <div className="h-full w-full rounded bg-[hsl(var(--ax-line))]" />
                        )}
                        <button
                          onClick={async () => { await removeReferenceImage(img.id); refresh(); }}
                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
                          aria-label="Remove image"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2 mt-2">
                <div className="relative flex-1">
                  <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Paste image URL…"
                    value={urlDraft[s.id] ?? ""}
                    onChange={(e) => setUrlDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter") addUrl(s.id); }}
                    className="pl-8 h-9 text-[13px]"
                  />
                </div>
                <input
                  ref={(el) => { fileInputs.current[s.id] = el; }}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => upload(s.id, e.target.files)}
                />
                <button
                  onClick={() => fileInputs.current[s.id]?.click()}
                  disabled={busy === s.id}
                  className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-60"
                >
                  {busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
                </button>
              </div>
            </div>
          ))}
          {sets.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No sets yet.</p>}
        </div>
      </div>
    </div>
  );
}
