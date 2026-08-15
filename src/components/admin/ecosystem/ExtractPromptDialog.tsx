// Build a prompt FROM the reference images, by having ChatGPT do the looking.
//
// Step 1 hands over a request plus the set's images. Step 2 takes the reply and
// files it — the reusable prompt becomes a new version, and the style notes it
// came back with fill in the set's observations. Nothing is generated here; AX
// just makes the round trip fast and keeps the result.
import { useMemo, useState } from "react";
import { Copy, Check, Loader2, ExternalLink, ArrowRight, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  buildPromptExtractionRequest,
  nextPromptVersion,
  packagedReferences,
  parseExtractionReply,
  referenceImageUrl,
  savePromptVersion,
  updateReferenceSet,
  type PromptRole,
  type ReferenceSet,
  type TemplatePrompt,
} from "@/lib/ecosystem/creative";
import { getCurrentOrgId } from "@/hooks/useTasks";
import { useAuth } from "@/auth/AuthProvider";
import { Textarea } from "@/components/ui/textarea";

export function ExtractPromptDialog({
  set,
  templateId,
  templateName,
  role,
  existing,
  onClose,
}: {
  set: ReferenceSet;
  templateId: string;
  templateName: string;
  role: PromptRole;
  existing: TemplatePrompt[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);

  const images = useMemo(() => packagedReferences(set), [set]);
  const request = useMemo(
    () => buildPromptExtractionRequest({
      templateName,
      setName: set.name,
      imageCount: images.length,
      notes: set.style_notes,
      role,
    }),
    [templateName, set, images.length, role],
  );

  const parsed = useMemo(() => (reply.trim() ? parseExtractionReply(reply) : null), [reply]);
  const nextVersion = nextPromptVersion(existing, { reference_set_id: set.id, role });

  async function save() {
    if (!parsed?.prompt) return;
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
        title: `v${nextVersion} — extracted from ${images.length} references`,
        body: parsed.prompt,
        created_by: user?.id ?? null,
        existing,
        makeCurrentBest: true,
      });

      // Only overwrite notes the model actually returned.
      if (Object.keys(parsed.notes).length > 0) {
        await updateReferenceSet(set.id, { style_notes: { ...set.style_notes, ...parsed.notes } });
      }

      toast.success(`Saved ${role} v${nextVersion}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 bg-black/60 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
            Write the {role} prompt from these references
          </h3>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
            {set.name} · {images.length} image{images.length === 1 ? "" : "s"}. ChatGPT studies them and writes the reusable
            prompt; you paste it back here.
          </p>
        </div>

        <div className="flex gap-1.5">
          {([1, 2] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`text-[11px] font-semibold rounded-full px-3 py-1 border ${
                step === s
                  ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                  : "border-[hsl(var(--ax-border))] text-muted-foreground"
              }`}
            >
              {s === 1 ? "1 · Send" : "2 · Paste back"}
            </button>
          ))}
        </div>

        {images.length === 0 && (
          <div className="text-[13px] text-muted-foreground rounded-lg border border-[hsl(var(--ax-border))] p-3">
            This set has no images yet. Add references first — there's nothing for ChatGPT to look at.
          </div>
        )}

        {step === 1 ? (
          <>
            {images.length > 0 && (
              <div className="rounded-lg border border-[hsl(var(--ax-border))] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">
                    Attach these {images.length}
                  </div>
                  <button
                    onClick={() => images.forEach((img) => {
                      const url = referenceImageUrl(img);
                      if (url) window.open(url, "_blank", "noopener");
                    })}
                    className="text-[11px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" /> Open all
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {images.map((img) => {
                    const url = referenceImageUrl(img);
                    return url ? (
                      <a key={img.id} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square">
                        <img src={url} alt="" className="h-full w-full object-cover rounded border border-[hsl(var(--ax-border))]" />
                      </a>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-sans text-[hsl(var(--ax-secondary))] max-h-72 overflow-y-auto rounded-lg bg-[hsl(var(--ax-line)/0.4)] p-3">
              {request}
            </pre>

            <div className="flex justify-between gap-2">
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(request);
                  setCopied(true); setTimeout(() => setCopied(false), 1600);
                  toast.success("Request copied — attach the images with it");
                }}
                className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy request
              </button>
              <button
                onClick={() => setStep(2)}
                className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm inline-flex items-center gap-1.5"
              >
                Paste the reply <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </>
        ) : (
          <>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={14}
              placeholder="Paste ChatGPT's full reply here — both the STYLE NOTES and PROMPT sections."
              className="font-mono text-[12px]"
            />

            {parsed && (
              <div className="rounded-lg border border-[hsl(var(--ax-border))] p-3 space-y-2">
                <div className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">
                  What will be saved
                </div>
                <div className="text-[12px]">
                  <span className="font-semibold">Prompt:</span>{" "}
                  {parsed.prompt
                    ? `${parsed.prompt.length.toLocaleString()} characters → ${role} v${nextVersion}, marked current best`
                    : <span className="text-destructive">nothing found</span>}
                </div>
                <div className="text-[12px]">
                  <span className="font-semibold">Style notes:</span>{" "}
                  {Object.keys(parsed.notes).length > 0
                    ? Object.keys(parsed.notes).join(", ")
                    : "none found — existing notes kept"}
                </div>
                {parsed.prompt && !parsed.prompt.includes("{{") && (
                  <div className="text-[12px] text-destructive">
                    No {"{{TOKENS}}"} in the prompt — athlete details won't slot in. Ask it to add them, or edit after saving.
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !parsed?.prompt}
                className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save as v{nextVersion}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
