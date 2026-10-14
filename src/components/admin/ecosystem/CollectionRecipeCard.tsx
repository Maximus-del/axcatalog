// Collection Recipe — the proven way AX builds a collection in this style.
// Not "use Collegiate", but "here are the three designs and three products that
// make a Collegiate collection work". This is what makes concept creation a
// click instead of a blank brief.
import { useState } from "react";
import { ListChecks, Plus, Trash2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { updateDesignTemplate } from "@/lib/ecosystem/commerce";
import { DEFAULT_RECIPE, parseRecipe, type CollectionRecipe } from "@/lib/ecosystem/creative";
import { Input } from "@/components/ui/input";

export function CollectionRecipeCard({
  templateId,
  recipe: raw,
  editable,
}: {
  templateId: string;
  recipe: unknown;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const recipe = parseRecipe(raw);
  const designs = recipe.designs ?? [];
  const products = recipe.products ?? [];
  const empty = designs.length === 0 && products.length === 0;

  return (
    <section className="ax-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">Collection Recipe</h2>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
            The default shape of a collection in this style.
          </p>
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground mt-3">
          No recipe yet — concepts will start from the standard 3-design shell.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums">{designs.length}</span>
            <span className="text-[12px] text-muted-foreground">
              designs · {products.length} product{products.length === 1 ? "" : "s"}
            </span>
          </div>
          <ol className="mt-3 space-y-1.5">
            {designs.map((d, i) => (
              <li key={i} className="flex gap-2 text-[13px]">
                <span className="text-[hsl(var(--ax-faint))] tabular-nums shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="font-semibold">{d.name}</span>
                  {d.purpose && <span className="text-muted-foreground"> — {d.purpose}</span>}
                </span>
              </li>
            ))}
          </ol>
          {products.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {products.map((p) => (
                <span key={p} className="text-[11px] font-semibold rounded-full bg-[hsl(var(--ax-line))] px-2 py-0.5 text-muted-foreground">{p}</span>
              ))}
            </div>
          )}
        </>
      )}

      {editable && (
        <button
          onClick={() => setEditing(true)}
          className="mt-4 h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5"
        >
          <ListChecks className="h-3.5 w-3.5" /> {empty ? "Set recipe" : "Edit recipe"}
        </button>
      )}

      {editing && (
        <RecipeEditor
          templateId={templateId}
          initial={empty ? DEFAULT_RECIPE : recipe}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  );
}

function RecipeEditor({ templateId, initial, onClose }: { templateId: string; initial: CollectionRecipe; onClose: () => void }) {
  const qc = useQueryClient();
  const [designs, setDesigns] = useState(initial.designs ?? []);
  const [products, setProducts] = useState((initial.products ?? []).join(", "));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateDesignTemplate(templateId, {
        collection_recipe: {
          designs: designs.filter((d) => d.name.trim()),
          products: products.split(",").map((p) => p.trim()).filter(Boolean),
        },
      });
      qc.invalidateQueries({ queryKey: ["design-template", templateId] });
      toast.success("Recipe saved");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-lg">Collection recipe</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))]">Every concept built from this template starts here.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">Design slots</div>
          <div className="space-y-2">
            {designs.map((d, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-[11px] text-[hsl(var(--ax-faint))] tabular-nums pt-3 w-5 shrink-0">{i + 1}</span>
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={d.name}
                    placeholder="Design name"
                    onChange={(e) => setDesigns((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    className="h-9 text-[13px]"
                  />
                  <Input
                    value={d.purpose ?? ""}
                    placeholder="Purpose (optional)"
                    onChange={(e) => setDesigns((prev) => prev.map((x, j) => (j === i ? { ...x, purpose: e.target.value } : x)))}
                    className="h-8 text-[12px]"
                  />
                </div>
                <button
                  onClick={() => setDesigns((prev) => prev.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive pt-3"
                  aria-label="Remove slot"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setDesigns((prev) => [...prev, { name: "", purpose: "" }])}
            className="mt-2 text-[12px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Add slot
          </button>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">
            Recommended products <span className="normal-case tracking-normal font-normal opacity-70">(comma separated)</span>
          </div>
          <Input value={products} onChange={(e) => setProducts(e.target.value)} placeholder="Heavyweight Tee, Premium Hoodie, Crewneck" />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save recipe
          </button>
        </div>
      </div>
    </div>
  );
}
