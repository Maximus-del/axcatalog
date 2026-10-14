// Prompt Library — the master copies.
//
// Editing here changes the prompt everywhere it is used; nothing on an upload
// page holds its own text. "Reset to default" deletes the override rather than
// pasting the default back, so an org that never edits keeps inheriting future
// improvements to the shipped wording.
import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Save, Copy, Check, FileImage } from "lucide-react";
import { toast } from "sonner";
import {
  SYSTEM_PROMPT_DEFAULTS,
  loadSystemPrompt,
  resetSystemPrompt,
  saveSystemPrompt,
  type SystemPrompt,
} from "@/lib/ecosystem/prompts";
import { getCurrentOrgId } from "@/hooks/useTasks";
import { Textarea } from "@/components/ui/textarea";

const KEYS = Object.keys(SYSTEM_PROMPT_DEFAULTS);

export default function AdminPrompts() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(org: string) {
    const all = await Promise.all(KEYS.map((k) => loadSystemPrompt(org, k)));
    setPrompts(all);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const org = await getCurrentOrgId();
      setOrgId(org);
      if (org) await load(org);
      else setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold">Prompt Library</h1>
        <p className="text-[13px] text-muted-foreground mt-1 max-w-[70ch]">
          Global production prompts. These are the master copies — every place in the dashboard that offers one reads
          from here, so an edit lands everywhere at once. Design Template prompts are separate; those are creative
          direction and live on each style.
        </p>
      </div>

      {prompts.map((p) => (
        <PromptCard key={p.key} prompt={p} orgId={orgId} onSaved={() => orgId && load(orgId)} />
      ))}
    </div>
  );
}

function PromptCard({ prompt, orgId, onSaved }: { prompt: SystemPrompt; orgId: string | null; onSaved: () => void }) {
  const [body, setBody] = useState(prompt.body);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setBody(prompt.body); }, [prompt.body]);

  const dirty = body !== prompt.body;
  const isDefault = body === SYSTEM_PROMPT_DEFAULTS[prompt.key].body;

  async function save() {
    if (!orgId) { toast.error("No organization on this account"); return; }
    setSaving(true);
    try {
      await saveSystemPrompt({ organization_id: orgId, key: prompt.key, body });
      toast.success(`${prompt.name} updated everywhere`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally { setSaving(false); }
  }

  async function reset() {
    if (!orgId) return;
    setSaving(true);
    try {
      await resetSystemPrompt(orgId, prompt.key);
      setBody(SYSTEM_PROMPT_DEFAULTS[prompt.key].body);
      toast.success("Back to the shipped default");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reset");
    } finally { setSaving(false); }
  }

  return (
    <section className="ax-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5">
          <FileImage className="h-5 w-5 mt-0.5 text-[hsl(var(--ax-accent))]" />
          <div>
            <h2 className="font-bold">{prompt.name}</h2>
            <p className="text-[12px] text-muted-foreground max-w-[60ch]">{prompt.description}</p>
            <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))]">
              <span>{prompt.category}</span>
              <span>·</span>
              <span>Global</span>
              <span>·</span>
              <span>{prompt.customized ? "Edited by your team" : "Shipped default"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(body);
              setCopied(true); setTimeout(() => setCopied(false), 1600);
            }}
            className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy
          </button>
          {!isDefault && (
            <button
              onClick={reset}
              disabled={saving}
              className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to default
            </button>
          )}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </button>
        </div>
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={22}
        className="font-mono text-[12px] leading-relaxed"
      />

      <p className="text-[11px] text-[hsl(var(--ax-faint))]">
        Operators add per-use notes when they copy it — those are appended under ADDITIONAL INSTRUCTIONS and never
        change this master text.
      </p>
    </section>
  );
}
