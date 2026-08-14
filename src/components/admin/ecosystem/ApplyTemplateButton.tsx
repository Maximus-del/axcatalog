// Apply an athlete template — provisions default membership plans + modules,
// then the athlete stays fully editable.
import { useState } from "react";
import { LayoutTemplate, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTemplates } from "@/hooks/useContent";
import { applyTemplate } from "@/lib/ecosystem/content";

export function ApplyTemplateButton({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const { data: templates = [] } = useTemplates();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function apply(id: string) {
    setBusy(id);
    try {
      await applyTemplate(athleteId, id);
      await qc.invalidateQueries({ queryKey: ["athlete-plans", athleteId] });
      toast.success("Template applied — default plans & modules created");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply");
    } finally { setBusy(null); }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5 text-[hsl(var(--ax-ink))]">
        <LayoutTemplate className="h-4 w-4" /> Apply Template
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md ax-card p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-1">Apply a template</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mb-4">Creates default membership plans & enables modules. Only fills gaps — won't overwrite existing plans.</p>
            <div className="space-y-2">
              {templates.map((t) => (
                <div key={t.id} className="rounded-xl border border-[hsl(var(--ax-border))] p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-[12px] text-[hsl(var(--ax-faint))] truncate">{t.description}</div>
                  </div>
                  <button onClick={() => apply(t.id)} disabled={!!busy} className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60">
                    {busy === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Apply
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
