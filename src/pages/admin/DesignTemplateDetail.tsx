// One design template: the full style spec, its attribute signature, every
// athlete instance it has spawned, and — running the matcher backwards — which
// athletes it would fit best. Global templates are read-only here; operators
// duplicate them into their own org to make an editable version.
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Copy, Loader2, Pencil, Sparkles, Trash2, Archive, ArchiveRestore, Search, Check, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  applyDesignTemplate,
  duplicateDesignTemplate,
  rankAthletesForTemplate,
  removeTemplateApplication,
  setDesignTemplateActive,
  templateSignature,
  type AthleteLite,
} from "@/lib/ecosystem/commerce";
import { useAthletesWithProfiles, useDesignTemplate, useTemplateApplications } from "@/hooks/useCommerce";
import { getCurrentOrgId } from "@/hooks/useTasks";
import { useAuth } from "@/auth/AuthProvider";
import { AthletePhoto } from "@/components/fan/ui/AthletePhoto";
import { NewDesignTemplateDialog } from "@/components/admin/ecosystem/NewDesignTemplateDialog";
import { MasterPromptCard } from "@/components/admin/ecosystem/MasterPromptCard";
import { ReferenceSetsCard } from "@/components/admin/ecosystem/ReferenceSetsCard";
import { CollectionRecipeCard } from "@/components/admin/ecosystem/CollectionRecipeCard";
import { TemplatePlate } from "./DesignTemplatesList";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const athleteName = (a: AthleteLite) => a.full_name?.trim() || `${a.first_name} ${a.last_name}`.trim();

