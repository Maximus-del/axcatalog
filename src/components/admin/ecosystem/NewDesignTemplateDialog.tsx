// Create an org-owned design template. Attribute sliders are the important
// part: they are what makes a template matchable against athlete preference
// profiles, so the form treats them as first-class rather than metadata.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { createDesignTemplate, updateDesignTemplate, type DesignTemplateFull } from "@/lib/ecosystem/commerce";
import { getCurrentOrgId } from "@/hooks/useTasks";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const ATTRIBUTE_KEYS = ["vintage", "bold", "minimal", "luxury", "streetwear", "collegiate", "y2k"] as const;

const csv = (s: string): string[] =>
  s.split(",").map((v) => v.trim()).filter(Boolean);

const PRODUCT_TYPES = ["athlete_merch", "team_merch", "corporate"];

export function NewDesignTemplateDialog({
  onClose,
  existing,
}: {
  onClose: () => void;
  /** When present the dialog edits in place instead of creating. */
  existing?: DesignTemplateFull;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(existing?.name ?? "");
  const [style, setStyle] = useState(existing?.style ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [graphic, setGraphic] = useState(existing?.graphic_characteristics ?? "");
  const [typography, setTypography] = useState(existing?.typography_characteristics ?? "");
  const [tags, setTags] = useState((existing?.tags ?? []).join(", "));
  const [colors, setColors] = useState((existing?.color_tendencies ?? []).join(", "));
  const [sports, setSports] = useState((existing?.sport_compatibility ?? []).join(", "));
  const [productTypes, setProductTypes] = useState<string[]>(existing?.compatible_product_types ?? ["athlete_merch"]);
  const [attrs, setAttrs] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = {};
    for (const k of ATTRIBUTE_KEYS) base[k] = Number(existing?.attributes?.[k] ?? 0);
    return base;
  });

  const canSave = useMemo(() => name.trim().length > 1 && !saving, [name, saving]);

  async function save() {
    setSaving(true);
    try {
      const attributes = Object.fromEntries(Object.entries(attrs).filter(([, v]) => v > 0));
      const payload = {
        name,
        style: style || null,
        description: description || null,
        graphic_characteristics: graphic || null,
        typography_characteristics: typography || null,
        tags: csv(tags),
        color_tendencies: csv(colors),
        sport_compatibility: csv(sports),
        compatible_product_types: productTypes,
        attributes,
      };

      if (existing) {
        await updateDesignTemplate(existing.id, payload);
        toast.success("Template updated");
        qc.invalidateQueries({ queryKey: ["design-template", existing.id] });
      } else {
        const orgId = await getCurrentOrgId();
        if (!orgId) {
          toast.error("No organization on your profile — can't create a template.");
          return;
        }
        const id = await createDesignTemplate({ organization_id: orgId, ...payload });
        toast.success("Template created");
        navigate(`/admin/design-templates/${id}`);
      }
      qc.invalidateQueries({ queryKey: ["design-template-library"] });
      qc.invalidateQueries({ queryKey: ["design-templates"] });
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">{existing ? "Edit template" : "New design template"}</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
              A style system, not a design. The sliders drive athlete matching.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vintage Sports 02" />
          </Field>
          <Field label="Style">
            <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Vintage Sports" />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What this style system is for." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Graphics">
              <Input value={graphic} onChange={(e) => setGraphic(e.target.value)} placeholder="Distressed textures, arched marks" />
            </Field>
            <Field label="Typography">
              <Input value={typography} onChange={(e) => setTypography(e.target.value)} placeholder="Bold serif / block" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tags" hint="comma separated">
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vintage, bold, retro" />
            </Field>
            <Field label="Colors" hint="comma separated">
              <Input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="cream, navy, burgundy" />
            </Field>
          </div>
          <Field label="Sports" hint="comma separated">
            <Input value={sports} onChange={(e) => setSports(e.target.value)} placeholder="football, basketball" />
          </Field>

          <Field label="Works on">
            <div className="flex flex-wrap gap-1.5">
              {PRODUCT_TYPES.map((pt) => {
                const on = productTypes.includes(pt);
                return (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setProductTypes((prev) => (on ? prev.filter((p) => p !== pt) : [...prev, pt]))}
                    className={`text-[11px] font-semibold rounded-full px-2.5 py-1 capitalize border ${
                      on
                        ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                        : "border-[hsl(var(--ax-border))] text-muted-foreground"
                    }`}
                  >
                    {pt.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Attribute signature" hint="drives matching">
            <div className="space-y-2 pt-1">
              {ATTRIBUTE_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="text-[11px] uppercase tracking-wider text-[hsl(var(--ax-faint))] w-[76px] shrink-0">{k}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={Math.round((attrs[k] ?? 0) * 100)}
                    onChange={(e) => setAttrs((prev) => ({ ...prev, [k]: Number(e.target.value) / 100 }))}
                    className="flex-1 accent-[hsl(var(--ax-accent))]"
                  />
                  <span className="text-[11px] tabular-nums text-muted-foreground w-8 text-right">
                    {Math.round((attrs[k] ?? 0) * 100)}
                  </span>
                </div>
              ))}
            </div>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={!canSave}
            className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {existing ? "Save changes" : "Create template"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">
        {label}
        {hint && <span className="ml-1.5 normal-case tracking-normal font-normal opacity-70">({hint})</span>}
      </div>
      {children}
    </div>
  );
}
