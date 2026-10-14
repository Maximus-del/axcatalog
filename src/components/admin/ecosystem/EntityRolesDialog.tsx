// Change what a profile IS and how AX works with it — without touching a single
// product, design, collection or order. Type and roles are classification only;
// they decide which modules show, never what data exists.
import { useState } from "react";
import { Loader2, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AX_ROLES, ENTITY_TYPES, MODULE_LABELS, entityTypeOf, modulesFor, rolesOf,
  type AxRole, type EntityType, type EntityLike,
} from "@/lib/ecosystem/entity";
import { Input } from "@/components/ui/input";

export function EntityRolesDialog({
  entity, onClose, onSaved,
}: {
  entity: EntityLike & { id: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [entityType, setEntityType] = useState<EntityType>(entityTypeOf(entity));
  const [roles, setRoles] = useState<AxRole[]>(rolesOf(entity));
  const [displayName, setDisplayName] = useState(entity.display_name ?? entity.full_name ?? "");
  const [saving, setSaving] = useState(false);

  const preview = modulesFor({ entity_type: entityType, roles, capabilities: entity.capabilities });

  async function save() {
    if (roles.length === 0) { toast.error("Pick at least one relationship"); return; }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("athletes" as never)
        .update({
          entity_type: entityType,
          roles,
          display_name: displayName.trim() || null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", entity.id);
      if (error) throw error;
      toast.success("Profile classification updated");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg ax-card p-5 my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg">Profile type &amp; relationship</h3>
            <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
              What this entity is, and how AX works with it. Changing either is classification only — products,
              collections, designs and orders stay exactly where they are.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">Display name</div>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Goat Farm Media" />
          <p className="text-[11px] text-[hsl(var(--ax-faint))] mt-1">
            Used everywhere. An organization has one name — no surname needed.
          </p>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">Entity type</div>
          <div className="grid grid-cols-2 gap-1.5">
            {ENTITY_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setEntityType(t.value)}
                title={t.blurb}
                className={`text-left rounded-lg border px-2.5 py-1.5 ${
                  entityType === t.value
                    ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.1)]"
                    : "border-[hsl(var(--ax-border))]"
                }`}
              >
                <div className="text-[12px] font-semibold">{t.label}</div>
                <div className="text-[10px] text-muted-foreground truncate">{t.blurb}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">
            AX relationship <span className="normal-case tracking-normal font-normal opacity-70">(one or more)</span>
          </div>
          <div className="space-y-1.5">
            {AX_ROLES.map((r) => {
              const on = roles.includes(r.value);
              return (
                <button
                  key={r.value}
                  onClick={() => setRoles((prev) => on ? prev.filter((x) => x !== r.value) : [...prev, r.value])}
                  className={`w-full text-left rounded-lg border px-3 py-2 flex items-start gap-2.5 ${
                    on ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]" : "border-[hsl(var(--ax-border))]"
                  }`}
                >
                  <span className={`h-4 w-4 rounded border shrink-0 mt-0.5 ${
                    on ? "bg-[hsl(var(--ax-accent))] border-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))]"
                  }`} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">{r.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{r.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-[hsl(var(--ax-border))] p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))] mb-1.5 inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" /> Modules this profile will show
          </div>
          <div className="flex flex-wrap gap-1">
            {preview.map((m) => (
              <span key={m} className="text-[10px] font-semibold rounded-full bg-[hsl(var(--ax-line))] px-2 py-0.5 text-muted-foreground">
                {MODULE_LABELS[m]}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-[hsl(var(--ax-faint))] mt-2">
            Removing a role hides its modules. Nothing is deleted — re-add the role and the data is still there.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-9 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={saving || roles.length === 0}
            className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