export default function DesignTemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isPlatformAdmin } = useAuth();

  const { data: template, isLoading } = useDesignTemplate(id);
  const { data: applications = [] } = useTemplateApplications(id);
  const { data: pool } = useAthletesWithProfiles(!!id);

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [athleteQuery, setAthleteQuery] = useState("");

  const appliedAthleteIds = useMemo(() => new Set(applications.map((a) => a.athlete_id)), [applications]);

  const ranked = useMemo(() => {
    if (!template || !pool) return [];
    return rankAthletesForTemplate(template, pool.athletes, pool.profiles);
  }, [template, pool]);

  const bestFit = useMemo(
    () => ranked.filter((m) => m.hasProfile && m.score > 0 && !appliedAthleteIds.has(m.athlete.id)).slice(0, 6),
    [ranked, appliedAthleteIds],
  );

  const searchResults = useMemo(() => {
    const q = athleteQuery.trim().toLowerCase();
    const all = pool?.athletes ?? [];
    const rows = q ? all.filter((a) => athleteName(a).toLowerCase().includes(q)) : all;
    return rows.slice(0, 30);
  }, [pool, athleteQuery]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["design-template-applications"] });
    qc.invalidateQueries({ queryKey: ["design-template-library"] });
  }

  async function apply(athlete: AthleteLite) {
    if (!template) return;
    setBusy(athlete.id);
    try {
      await applyDesignTemplate(athlete.organization_id, athlete.id, template.id, user?.id ?? null);
      toast.success(`Applied to ${athleteName(athlete)}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply");
    } finally {
      setBusy(null);
    }
  }

  async function unapply(applicationId: string) {
    setBusy(applicationId);
    try {
      await removeTemplateApplication(applicationId);
      toast.success("Instance removed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    } finally {
      setBusy(null);
    }
  }

  async function duplicate() {
    if (!template) return;
    setBusy("duplicate");
    try {
      const orgId = await getCurrentOrgId();
      if (!orgId) { toast.error("No organization on your profile."); return; }
      const newId = await duplicateDesignTemplate(template.id, orgId);
      qc.invalidateQueries({ queryKey: ["design-template-library"] });
      toast.success("Editable copy created");
      navigate(`/admin/design-templates/${newId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to duplicate");
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchive() {
    if (!template) return;
    setBusy("archive");
    try {
      await setDesignTemplateActive(template.id, !template.is_active);
      qc.invalidateQueries({ queryKey: ["design-template", template.id] });
      qc.invalidateQueries({ queryKey: ["design-template-library"] });
      toast.success(template.is_active ? "Template archived" : "Template restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-56 w-full rounded-[12px]" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto">
        <Link to="/admin/design-templates" className="text-sm text-muted-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Design Templates
        </Link>
        <div className="ax-card p-12 text-center text-muted-foreground mt-6">Template not found.</div>
      </div>
    );
  }

  // Global templates are read-only to org operators, but a platform admin owns
  // the shared library and edits it in place — RLS allows exactly this.
  const editable = template.organization_id !== null || isPlatformAdmin;
  const signature = templateSignature(template.attributes, 12);

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <Link to="/admin/design-templates" className="text-sm text-muted-foreground inline-flex items-center gap-1.5 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Design Templates
      </Link>

      {/* Hero */}
      <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
        <TemplatePlate template={template} className="h-56" />
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-bold">{template.name}</h1>
                {!template.is_active && <span className="ax-badge-pending">Archived</span>}
                {!editable && (
                  <span className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--ax-faint))] border border-[hsl(var(--ax-border))] rounded px-1.5 py-0.5">
                    Global · read-only
                  </span>
                )}
              </div>
              {template.style && <div className="text-sm text-muted-foreground mt-1">{template.style}</div>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setApplyOpen((v) => !v)}
                className="h-9 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[13px] font-bold inline-flex items-center gap-1.5"
              >
                <Sparkles className="h-4 w-4" /> Apply to athlete
              </button>
              {editable ? (
                <button onClick={() => setEditing(true)} className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5">
                  <Pencil className="h-4 w-4" /> Edit
                </button>
              ) : (
                <button onClick={duplicate} disabled={busy === "duplicate"} className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                  {busy === "duplicate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Duplicate
                </button>
              )}
              {editable && (
                <button onClick={toggleArchive} disabled={busy === "archive"} className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
                  {template.is_active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>

          {template.description && <p className="text-sm text-muted-foreground max-w-[70ch]">{template.description}</p>}

          <div className="flex flex-wrap gap-1.5">
            {(template.tags ?? []).map((t) => (
              <span key={t} className="text-[11px] font-semibold rounded-full bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] px-2 py-0.5">{t}</span>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 pt-2">
            <Spec label="Graphics" value={template.graphic_characteristics} />
            <Spec label="Typography" value={template.typography_characteristics} />
            <Spec label="Colors" value={(template.color_tendencies ?? []).join(" · ")} />
            <Spec label="Sports" value={(template.sport_compatibility ?? []).join(" · ")} capitalize />
            <Spec
              label="Works on"
              value={(template.compatible_product_types ?? []).map((t) => t.replace(/_/g, " ")).join(" · ")}
              capitalize
            />
          </div>
        </div>
      </div>

      {/* Apply panel */}
      {applyOpen && (
        <div className="ax-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Apply to an athlete</h2>
              <p className="text-[12px] text-[hsl(var(--ax-faint))]">Creates an editable instance for that athlete. The template is never modified.</p>
            </div>
            <button onClick={() => setApplyOpen(false)} className="text-sm text-muted-foreground">Close</button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={athleteQuery} onChange={(e) => setAthleteQuery(e.target.value)} placeholder="Search athletes…" className="pl-9" />
          </div>
          <div className="max-h-[320px] overflow-y-auto divide-y divide-border">
            {searchResults.map((a) => {
              const already = appliedAthleteIds.has(a.id);
              return (
                <div key={a.id} className="flex items-center gap-3 py-2">
                  <AthletePhoto athlete={a} className="h-9 w-9 rounded-full" textClass="text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{athleteName(a)}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[a.position, a.league].filter(Boolean).join(" · ") || "—"}{a.is_demo ? " · demo" : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => apply(a)}
                    disabled={already || busy === a.id}
                    className="h-8 px-3 rounded-lg text-[12px] font-bold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50 bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))]"
                  >
                    {busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {already ? "Applied" : "Apply"}
                  </button>
                </div>
              );
            })}
            {searchResults.length === 0 && <div className="py-6 text-center text-sm text-muted-foreground">No athletes match.</div>}
          </div>
        </div>
      )}

      {/* Creative recipe — the reusable production formula */}
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-3">
          <MasterPromptCard templateId={template.id} templateName={template.name} />
        </div>
        <ReferenceSetsCard templateId={template.id} templateName={template.name} referencePolicy={template.reference_policy} />
        <CollectionRecipeCard templateId={template.id} recipe={template.collection_recipe} editable={editable} />
        <section className="ax-card p-5">
          <h2 className="font-bold">Style DNA</h2>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5 mb-3">
            What the prompt and references are both trying to preserve.
          </p>
          <div className="space-y-2">
            <Spec label="Graphics" value={template.graphic_characteristics} />
            <Spec label="Typography" value={template.typography_characteristics} />
            <Spec label="Colors" value={(template.color_tendencies ?? []).join(" · ")} />
          </div>
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Attribute signature */}
        <section className="ax-card p-5">
          <h2 className="font-bold">Attribute signature</h2>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5 mb-4">
            The vector this template is matched on. Athlete Q&amp;A answers build the same shape, and the two are compared directly.
          </p>
          {signature.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attributes set — this template won't surface in recommendations.</p>
          ) : (
            <div className="space-y-2.5">
              {signature.map((a) => (
                <div key={a.key} className="flex items-center gap-3">
                  <span className="text-[11px] uppercase tracking-wider text-[hsl(var(--ax-faint))] w-[86px] shrink-0 truncate">{a.key}</span>
                  <span className="h-1.5 flex-1 rounded-full bg-[hsl(var(--ax-line))] overflow-hidden">
                    <span className="block h-full rounded-full bg-[hsl(var(--ax-accent))]" style={{ width: `${Math.round(Math.min(1, a.value) * 100)}%` }} />
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">{Math.round(a.value * 100)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Best fit athletes */}
        <section className="ax-card p-5">
          <h2 className="font-bold">Best fit</h2>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5 mb-4">
            Athletes whose preference profile matches this style, with the attributes that drove it.
          </p>
          {bestFit.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unapplied matches yet. Athletes need a completed questionnaire to build a preference profile.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {bestFit.map(({ athlete, score, reasons }) => (
                <div key={athlete.id} className="flex items-center gap-3 py-2.5">
                  <AthletePhoto athlete={athlete} className="h-9 w-9 rounded-full" textClass="text-[11px]" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate flex items-center gap-2">
                      <Link to={`/admin/athletes/${athlete.id}`} className="hover:underline truncate">{athleteName(athlete)}</Link>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))] shrink-0">
                        {Math.round(score * 100)}%
                      </span>
                    </div>
                    {reasons.length > 0 && (
                      <div className="text-[11px] text-muted-foreground truncate">Because: {reasons.join(", ")}</div>
                    )}
                  </div>
                  <button
                    onClick={() => apply(athlete)}
                    disabled={busy === athlete.id}
                    className="h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-bold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-60"
                  >
                    {busy === athlete.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))]" />} Apply
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Instances */}
      <section className="ax-card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold">Athlete instances</h2>
          <span className="text-[12px] text-muted-foreground tabular-nums">{applications.length}</span>
        </div>
        <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5 mb-4">
          Each instance is an independent editable copy — editing one never touches the template or the other athletes.
        </p>
        {applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">Not applied to anyone yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {applications.map((app) => (
              <div key={app.id} className="flex items-center gap-3 py-2.5">
                {app.athlete ? (
                  <AthletePhoto athlete={app.athlete} className="h-9 w-9 rounded-full" textClass="text-[11px]" />
                ) : (
                  <span className="h-9 w-9 rounded-full bg-[hsl(var(--ax-line))] shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">
                    {app.athlete ? (
                      <Link to={`/admin/athletes/${app.athlete.id}`} className="hover:underline">{athleteName(app.athlete)}</Link>
                    ) : (
                      "Unknown athlete"
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {app.status} · applied {new Date(app.created_at).toLocaleDateString()}
                  </div>
                </div>
                <Link
                  to={`/admin/design-templates/${template.id}/instances/${app.id}`}
                  className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5 shrink-0"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Open instance
                </Link>
                <button
                  onClick={() => unapply(app.id)}
                  disabled={busy === app.id}
                  className="h-8 w-8 rounded-lg border border-[hsl(var(--ax-border))] inline-flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0 disabled:opacity-60"
                  aria-label="Remove instance"
                >
                  {busy === app.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {editing && <NewDesignTemplateDialog existing={template} onClose={() => setEditing(false)} />}
    </div>
  );
}

function Spec({ label, value, capitalize }: { label: string; value: string | null | undefined; capitalize?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))]">{label}</div>
      <div className={`text-[13px] mt-0.5 ${capitalize ? "capitalize" : ""}`}>{value}</div>
    </div>
  );
}
