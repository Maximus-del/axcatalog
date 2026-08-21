// Rapid two-direction start — the workflow worth optimizing hardest.
// Questionnaire done → the system already knows the two best-matched styles →
// one click creates both instances AND both collection concepts, each seeded
// from its template's recipe. The athlete gets a real choice; nobody starts
// from a blank creative brief.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Rocket, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { applyDesignTemplate, recommendDesignTemplates } from "@/lib/ecosystem/commerce";
import { useAthletePreferenceProfile, useDesignTemplateLibrary } from "@/hooks/useCommerce";
import { createCollectionConcept, parseRecipe, suggestConceptName, DEFAULT_RECIPE } from "@/lib/ecosystem/creative";
import { useAuth } from "@/auth/AuthProvider";

export function RapidStartButton({
  athleteId,
  organizationId,
  lastName,
}: {
  athleteId: string;
  organizationId: string;
  lastName: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const { data: library } = useDesignTemplateLibrary(false);
  const { data: profile } = useAthletePreferenceProfile(open ? athleteId : undefined);

  const ranked = useMemo(() => {
    const templates = library?.templates ?? [];
    return recommendDesignTemplates(profile?.profile, templates).slice(0, 4);
  }, [library, profile]);

  const hasProfile = !!profile && Object.keys(profile.profile ?? {}).length > 0;

  function openPicker() {
    setOpen(true);
    setSelected([]);
  }

  // Default to the top two once ranking resolves — the two-direction default.
  const effectiveSelection = selected.length > 0 ? selected : ranked.slice(0, 2).map((r) => r.template.id);

  async function run() {
    setRunning(true);
    let made = 0;
    try {
      for (const id of effectiveSelection) {
        const match = ranked.find((r) => r.template.id === id);
        if (!match) continue;
        const tpl = match.template as typeof match.template & { collection_recipe?: unknown; style?: string | null };
        const applicationId = await applyDesignTemplate(organizationId, athleteId, id, user?.id ?? null);
        const parsed = parseRecipe(tpl.collection_recipe);
        const recipe = (parsed.designs?.length ?? 0) > 0 ? parsed : DEFAULT_RECIPE;
        await createCollectionConcept({
          organization_id: organizationId,
          athlete_id: athleteId,
          template_id: id,
          application_id: applicationId,
          name: suggestConceptName(lastName, tpl.style || tpl.name),
          description: `${tpl.style || tpl.name} direction · ${Math.round(match.score * 100)}% match`,
          slots: (recipe.designs ?? []).map((d, i) => ({
            name: d.name,
            purpose: d.purpose ?? null,
            product_type: recipe.products?.[i] ?? recipe.products?.[0] ?? null,
          })),
        });
        made++;
      }
      qc.invalidateQueries({ queryKey: ["athlete-concepts", athleteId] });
      qc.invalidateQueries({ queryKey: ["design-template-applications"] });
      toast.success(`${made} collection concept${made === 1 ? "" : "s"} created`);
      setOpen(false);
      navigate(`/admin/athletes/${athleteId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <button
        onClick={openPicker}
        className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[hsl(var(--ax-line))]"
      >
        <Rocket className="h-4 w-4 text-[hsl(var(--ax-accent))]" /> Rapid Start
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg ax-card p-5 my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">Create collection concepts</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mb-4">
              {hasProfile
                ? "Ranked from this athlete's preference profile. Pick two directions — each becomes an instance plus a seeded collection concept."
                : "No preference profile yet, so these are unranked. Completing the questionnaire makes this pick itself."}
            </p>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {ranked.map(({ template, score, reasons }) => {
                const on = effectiveSelection.includes(template.id);
                return (
                  <button
                    key={template.id}
                    onClick={() =>
                      setSelected((prev) => {
                        const base = prev.length > 0 ? prev : effectiveSelection;
                        return base.includes(template.id) ? base.filter((x) => x !== template.id) : [...base, template.id];
                      })
                    }
                    className={`w-full text-left rounded-lg border p-3 flex items-start gap-3 ${
                      on ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]" : "border-[hsl(var(--ax-border))]"
                    }`}
                  >
                    <span className={`h-4 w-4 rounded border shrink-0 mt-0.5 flex items-center justify-center ${
                      on ? "bg-[hsl(var(--ax-accent))] border-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))]"
                    }`}>
                      {on && <Check className="h-3 w-3 text-[hsl(var(--ax-on-accent))]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold flex items-center gap-2">
                        {template.name}
                        {hasProfile && score > 0 && (
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))]">
                            {Math.round(score * 100)}%
                          </span>
                        )}
                      </span>
                      {reasons.length > 0 && (
                        <span className="block text-[11px] text-muted-foreground mt-0.5">Because: {reasons.join(", ")}</span>
                      )}
                    </span>
                  </button>
                );
              })}
              {ranked.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No active templates.</p>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
              <button
                onClick={run}
                disabled={running || effectiveSelection.length === 0}
                className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {running && <Loader2 className="h-4 w-4 animate-spin" />}
                Create {effectiveSelection.length} concept{effectiveSelection.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
