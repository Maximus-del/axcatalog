// Generate the artwork, then upload it — without leaving the Add Design dialog.
//
// This deliberately reuses the design-template prompt system rather than
// inventing a second one: the master prompt for a style is already the best
// tested thing AX has, versioned and improvable. Here it gets the entity's
// details and a one-line idea, plus the standing output block that produces an
// isolated transparent PNG.
import { useEffect, useMemo, useState } from "react";
import { Copy, Check, Wand2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_OUTPUT_REQUIREMENTS,
  compilePrompt,
  pickCurrentPrompt,
  pickSetPrompt,
  resolveAthleteVariables,
  type TemplatePrompt,
} from "@/lib/ecosystem/creative";
import { listDesignTemplatesFull, type DesignTemplateFull } from "@/lib/ecosystem/commerce";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";

interface EntityContext {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  jersey_number?: string | number | null;
  position?: string | null;
  league?: string | null;
}

export function DesignPromptPanel({ entity }: { entity: EntityContext }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<DesignTemplateFull[]>([]);
  const [prompts, setPrompts] = useState<TemplatePrompt[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [setId, setSetId] = useState("");
  const [sets, setSets] = useState<{ id: string; name: string }[]>([]);
  const [idea, setIdea] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || templates.length) return;
    listDesignTemplatesFull().then((t) => {
      setTemplates(t);
      if (t.length && !templateId) setTemplateId(t[0].id);
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prompts and sub-styles for the chosen style.
  useEffect(() => {
    if (!templateId) return;
    (async () => {
      const [p, s] = await Promise.all([
        supabase
          .from("design_template_prompts" as never)
          .select("id, organization_id, template_id, reference_set_id, role, variation, version, title, body, output_requirements, required_variables, is_current_best, master_candidate, notes, created_at")
          .eq("template_id", templateId),
        supabase.from("reference_sets" as never).select("id, name").eq("template_id", templateId).order("name"),
      ]);
      setPrompts((p.data ?? []) as unknown as TemplatePrompt[]);
      setSets((s.data ?? []) as unknown as { id: string; name: string }[]);
      setSetId("");
    })();
  }, [templateId]);

  const template = templates.find((t) => t.id === templateId) ?? null;

  const chosenPrompt = useMemo(() => {
    if (setId) {
      const sp = pickSetPrompt(prompts, setId, "primary");
      if (sp) return sp;
    }
    return pickCurrentPrompt(prompts, "classic");
  }, [prompts, setId]);

  const compiled = useMemo(() => {
    if (!template) return "";
    const variables = resolveAthleteVariables({
      athlete: {
        full_name: entity.name,
        first_name: entity.first_name ?? entity.name,
        last_name: entity.last_name ?? "",
        jersey_number: entity.jersey_number ?? null,
        position: entity.position ?? null,
        league: entity.league ?? null,
      },
      year: new Date().getFullYear(),
    });

    // No master prompt for that style yet — still produce something usable
    // rather than nothing, since the output block is the part that matters most.
    const body = chosenPrompt?.body
      ?? `Create an original apparel graphic for {{ATHLETE_NAME}} in the ${template.name} style${template.style ? ` (${template.style})` : ""}.`;

    return compilePrompt({
      templateName: template.name,
      templateStyle: template.style,
      promptBody: body,
      variables,
      athleteDirection: idea,
      directionMode: "closest",
      referenceMode: "prompt_only",
      outputRequirements: chosenPrompt?.output_requirements ?? DEFAULT_OUTPUT_REQUIREMENTS,
    });
  }, [template, chosenPrompt, idea, entity]);

  return (
    <div className="rounded-lg border border-[hsl(var(--ax-border))]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 p-3 text-left"
      >
        <span className="inline-flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
          <span className="text-[13px] font-semibold">Need the artwork? Build a generation prompt</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-[11px] text-[hsl(var(--ax-faint))]">
            Uses the style's current-best master prompt, with {entity.name}'s details filled in and the standard
            isolated-PNG output rules appended. Generate elsewhere, then paste the result straight into the drop zone above.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">Style</div>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full h-9 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 text-[13px]"
              >
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">Sub-style</div>
              <select
                value={setId}
                onChange={(e) => setSetId(e.target.value)}
                className="w-full h-9 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 text-[13px]"
              >
                <option value="">Master prompt</option>
                {sets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">
              Design idea <span className="normal-case tracking-normal font-normal opacity-70">(what this specific piece should be)</span>
            </div>
            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={2}
              placeholder="Moon and star motif around the number, heavier distress than usual"
            />
          </div>

          {compiled && (
            <>
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap font-sans text-[hsl(var(--ax-secondary))] max-h-56 overflow-y-auto rounded-lg bg-[hsl(var(--ax-line)/0.4)] p-2.5">
                {compiled}
              </pre>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[hsl(var(--ax-faint))]">
                  {chosenPrompt
                    ? `${chosenPrompt.reference_set_id ? "Set" : "Master"} prompt v${chosenPrompt.version}`
                    : "No master prompt on this style yet — using a minimal fallback"}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(compiled);
                    setCopied(true); setTimeout(() => setCopied(false), 1600);
                    toast.success("Prompt copied");
                  }}
                  className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} Copy prompt
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
