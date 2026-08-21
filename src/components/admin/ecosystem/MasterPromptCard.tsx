// Master Prompt — the reusable intelligence for recreating a style. Saving
// never overwrites: each save writes the next version of that variation, and
// exactly one version per variation is marked CURRENT BEST. Over time the
// prompt captures what the references taught us, so fewer references are needed.
import { useMemo, useState } from "react";
import { Copy, Check, Pencil, History, Loader2, Star, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  PROMPT_VARIATIONS,
  DEFAULT_OUTPUT_REQUIREMENTS,
  extractTokens,
  pickCurrentPrompt,
  savePromptVersion,
  setCurrentBestPrompt,
  type PromptVariation,
  type TemplatePrompt,
} from "@/lib/ecosystem/creative";
import { useTemplatePrompts } from "@/hooks/useCreative";
import { getCurrentOrgId } from "@/hooks/useTasks";
import { useAuth } from "@/auth/AuthProvider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export function MasterPromptCard({ templateId, templateName }: { templateId: string; templateName: string }) {
  const qc = useQueryClient();
  const { data: prompts = [], isLoading } = useTemplatePrompts(templateId);
  const [variation, setVariation] = useState<PromptVariation>("classic");
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const current = useMemo(() => pickCurrentPrompt(prompts, variation), [prompts, variation]);
  const versions = useMemo(
    () => prompts.filter((p) => p.variation === variation).sort((a, b) => b.version - a.version),
    [prompts, variation],
  );

  async function copy() {
    if (!current) return;
    await navigator.clipboard.writeText(current.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    toast.success("Master prompt copied");
  }

  async function makeBest(p: TemplatePrompt) {
    setBusy(p.id);
    try {
      await setCurrentBestPrompt(templateId, variation, p.id);
      qc.invalidateQueries({ queryKey: ["template-prompts", templateId] });
      toast.success(`v${p.version} is now current best`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="ax-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold">Master Prompt</h2>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
            The best tested prompt for recreating this style. References teach it once; the prompt keeps what we learned.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {current && (
            <button onClick={copy} className="h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5">
              {copied ? <Check className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))]" /> : <Copy className="h-3.5 w-3.5" />} Copy
            </button>
          )}
          <button onClick={() => setEditing(true)} className="h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5">
            {current ? <><Pencil className="h-3.5 w-3.5" /> Edit</> : <><Plus className="h-3.5 w-3.5" /> Write</>}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-3 mb-3 flex-wrap">
        {PROMPT_VARIATIONS.map((v) => {
          const has = prompts.some((p) => p.variation === v.value);
          const on = variation === v.value;
          return (
            <button
              key={v.value}
              onClick={() => setVariation(v.value)}
              title={v.blurb}
              className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${
                on
                  ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                  : "border-[hsl(var(--ax-border))] text-muted-foreground"
              }`}
            >
              {v.label}
              {!has && <span className="ml-1 opacity-60">—</span>}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !current ? (
        <div className="text-sm text-muted-foreground">
          No {variation} prompt yet. Write one and it becomes v1 — every later save adds a version instead of overwriting.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))]">
              v{current.version}
            </span>
            {current.is_current_best && (
              <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--ax-faint))] inline-flex items-center gap-1">
                <Star className="h-3 w-3 fill-current" /> Current best
              </span>
            )}
            {current.title && <span className="text-[12px] text-muted-foreground truncate">{current.title}</span>}
          </div>
          <pre className="text-[12px] leading-relaxed whitespace-pre-wrap font-sans text-[hsl(var(--ax-secondary))] max-h-48 overflow-y-auto rounded-lg bg-[hsl(var(--ax-line)/0.4)] p-3">
            {current.body}
          </pre>
          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex flex-wrap gap-1">
              {extractTokens(current.body).map((t) => (
                <span key={t} className="text-[10px] font-mono rounded bg-[hsl(var(--ax-line))] px-1.5 py-0.5 text-muted-foreground">
                  {`{{${t}}}`}
                </span>
              ))}
            </div>
            {versions.length > 1 && (
              <button onClick={() => setShowHistory((v) => !v)} className="text-[12px] font-semibold text-muted-foreground inline-flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> {versions.length} versions
              </button>
            )}
          </div>

          {showHistory && (
            <div className="mt-3 divide-y divide-border border-t border-border">
              {versions.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2">
                  <span className="text-[11px] font-black tabular-nums w-8">v{p.version}</span>
                  <span className="text-[12px] text-muted-foreground flex-1 truncate">
                    {p.title || new Date(p.created_at).toLocaleDateString()}
                  </span>
                  {p.is_current_best ? (
                    <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">Best</span>
                  ) : (
                    <button
                      onClick={() => makeBest(p)}
                      disabled={busy === p.id}
                      className="text-[11px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-60"
                    >
                      {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Star className="h-3 w-3" />} Mark best
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <PromptEditor
          templateId={templateId}
          templateName={templateName}
          variation={variation}
          existing={prompts}
          base={current}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}

function PromptEditor({
  templateId,
  templateName,
  variation,
  existing,
  base,
  onClose,
}: {
  templateId: string;
  templateName: string;
  variation: PromptVariation;
  existing: TemplatePrompt[];
  base: TemplatePrompt | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(base?.body ?? starterPrompt(templateName));
  const [outputReq, setOutputReq] = useState(base?.output_requirements ?? "");
  const [saving, setSaving] = useState(false);

  const nextVersion = Math.max(0, ...existing.filter((p) => p.variation === variation).map((p) => p.version)) + 1;

  async function save() {
    setSaving(true);
    try {
      const orgId = await getCurrentOrgId();
      if (!orgId) { toast.error("No organization on your profile."); return; }
      await savePromptVersion({
        organization_id: orgId,
        template_id: templateId,
        variation,
        title: title || null,
        body,
        output_requirements: outputReq || null,
        created_by: user?.id ?? null,
        existing,
        makeCurrentBest: true,
      });
      qc.invalidateQueries({ queryKey: ["template-prompts", templateId] });
      toast.success(`Saved as v${nextVersion} · current best`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-2xl ax-card p-5 my-8 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="font-bold text-lg">
            {base ? "New version" : "Write master prompt"} · {variation}
          </h3>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
            Saves as v{nextVersion} and becomes current best. Earlier versions stay intact.
            Use <code className="font-mono">{"{{TOKENS}}"}</code> for athlete-specific values.
          </p>
        </div>

        <Input placeholder="Version note (optional) — what changed?" value={title} onChange={(e) => setTitle(e.target.value)} />

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={16}
          className="font-mono text-[12px] leading-relaxed"
        />

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">
            Output requirements <span className="normal-case tracking-normal font-normal opacity-70">(blank = standard isolated-artwork block)</span>
          </div>
          <Textarea
            value={outputReq}
            onChange={(e) => setOutputReq(e.target.value)}
            rows={3}
            placeholder={DEFAULT_OUTPUT_REQUIREMENTS}
            className="font-mono text-[11px]"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {extractTokens(body).map((t) => (
            <span key={t} className="text-[10px] font-mono rounded bg-[hsl(var(--ax-line))] px-1.5 py-0.5 text-muted-foreground">
              {`{{${t}}}`}
            </span>
          ))}
        </div>

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

/** A scaffold that names every dimension a master prompt should cover. */
function starterPrompt(templateName: string): string {
  return `Create an original apparel graphic for {{ATHLETE_NAME}} using the ${templateName} visual system.

TYPOGRAPHY
Describe the letterforms, weight, and any secondary type.

HIERARCHY & COMPOSITION
Describe what leads, what supports, and how the piece is arranged.

GRAPHIC TREATMENT & TEXTURE
Describe linework, fills, outlines, distress, and print texture.

ILLUSTRATION BEHAVIOUR
Describe how any imagery or mascot work is drawn and stylized.

COLOR RELATIONSHIPS
Describe the palette logic and how colors interact. Use {{COLOR_PALETTE}} where relevant.

SPACING & SCALE
Describe density, margins, and how the graphic sits on a garment.

APPAREL INTENT
Describe placement and print treatment for {{PRODUCT_TYPE}}.

ORIGINALITY
Create an original composition. Do not reproduce or closely imitate any existing brand, team mark, or reference.`;
}
