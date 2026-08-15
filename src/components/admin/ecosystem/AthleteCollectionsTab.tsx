// Operator Collections tab: a Collection is the permanent creative container
// (designs + mockups + products + drops that belong together). Cards link into
// the full collection detail. Shared objects — nothing is duplicated.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Layers, Palette, Package, Rocket, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAthleteCollections } from "@/hooks/useCommerce";
import { createCollection } from "@/lib/ecosystem/commerce";

const TYPES = ["athlete", "season", "campaign", "capsule", "other"] as const;

export function AthleteCollectionsTab({ athleteId, organizationId }: { athleteId: string; organizationId: string }) {
  const qc = useQueryClient();
  const { data: collections = [], isLoading } = useAthleteCollections(athleteId);
  const [creating, setCreating] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["athlete-collections", athleteId] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Collections</h3>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">Permanent containers for designs, mockups, products, and drops that belong together.</p>
        </div>
        <button onClick={() => setCreating(true)} className="h-9 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-semibold text-[13px] inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> New Collection
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-[hsl(var(--ax-secondary))]">Loading…</div>
      ) : collections.length === 0 ? (
        <div className="ax-card p-6 text-center text-sm text-[hsl(var(--ax-secondary))]">
          No collections yet. Create one (e.g. “Mooney World”) to organize this athlete's creative and products.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {collections.map((c) => (
            <Link key={c.id} to={`/admin/collections/${c.id}`} className="ax-card overflow-hidden hover:border-[hsl(var(--ax-accent)/0.5)] transition-colors group">
              <div className="aspect-[16/9] bg-[hsl(var(--ax-line))] flex items-center justify-center overflow-hidden">
                {c.hero_url ? (
                  <img src={c.hero_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <Layers className="h-8 w-8 text-[hsl(var(--ax-faint))]" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold truncate">{c.name}</div>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[hsl(var(--ax-line))] text-[hsl(var(--ax-secondary))] capitalize shrink-0">{c.status}</span>
                </div>
                {c.description && <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-1 line-clamp-2">{c.description}</p>}
                <div className="flex items-center gap-3 mt-3 text-[12px] text-[hsl(var(--ax-secondary))]">
                  <span className="inline-flex items-center gap-1"><Palette className="h-3.5 w-3.5" /> {c.design_count}</span>
                  <span className="inline-flex items-center gap-1"><Package className="h-3.5 w-3.5" /> {c.product_count}</span>
                  <span className="inline-flex items-center gap-1"><Rocket className="h-3.5 w-3.5" /> {c.drop_count}</span>
                  <ArrowRight className="h-3.5 w-3.5 ml-auto text-[hsl(var(--ax-faint))] group-hover:text-[hsl(var(--ax-accent))] transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <NewCollection
          athleteId={athleteId}
          organizationId={organizationId}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); refresh(); }}
        />
      )}
    </div>
  );
}

function NewCollection({ athleteId, organizationId, onClose, onSaved }: { athleteId: string; organizationId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<string>("athlete");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Collection name required"); return; }
    setSaving(true);
    try {
      await createCollection({ organization_id: organizationId, athlete_id: athleteId, name, description, collection_type: type });
      toast.success("Collection created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-md ax-card p-5 my-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">New Collection</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-1">Name</label>
            <input className="ax-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mooney World" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-1">Type</label>
            <select className="ax-field capitalize" value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-1">Description (optional)</label>
            <textarea className="ax-field min-h-[70px]" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create
          </button>
        </div>
      </div>
    </div>
  );
}
