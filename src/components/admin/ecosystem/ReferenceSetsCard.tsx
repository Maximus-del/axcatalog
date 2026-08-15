// Reference Sets — each one is a sub-style of the template (Classic / Mascot /
// Vintage Collegiate), so each carries its own Primary + Backup prompts, its own
// style notes, and its own marked-recommended images. The card shows which sets
// are actually production-ready; the manager is where the work happens.
import { useMemo, useRef, useState } from "react";
import {
  Images, Plus, Trash2, Loader2, Link as LinkIcon, Upload, X, Star, ChevronDown, ChevronRight,
  Copy, Check, Pencil, Wand2, ArrowUpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEPENDENCY_LABELS,
  SET_PROMPT_ROLES,
  STYLE_NOTE_FIELDS,
  addReferenceImageUrl,
  createReferenceSet,
  deleteReferenceSet,
  draftPromptFromNotes,
  nextPromptVersion,
  pickSetPrompt,
  referenceImageUrl,
  referenceSetReadiness,
  removeReferenceImage,
  savePromptVersion,
  setCurrentBestSetPrompt,
  setImageRecommended,
  setMasterCandidate,
  updateReferenceSet,
  uploadReferenceImage,
  type PromptRole,
  type ReferenceDependency,
  type ReferenceSet,
  type StyleNotes,
  type TemplatePrompt,
} from "@/lib/ecosystem/creative";
import { useReferenceSets, useTemplatePrompts } from "@/hooks/useCreative";
import { getCurrentOrgId } from "@/hooks/useTasks";
import { useAuth } from "@/auth/AuthProvider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ReferenceSetsCard({ templateId, templateName, referencePolicy }: { templateId: string; templateName: string; referencePolicy: string }) {
  const { data: sets = [], isLoading } = useReferenceSets(templateId);
  const { data: prompts = [] } = useTemplatePrompts(templateId);
  const [open, setOpen] = useState(false);

  const total = sets.reduce((n, s) => n + s.images.length, 0);

  return (
    <section className="ax-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">References</h2>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
            Each set is a sub-style with its own prompts.
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
          No reference sets yet. Build one — "Classic", "Vintage", "Mascot" — and give it a Primary and Backup prompt.
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {sets.map((s) => {
            const r = referenceSetReadiness(s, prompts);
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div className="flex -space-x-2 shrink-0">
                  {s.images.slice(0, 3).map((img) => {
                    const url = referenceImageUrl(img);
                    return url ? (
                      <img key={img.id} src={url} alt="" className="h-7 w-7 rounded object-cover border border-[hsl(var(--ax-border))]" />
                    ) : null;
                  })}
                  {s.images.length === 0 && <span className="h-7 w-7 rounded bg-[hsl(var(--ax-line))]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.images.length} reference{s.images.length === 1 ? "" : "s"}
                    {r.recommendedCount > 0 && ` · ${r.recommendedCount} recommended`}
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                  r.hasPrimary && r.hasBackup
                    ? "bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))]"
                    : r.hasPrimary
                      ? "text-[hsl(var(--ax-secondary))] border border-[hsl(var(--ax-border))]"
                      : "text-[hsl(var(--ax-faint))] border border-[hsl(var(--ax-border))]"
                }`}>
                  {r.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setOpen(true)}
        className="mt-4 h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5"
      >
        <Images className="h-3.5 w-3.5" /> Manage sets
      </button>

      {open && <ReferenceSetsManager templateId={templateId} templateName={templateName} sets={sets} prompts={prompts} onClose={() => setOpen(false)} />}
    </section>
  );
}

function ReferenceSetsManager({
  templateId, templateName, sets, prompts, onClose,
}: {
  templateId: string; templateName: string; sets: ReferenceSet[]; prompts: TemplatePrompt[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(sets[0]?.id ?? null);
  const [panel, setPanel] = useState<Record<string, "images" | "prompts" | "notes">>({});
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["reference-sets", templateId] });
    qc.invalidateQueries({ queryKey: ["template-prompts", templateId] });
  };

  async function addSet() {
    if (newName.trim().length < 2) return;
    setBusy("new");
    try {
      const orgId = await getCurrentOrgId();
      if (!orgId) { toast.error("No organization on your profile."); return; }
      const id = await createReferenceSet({ organization_id: orgId, template_id: templateId, name: newName, created_by: user?.id ?? null });
      setNewName("");
      setExpanded(id);
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
      <div className="w-full max-w-3xl ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg">Reference sets</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))]">
              3–5 strong examples beat 20 loose ones. Mark the strong ones recommended — those are what ride along with the prompt.
            </p>
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

        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {sets.map((s) => {
            const isOpen = expanded === s.id;
            const view = panel[s.id] ?? "images";
            const r = referenceSetReadiness(s, prompts);
            return (
              <div key={s.id} className="border border-[hsl(var(--ax-border))] rounded-lg">
                <div className="flex items-center gap-2 p-3">
                  <button onClick={() => setExpanded(isOpen ? null : s.id)} className="text-muted-foreground shrink-0">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.images.length} refs · {r.recommendedCount} recommended · {r.label}
                    </div>
                  </div>
                  <select
                    value={s.reference_dependency}
                    onChange={async (e) => { await updateReferenceSet(s.id, { reference_dependency: e.target.value as ReferenceDependency }); refresh(); }}
                    className="h-7 rounded border border-[hsl(var(--ax-border))] bg-transparent text-[11px] px-1.5 shrink-0"
                    title="How much this set still needs its images attached"
                  >
                    {(["high", "medium", "low"] as ReferenceDependency[]).map((d) => (
                      <option key={d} value={d}>{DEPENDENCY_LABELS[d]}</option>
                    ))}
                  </select>
                  <button
                    onClick={async () => { if (confirm(`Delete "${s.name}" and its prompts?`)) { await deleteReferenceSet(s.id); refresh(); } }}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                    aria-label="Delete set"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-3">
                    <div className="flex gap-1.5">
                      {(["images", "prompts", "notes"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setPanel((p) => ({ ...p, [s.id]: v }))}
                          className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border capitalize ${
                            view === v
                              ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                              : "border-[hsl(var(--ax-border))] text-muted-foreground"
                          }`}
                        >
                          {v === "notes" ? "Style notes" : v}
                        </button>
                      ))}
                    </div>

                    {view === "images" && (
                      <>
                        {s.images.length > 0 && (
                          <div className="grid grid-cols-6 gap-2">
                            {s.images.map((img) => {
                              const url = referenceImageUrl(img);
                              return (
                                <div key={img.id} className="relative group aspect-square">
                                  {url ? (
                                    <img src={url} alt="" className={`h-full w-full object-cover rounded border-2 ${img.is_recommended ? "border-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))]"}`} />
                                  ) : (
                                    <div className="h-full w-full rounded bg-[hsl(var(--ax-line))]" />
                                  )}
                                  <button
                                    onClick={async () => { await setImageRecommended(img.id, !img.is_recommended); refresh(); }}
                                    className="absolute bottom-1 left-1 h-5 w-5 rounded-full bg-black/70 flex items-center justify-center"
                                    title={img.is_recommended ? "Recommended — click to unmark" : "Mark recommended"}
                                  >
                                    <Star className={`h-3 w-3 ${img.is_recommended ? "fill-current text-[hsl(var(--ax-accent))]" : "text-white/70"}`} />
                                  </button>
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
                        <div className="flex gap-2">
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
                            type="file" accept="image/*" multiple className="hidden"
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
                      </>
                    )}

                    {view === "prompts" && (
                      <SetPrompts set={s} templateId={templateId} templateName={templateName} prompts={prompts} onChange={refresh} />
                    )}

                    {view === "notes" && (
                      <StyleNotesEditor set={s} onChange={refresh} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {sets.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No sets yet.</p>}
        </div>
      </div>
    </div>
  );
}

// ---- Prompts for one reference set --------------------------------------

function SetPrompts({
  set, templateId, templateName, prompts, onChange,
}: {
  set: ReferenceSet; templateId: string; templateName: string; prompts: TemplatePrompt[]; onChange: () => void;
}) {
  const [role, setRole] = useState<PromptRole>("primary");
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const current = useMemo(() => pickSetPrompt(prompts, set.id, role), [prompts, set.id, role]);
  const versions = useMemo(
    () => prompts.filter((p) => p.reference_set_id === set.id && p.role === role).sort((a, b) => b.version - a.version),
    [prompts, set.id, role],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5">
          {SET_PROMPT_ROLES.map((r) => {
            const has = prompts.some((p) => p.reference_set_id === set.id && p.role === r.value);
            return (
              <button
                key={r.value}
                onClick={() => setRole(r.value)}
                title={r.blurb}
                className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${
                  role === r.value
                    ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                    : "border-[hsl(var(--ax-border))] text-muted-foreground"
                }`}
              >
                {r.label}{!has && <span className="ml-1 opacity-60">—</span>}
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          {current && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(current.body);
                setCopied(true); setTimeout(() => setCopied(false), 1500);
                toast.success("Prompt copied");
              }}
              className="h-7 px-2.5 rounded border border-[hsl(var(--ax-border))] text-[11px] font-semibold inline-flex items-center gap-1"
            >
              {copied ? <Check className="h-3 w-3 text-[hsl(var(--ax-accent))]" /> : <Copy className="h-3 w-3" />} Copy
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            className="h-7 px-2.5 rounded border border-[hsl(var(--ax-border))] text-[11px] font-semibold inline-flex items-center gap-1"
          >
            {current ? <><Pencil className="h-3 w-3" /> Edit</> : <><Plus className="h-3 w-3" /> Write</>}
          </button>
        </div>
      </div>

      <p className="text-[11px] text-[hsl(var(--ax-faint))]">
        {SET_PROMPT_ROLES.find((r) => r.value === role)?.blurb}
      </p>

      {!current ? (
        <p className="text-[12px] text-muted-foreground">
          No {role} prompt yet. Write one, or fill in Style notes first and draft from those.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))]">
              v{current.version}
            </span>
            {current.master_candidate && (
              <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">Master candidate</span>
            )}
            {versions.length > 1 && <span className="text-[11px] text-muted-foreground">{versions.length} versions</span>}
          </div>
          <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-sans text-[hsl(var(--ax-secondary))] max-h-40 overflow-y-auto rounded bg-[hsl(var(--ax-line)/0.4)] p-2.5">
            {current.body}
          </pre>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={async () => {
                setBusy("promote");
                try { await setMasterCandidate(current.id, !current.master_candidate); onChange(); } finally { setBusy(null); }
              }}
              disabled={busy === "promote"}
              className="h-7 px-2.5 rounded border border-[hsl(var(--ax-border))] text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-60"
              title="Flag this as worth folding into the master prompt. Does not rewrite the master."
            >
              <ArrowUpCircle className="h-3 w-3" /> {current.master_candidate ? "Unflag" : "Promote to master"}
            </button>
            {versions.filter((v) => !v.is_current_best).slice(0, 3).map((v) => (
              <button
                key={v.id}
                onClick={async () => { await setCurrentBestSetPrompt(set.id, role, v.id); onChange(); }}
                className="h-7 px-2.5 rounded border border-[hsl(var(--ax-border))] text-[11px] text-muted-foreground inline-flex items-center gap-1"
              >
                <Star className="h-3 w-3" /> Use v{v.version}
              </button>
            ))}
          </div>
        </>
      )}

      {editing && (
        <SetPromptEditor
          set={set}
          templateId={templateId}
          templateName={templateName}
          role={role}
          base={current}
          existing={prompts}
          onClose={() => { setEditing(false); onChange(); }}
        />
      )}
    </div>
  );
}

function SetPromptEditor({
  set, templateId, templateName, role, base, existing, onClose,
}: {
  set: ReferenceSet; templateId: string; templateName: string; role: PromptRole;
  base: TemplatePrompt | null; existing: TemplatePrompt[]; onClose: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(base?.body ?? "");
  const [saving, setSaving] = useState(false);
  const nextVersion = nextPromptVersion(existing, { reference_set_id: set.id, role });
  const hasNotes = Object.values(set.style_notes ?? {}).some((v) => (v ?? "").trim());

  async function save() {
    setSaving(true);
    try {
      const orgId = await getCurrentOrgId();
      if (!orgId) { toast.error("No organization on your profile."); return; }
      await savePromptVersion({
        organization_id: orgId,
        template_id: templateId,
        reference_set_id: set.id,
        role,
        variation: "classic",
        title: title || null,
        body,
        created_by: user?.id ?? null,
        existing,
        makeCurrentBest: true,
      });
      toast.success(`Saved ${role} v${nextVersion}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 bg-black/60 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl ax-card p-5 my-8 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-bold text-lg">{set.name} · {role} prompt</h3>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
            Saves as v{nextVersion} and becomes current best.
            {role === "backup" && " Backup should approach the same style differently — not a reworded Primary."}
          </p>
        </div>

        <Input placeholder="Version note (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />

        <button
          onClick={() => setBody(draftPromptFromNotes({ templateName, setName: set.name, notes: set.style_notes ?? {}, role }))}
          disabled={!hasNotes}
          className="h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
          title={hasNotes ? "Assemble a draft from this set's style notes" : "Fill in Style notes first"}
        >
          <Wand2 className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))]" /> Build from references
        </button>

        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} className="font-mono text-[12px] leading-relaxed" />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={saving || body.trim().length < 20}
            className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save v{nextVersion}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Style notes ---------------------------------------------------------

function StyleNotesEditor({ set, onChange }: { set: ReferenceSet; onChange: () => void }) {
  const [notes, setNotes] = useState<StyleNotes>(set.style_notes ?? {});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateReferenceSet(set.id, { style_notes: notes });
      toast.success("Style notes saved");
      setDirty(false);
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-[hsl(var(--ax-faint))]">
        What these references share. Written once, this is what "Build from references" turns into a prompt draft.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        {STYLE_NOTE_FIELDS.map((f) => (
          <div key={f.key}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">{f.label}</div>
            <Textarea
              value={notes[f.key] ?? ""}
              onChange={(e) => { setNotes((n) => ({ ...n, [f.key]: e.target.value })); setDirty(true); }}
              rows={2}
              placeholder={f.hint}
              className="text-[12px]"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save notes
        </button>
      </div>
    </div>
  );
}
