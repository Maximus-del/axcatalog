// The athlete instance — the working version of a template. Everything here is
// this athlete's: resolved variables, their direction, their prompt packages,
// their concepts. The global template is read-only from this page by design;
// editing Darnell's version must never change Collegiate 01 for everyone else.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Copy, Check, Loader2, Sparkles, Save, FolderPlus, Star, Trash2, Wand2, AlertTriangle, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  DEPENDENCY_LABELS,
  DIRECTION_MODES,
  PROMPT_VARIATIONS,
  SET_PROMPT_ROLES,
  VARIABLE_LABELS,
  VARIABLE_TOKENS,
  compilePrompt,
  deletePromptPackage,
  missingVariables,
  packagedReferences,
  pickCurrentPrompt,
  pickSetPrompt,
  ratePromptPackage,
  referenceImageUrl,
  resolveAthleteVariables,
  savePromptPackage,
  updateInstance,
  type DirectionMode,
  type PromptRole,
  type PromptVariation,
  type ReferenceMode,
  type Variables,
} from "@/lib/ecosystem/creative";
import {
  useAthleteContext, useAthleteFreeText, useInstance, useInstanceConcepts, usePromptPackages, useReferenceSets, useTemplatePrompts,
} from "@/hooks/useCreative";
import { useDesignTemplate } from "@/hooks/useCommerce";
import { useAuth } from "@/auth/AuthProvider";
import { AthletePhoto } from "@/components/fan/ui/AthletePhoto";
import { CreateConceptDialog } from "@/components/admin/ecosystem/CreateConceptDialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export default function DesignTemplateInstance() {
  const { id: templateId, applicationId } = useParams<{ id: string; applicationId: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: instance, isLoading: loadingInstance } = useInstance(applicationId);
  const { data: template } = useDesignTemplate(templateId);
  const { data: athlete } = useAthleteContext(instance?.athlete_id);
  const { data: prompts = [] } = useTemplatePrompts(templateId);
  const { data: referenceSets = [] } = useReferenceSets(templateId);
  const { data: freeText = [] } = useAthleteFreeText(instance?.athlete_id);
  const { data: packages = [] } = usePromptPackages(applicationId);
  const { data: concepts = [] } = useInstanceConcepts(applicationId);

  const [overrides, setOverrides] = useState<Variables>({});
  const [direction, setDirection] = useState("");
  const [variation, setVariation] = useState<PromptVariation>("classic");
  const [referenceSetId, setReferenceSetId] = useState<string | null>(null);
  // Which prompt drives generation: the template's master prompt, or one
  // reference set's Primary/Backup. Backup exists because AI output is
  // unpredictable — switching should not mean rewriting the brief.
  const [setRole, setSetRole] = useState<PromptRole | null>("primary");
  const [refMode, setRefMode] = useState<ReferenceMode>("with_references");
  const [dirty, setDirty] = useState(false);
  const [savingInputs, setSavingInputs] = useState(false);
  const [built, setBuilt] = useState<{ mode: DirectionMode; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [conceptOpen, setConceptOpen] = useState(false);

  // Seed local editing state once the instance loads.
  useEffect(() => {
    if (!instance) return;
    setOverrides(instance.variables ?? {});
    setDirection(instance.athlete_direction ?? "");
    setReferenceSetId(instance.default_reference_set_id);
  }, [instance]);

  useEffect(() => {
    if (referenceSetId === null && referenceSets.length > 0) {
      setReferenceSetId(referenceSets.find((s) => s.is_default)?.id ?? referenceSets[0].id);
    }
  }, [referenceSets, referenceSetId]);

  const variables = useMemo<Variables>(() => {
    if (!athlete) return overrides;
    return resolveAthleteVariables({
      athlete,
      team: athlete.team,
      athleteIdea: direction,
      year: new Date().getFullYear(),
      overrides,
    });
  }, [athlete, overrides, direction]);

  const referenceSet = referenceSets.find((s) => s.id === referenceSetId) ?? null;

  // A set prompt is preferred when one is selected and exists; otherwise the
  // master prompt carries the generation.
  const currentPrompt = useMemo(() => {
    if (referenceSetId && setRole) {
      const setPrompt = pickSetPrompt(prompts, referenceSetId, setRole);
      if (setPrompt) return setPrompt;
    }
    return pickCurrentPrompt(prompts, variation);
  }, [prompts, referenceSetId, setRole, variation]);

  const usingSetPrompt = !!currentPrompt?.reference_set_id;
  const attachments = useMemo(
    () => (refMode === "with_references" ? packagedReferences(referenceSet) : []),
    [referenceSet, refMode],
  );

  // A set marked "prompt proven" defaults to not needing its images attached.
  useEffect(() => {
    if (referenceSet) setRefMode(referenceSet.reference_dependency === "low" ? "prompt_only" : "with_references");
  }, [referenceSet]);
  const missing = useMemo(
    () => (currentPrompt ? missingVariables(currentPrompt.body, currentPrompt.required_variables ?? [], variables) : []),
    [currentPrompt, variables],
  );

  async function saveInputs() {
    if (!applicationId) return;
    setSavingInputs(true);
    try {
      await updateInstance(applicationId, {
        variables: overrides,
        athlete_direction: direction || null,
        default_reference_set_id: referenceSetId,
      });
      qc.invalidateQueries({ queryKey: ["template-instance", applicationId] });
      setDirty(false);
      toast.success("Athlete inputs saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingInputs(false);
    }
  }

  function build(mode: DirectionMode) {
    if (!template || !currentPrompt) {
      toast.error("Write a master prompt for this template first.");
      return;
    }
    const text = compilePrompt({
      templateName: template.name,
      templateStyle: template.style,
      promptBody: currentPrompt.body,
      variables,
      athleteDirection: direction,
      directionMode: mode,
      referenceSetName: referenceSet?.name ?? null,
      referenceCount: attachments.length,
      referenceMode: refMode,
      outputRequirements: currentPrompt.output_requirements,
    });
    setBuilt({ mode, text });
  }

  async function copyBuilt() {
    if (!built) return;
    await navigator.clipboard.writeText(built.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
    toast.success("Full prompt copied");
  }

  async function savePackage() {
    if (!built || !template || !applicationId || !instance || !athlete) return;
    setBusy("save-package");
    try {
      const mode = DIRECTION_MODES.find((m) => m.value === built.mode)!;
      await savePromptPackage({
        organization_id: instance.organization_id,
        application_id: applicationId,
        template_id: template.id,
        athlete_id: athlete.id,
        prompt_id: currentPrompt?.id ?? null,
        reference_set_id: referenceSetId,
        label: usingSetPrompt
          ? `${referenceSet?.name ?? "Set"} · ${currentPrompt?.role} · ${mode.label}`
          : `Master · ${variation} · ${mode.label}`,
        variation,
        prompt_role: currentPrompt?.role ?? "master",
        direction_mode: built.mode,
        variables,
        athlete_direction: direction || null,
        compiled_prompt: built.text,
        created_by: user?.id ?? null,
      });
      qc.invalidateQueries({ queryKey: ["prompt-packages", applicationId] });
      toast.success("Prompt package saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(null);
    }
  }

  if (loadingInstance) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full rounded-[12px]" />
      </div>
    );
  }

  if (!instance || !template) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
        <Link to={`/admin/design-templates/${templateId}`} className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back to template
        </Link>
        <div className="ax-card p-12 text-center text-muted-foreground mt-6">Instance not found.</div>
      </div>
    );
  }

  const athleteName = athlete ? athlete.full_name?.trim() || `${athlete.first_name} ${athlete.last_name}`.trim() : "Athlete";

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <Link to={`/admin/design-templates/${templateId}`} className="text-sm text-muted-foreground inline-flex items-center gap-1.5 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {template.name}
      </Link>

      <header className="flex items-center gap-4 flex-wrap">
        {athlete && <AthletePhoto athlete={{ ...athlete, image_url: (athlete.metadata?.["avatar_url"] as string) ?? null }} className="h-14 w-14 rounded-full" textClass="text-base" />}
        <div className="min-w-0">
          <div className="ax-section-header mb-1">Athlete instance</div>
          <h1 className="text-2xl font-bold truncate">
            {template.name} — {athleteName}
          </h1>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
            Edits here stay on this instance. The global template is untouched.
          </p>
        </div>
      </header>

      {/* ATHLETE INPUTS */}
      <section className="ax-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold">Athlete inputs</h2>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
              Pulled from the athlete record and their team. Edit only what's wrong or missing.
            </p>
          </div>
          <button
            onClick={saveInputs}
            disabled={!dirty || savingInputs}
            className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {savingInputs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
          </button>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {VARIABLE_TOKENS.filter((t) => t !== "ATHLETE_IDEA").map((token) => {
            const value = overrides[token] ?? variables[token] ?? "";
            const auto = !overrides[token] && !!variables[token];
            return (
              <div key={token}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1 flex items-center gap-1.5">
                  {VARIABLE_LABELS[token]}
                  {auto && <span className="text-[9px] font-normal normal-case tracking-normal opacity-70">auto</span>}
                </div>
                <Input
                  value={value}
                  placeholder="—"
                  onChange={(e) => { setOverrides((prev) => ({ ...prev, [token]: e.target.value })); setDirty(true); }}
                  className="h-9 text-[13px]"
                />
              </div>
            );
          })}
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">Athlete direction</div>
          <Textarea
            value={direction}
            onChange={(e) => { setDirection(e.target.value); setDirty(true); }}
            rows={3}
            placeholder="What this athlete actually asked for — e.g. moon/star imagery, darker streetwear feel, oversized graphics."
          />
          {freeText.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">
                From their questionnaire — click to use
              </div>
              <div className="flex flex-wrap gap-1.5">
                {freeText.slice(0, 6).map((t, i) => (
                  <button
                    key={i}
                    onClick={() => { setDirection((d) => (d ? `${d} ${t}` : t)); setDirty(true); }}
                    className="text-[11px] text-left rounded-lg border border-[hsl(var(--ax-border))] px-2 py-1 text-muted-foreground hover:text-foreground max-w-full truncate"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* PROMPTS */}
      <section className="ax-card p-5 space-y-4">
        <div>
          <h2 className="font-bold">Prompts</h2>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
            Master prompt + these inputs + references + output rules, combined into one prompt. Build several directions — the first generation is not the design.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">Prompt source</div>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setReferenceSetId(null); setSetRole(null); }}
                className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${
                  !referenceSetId
                    ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                    : "border-[hsl(var(--ax-border))] text-muted-foreground"
                }`}
                title="The generalized recipe for the whole style"
              >
                Master prompt
              </button>
              {referenceSets.map((s) => {
                const on = referenceSetId === s.id;
                const hasPrimary = !!pickSetPrompt(prompts, s.id, "primary");
                return (
                  <button
                    key={s.id}
                    onClick={() => { setReferenceSetId(s.id); setSetRole("primary"); setDirty(true); }}
                    className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${
                      on
                        ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                        : "border-[hsl(var(--ax-border))] text-muted-foreground"
                    }`}
                    title={hasPrimary ? `${s.name} sub-style` : `${s.name} — no prompt yet, will fall back to master`}
                  >
                    {s.name} <span className="opacity-60">{s.images.length}</span>
                    {!hasPrimary && <span className="ml-1 opacity-60">—</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {referenceSetId ? (
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">Prompt</div>
                <div className="flex gap-1.5">
                  {SET_PROMPT_ROLES.map((r) => {
                    const has = !!pickSetPrompt(prompts, referenceSetId, r.value);
                    return (
                      <button
                        key={r.value}
                        onClick={() => setSetRole(r.value)}
                        disabled={!has}
                        title={r.blurb}
                        className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border disabled:opacity-40 ${
                          setRole === r.value
                            ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                            : "border-[hsl(var(--ax-border))] text-muted-foreground"
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">References</div>
                <div className="flex gap-1.5">
                  {([
                    { v: "with_references" as ReferenceMode, l: "Attach images" },
                    { v: "prompt_only" as ReferenceMode, l: "Prompt only" },
                  ]).map((o) => (
                    <button
                      key={o.v}
                      onClick={() => setRefMode(o.v)}
                      className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${
                        refMode === o.v
                          ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                          : "border-[hsl(var(--ax-border))] text-muted-foreground"
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              {referenceSet && (
                <div className="text-[11px] text-muted-foreground pb-1.5">
                  {DEPENDENCY_LABELS[referenceSet.reference_dependency]}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">Variation</div>
              <div className="flex gap-1.5">
                {PROMPT_VARIATIONS.map((v) => {
                  const has = prompts.some((p) => !p.reference_set_id && p.variation === v.value);
                  return (
                    <button
                      key={v.value}
                      onClick={() => setVariation(v.value)}
                      disabled={!has}
                      className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border disabled:opacity-40 ${
                        variation === v.value
                          ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                          : "border-[hsl(var(--ax-border))] text-muted-foreground"
                      }`}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {currentPrompt && (
            <p className="text-[11px] text-[hsl(var(--ax-faint))]">
              Using {usingSetPrompt
                ? `${referenceSet?.name} · ${currentPrompt.role} v${currentPrompt.version}`
                : `master prompt · ${currentPrompt.variation} v${currentPrompt.version}`}
              {referenceSetId && !usingSetPrompt && " — this set has no prompt of its own yet, so the master is standing in."}
            </p>
          )}
        </div>

        {!currentPrompt && (
          <div className="text-[13px] text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
            No {variation} master prompt on this template yet — write one on the template page first.
          </div>
        )}

        {missing.length > 0 && currentPrompt && (
          <div className="text-[12px] text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--ax-accent))] shrink-0 mt-0.5" />
            <span>
              Unfilled: {missing.map((m) => VARIABLE_LABELS[m as keyof typeof VARIABLE_LABELS] ?? m).join(", ")} — the prompt will still build, with those tokens left visible.
            </span>
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-2">
          {DIRECTION_MODES.map((m, i) => (
            <button
              key={m.value}
              onClick={() => build(m.value)}
              disabled={!currentPrompt}
              className={`text-left rounded-lg border p-3 disabled:opacity-50 ${
                built?.mode === m.value
                  ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]"
                  : "border-[hsl(var(--ax-border))] hover:bg-[hsl(var(--ax-line)/0.5)]"
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">
                <Wand2 className="h-3 w-3" /> Option {String.fromCharCode(65 + i)}
              </div>
              <div className="font-semibold text-[13px] mt-1">{m.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{m.blurb}</div>
            </button>
          ))}
        </div>

        {built && (
          <div className="space-y-2">
            <pre className="text-[12px] leading-relaxed whitespace-pre-wrap font-sans text-[hsl(var(--ax-secondary))] max-h-72 overflow-y-auto rounded-lg bg-[hsl(var(--ax-line)/0.4)] p-3">
              {built.text}
            </pre>

            {attachments.length > 0 && (
              <div className="rounded-lg border border-[hsl(var(--ax-border))] p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">
                    Attach these {attachments.length} reference{attachments.length === 1 ? "" : "s"}
                  </div>
                  <button
                    onClick={() => attachments.forEach((img) => {
                      const url = referenceImageUrl(img);
                      if (url) window.open(url, "_blank", "noopener");
                    })}
                    className="text-[11px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" /> Open all
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {attachments.map((img) => {
                    const url = referenceImageUrl(img);
                    return url ? (
                      <a key={img.id} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square">
                        <img src={url} alt="" className="h-full w-full object-cover rounded border border-[hsl(var(--ax-border))]" />
                      </a>
                    ) : null;
                  })}
                </div>
                <p className="text-[11px] text-[hsl(var(--ax-faint))] mt-2">
                  Copy the prompt, drop these images in alongside it, generate several options.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={copyBuilt} className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy full prompt
              </button>
              <button
                onClick={savePackage}
                disabled={busy === "save-package"}
                className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {busy === "save-package" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save package
              </button>
            </div>
          </div>
        )}
      </section>

      {/* COLLECTION CONCEPTS */}
      <section className="ax-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-bold">Collection concepts</h2>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
              The shell — named collection with design slots, ready for artwork.
            </p>
          </div>
          <button
            onClick={() => setConceptOpen(true)}
            className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5"
          >
            <FolderPlus className="h-3.5 w-3.5" /> Create collection concept
          </button>
        </div>

        {concepts.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-3">No concepts yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {concepts.map((c) => (
              <div key={c.id} className="border border-[hsl(var(--ax-border))] rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/admin/collections/${c.id}`} className="font-semibold text-[14px] hover:underline">{c.name}</Link>
                  <span className="ax-badge-pending capitalize shrink-0">{c.status}</span>
                </div>
                <div className="mt-2 grid sm:grid-cols-3 gap-2">
                  {c.slots.map((s) => (
                    <div key={s.id} className="rounded-lg bg-[hsl(var(--ax-line)/0.4)] p-2">
                      <div className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--ax-faint))]">
                        Design {String(s.slot_no).padStart(2, "0")}
                      </div>
                      <div className="text-[13px] font-semibold truncate">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground capitalize">{s.status.replace(/_/g, " ")}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* GENERATIONS */}
      <section className="ax-card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold">Prompt packages</h2>
          <span className="text-[12px] text-muted-foreground tabular-nums">{packages.length}</span>
        </div>
        <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5 mb-3">
          Each saved session, snapshotted. Rate the results and the strongest prompts become obvious over time.
        </p>
        {packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing saved yet — build a prompt above and save it.</p>
        ) : (
          <div className="divide-y divide-border">
            {packages.map((p) => (
              <div key={p.id} className="py-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{p.label ?? p.variation}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()} · {p.compiled_prompt.length.toLocaleString()} chars
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={async () => {
                        await ratePromptPackage(p.id, n);
                        qc.invalidateQueries({ queryKey: ["prompt-packages", applicationId] });
                      }}
                      aria-label={`Rate ${n}`}
                      className="p-0.5"
                    >
                      <Star className={`h-3.5 w-3.5 ${(p.rating ?? 0) >= n ? "fill-current text-[hsl(var(--ax-accent))]" : "text-[hsl(var(--ax-faint))]"}`} />
                    </button>
                  ))}
                </div>
                <button
                  onClick={async () => { await navigator.clipboard.writeText(p.compiled_prompt); toast.success("Copied"); }}
                  className="h-7 w-7 rounded border border-[hsl(var(--ax-border))] inline-flex items-center justify-center text-muted-foreground shrink-0"
                  aria-label="Copy prompt"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={async () => {
                    await deletePromptPackage(p.id);
                    qc.invalidateQueries({ queryKey: ["prompt-packages", applicationId] });
                  }}
                  className="h-7 w-7 rounded border border-[hsl(var(--ax-border))] inline-flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Delete package"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ax-card p-5">
        <h2 className="font-bold">Generations &amp; final designs</h2>
        <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
          Uploading generated options, shortlisting, and attaching approved artwork to design slots is the next phase.
          Until then, generate externally and mark slots as you go.
        </p>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))]" />
          Generated → Shortlisted → Revision → Approved → Final PNG → Collection design
        </div>
      </section>

      {conceptOpen && athlete && (
        <CreateConceptDialog
          target={{
            templateId: template.id,
            templateName: template.name,
            templateStyle: template.style,
            recipe: template.collection_recipe,
            applicationId: applicationId ?? null,
          }}
          athlete={{ id: athlete.id, organization_id: athlete.organization_id, last_name: athlete.last_name }}
          onClose={() => setConceptOpen(false)}
        />
      )}
    </div>
  );
}
