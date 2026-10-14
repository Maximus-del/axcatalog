// Create Collection Concept — the shell, not the artwork. Everything is
// pre-filled from the template's recipe and the athlete's name, so the operator
// confirms rather than composes. Creates a real collection (status 'concept')
// plus its design slots, so the lineage into products and drops already exists.
import { useMemo, useState } from "react";
import { Loader2, X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { createCollectionConcept, parseRecipe, suggestConceptName, DEFAULT_RECIPE } from "@/lib/ecosystem/creative";
import { Input } from "@/components/ui/input";

export interface ConceptTarget {
  templateId: string;
  templateName: string;
  templateStyle: string | null;
  recipe: unknown;
  applicationId: string | null;
}

export function CreateConceptDialog({
  target,
  athlete,
  onClose,
  onCreated,
}: {
  target: ConceptTarget;
  athlete: { id: string; organization_id: string; last_name: string };
  onClose: () => void;
  onCreated?: (collectionId: string) => void;
}) {
  const qc = useQueryClient();
  const recipe = useMemo(() => {
    const parsed = parseRecipe(target.recipe);
    return (parsed.designs?.length ?? 0) > 0 ? parsed : DEFAULT_RECIPE;
  }, [target.recipe]);

  const [name, setName] = useState(() => suggestConceptName(athlete.last_name, target.templateStyle || target.templateName));
  const [slots, setSlots] = useState(() => (recipe.designs ?? []).map((d) => ({ name: d.name, purpose: d.purpose ?? "" })));
  const [products, setProducts] = useState<string[]>(() => recipe.products ?? []);
  const [saving, setSaving] = useState(false);

  const allProducts = recipe.products ?? [];

  async function create() {
    setSaving(true);
    try {
      const id = await createCollectionConcept({
        organization_id: athlete.organization_id,
        athlete_id: athlete.id,
        template_id: target.templateId,
        application_id: target.applicationId,
        name,
        description: `${target.templateStyle || target.templateName} concept${products.length ? ` · ${products.join(", ")}` : ""}`,
        slots: slots
          .filter((s) => s.name.trim())
          .map((s, i) => ({ name: s.name.trim(), purpose: s.purpose.trim() || null, product_type: products[i] ?? products[0] ?? null })),
      });
      qc.invalidateQueries({ queryKey: ["instance-concepts"] });
      qc.invalidateQueries({ queryKey: ["athlete-concepts"] });
      toast.success(`${name} created`);
      onCreated?.(id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create concept");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg">Create collection concept</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))]">
              Pre-filled from the {target.templateName} recipe. Artwork comes later — this builds the shell.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">Concept name</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))]">
              Designs ({slots.length})
            </span>
            <div className="flex gap-1">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() =>
                    setSlots((prev) => {
                      const base = recipe.designs ?? [];
                      const next = Array.from({ length: n }, (_, i) =>
                        prev[i] ?? { name: base[i]?.name ?? `Design ${i + 1}`, purpose: base[i]?.purpose ?? "" },
                      );
                      return next;
                    })
                  }
                  className={`text-[11px] font-bold h-6 w-6 rounded border ${
                    slots.length === n
                      ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                      : "border-[hsl(var(--ax-border))] text-muted-foreground"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {slots.map((s, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="text-[11px] text-[hsl(var(--ax-faint))] tabular-nums w-6 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Input
                  value={s.name}
                  onChange={(e) => setSlots((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className="h-9 text-[13px]"
                />
                <button
                  onClick={() => setSlots((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Remove design"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setSlots((prev) => [...prev, { name: `Design ${prev.length + 1}`, purpose: "" }])}
            className="mt-2 text-[12px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add design
          </button>
        </div>

        {allProducts.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">Products</div>
            <div className="flex flex-wrap gap-1.5">
              {allProducts.map((p) => {
                const on = products.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => setProducts((prev) => (on ? prev.filter((x) => x !== p) : [...prev, p]))}
                    className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${
                      on
                        ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                        : "border-[hsl(var(--ax-border))] text-muted-foreground"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button
            onClick={create}
            disabled={saving || !name.trim() || slots.length === 0}
            className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create concept
          </button>
        </div>
      </div>
    </div>
  );
}
