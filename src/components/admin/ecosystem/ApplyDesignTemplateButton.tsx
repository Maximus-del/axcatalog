// Apply a reusable Design Template (style system) to an athlete. Non-destructive:
// creates an editable instance, never mutates the template. When the athlete has
// a preference profile (from the Q&A), templates are ranked with an explainable
// match score ("because: vintage, bold, football").
import { useMemo, useState } from "react";
import { Loader2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useDesignTemplates, useAthletePreferenceProfile } from "@/hooks/useCommerce";
import { applyDesignTemplate, recommendDesignTemplates } from "@/lib/ecosystem/commerce";
import { useAuth } from "@/auth/AuthProvider";

export function ApplyDesignTemplateButton({ athleteId, organizationId }: { athleteId: string; organizationId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const { data: templates = [] } = useDesignTemplates();
  const { data: profile } = useAthletePreferenceProfile(open ? athleteId : undefined);

  const ranked = useMemo(
    () => recommendDesignTemplates(profile?.profile, templates),
    [profile, templates],
  );
  const hasProfile = !!profile && Object.keys(profile.profile ?? {}).length > 0;

  async function apply(templateId: string) {
    setApplying(templateId);
    try {
      await applyDesignTemplate(organizationId, athleteId, templateId, user?.id ?? null);
      toast.success("Design template applied");
      qc.invalidateQueries({ queryKey: ["design-template-applications", athleteId] });
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setApplying(null); }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-[hsl(var(--ax-line))]">
        <Sparkles className="h-4 w-4 text-[hsl(var(--ax-accent))]" /> Design Template
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg ax-card p-5 my-8" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">Apply a Design Template</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mb-4">
              {hasProfile
                ? "Ranked by this athlete's preference profile. Applying creates an editable instance — the template stays intact."
                : "No preference profile yet — complete the athlete Q&A to get ranked recommendations. Applying creates an editable instance."}
            </p>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {ranked.map(({ template, score, reasons }) => (
                <div key={template.id} className="ax-card p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate flex items-center gap-2">
                      {template.name}
                      {hasProfile && score > 0 && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))]">{Math.round(score * 100)}% match</span>
                      )}
                    </div>
                    {template.style && <div className="text-[12px] text-[hsl(var(--ax-faint))]">{template.style}</div>}
                    {hasProfile && reasons.length > 0 && (
                      <div className="text-[11px] text-[hsl(var(--ax-secondary))] mt-1">Because: {reasons.join(", ")}</div>
                    )}
                    {template.compatible_product_types?.length > 0 && (
                      <div className="text-[11px] text-[hsl(var(--ax-faint))] mt-0.5 capitalize">Works on: {template.compatible_product_types.map((t) => t.replace(/_/g, " ")).join(", ")}</div>
                    )}
                  </div>
                  <button onClick={() => apply(template.id)} disabled={applying === template.id} className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-60">
                    {applying === template.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Apply
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 text-right">
              <button onClick={() => setOpen(false)} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
