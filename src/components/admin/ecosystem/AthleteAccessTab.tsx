// Operator Access tab: configure this athlete's membership plans (shared
// membership_plans object) + view subscribers. No billing — mock state.
import { useState } from "react";
import { Plus, Pencil, Trash2, Users, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAthletePlans, useAthleteSubscribers } from "@/hooks/useContent";
import { upsertPlan, deletePlan, type PlanInput } from "@/lib/ecosystem/content";
import type { MembershipPlan } from "@/lib/ecosystem/types";

const TIERS = ["follow", "access", "vip"] as const;
const money = (cents: number) => (cents ? `$${(cents / 100).toFixed(0)}/mo` : "Free");

export function AthleteAccessTab({ athleteId, organizationId }: { athleteId: string; organizationId: string }) {
  const qc = useQueryClient();
  const { data: plans = [], isLoading } = useAthletePlans(athleteId);
  const { data: subs = [] } = useAthleteSubscribers(athleteId);
  const [editing, setEditing] = useState<Partial<MembershipPlan> | null>(null);

  const members = subs.filter((s) => s.state === "subscriber" || s.state === "vip");
  const vips = subs.filter((s) => s.state === "vip");
  const followers = subs.filter((s) => s.state === "following" || s.state === "subscriber" || s.state === "vip");
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["athlete-plans", athleteId] });
    qc.invalidateQueries({ queryKey: ["athlete-subs", athleteId] });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Followers" value={followers.length} />
        <Stat label="Access" value={members.length} />
        <Stat label="VIP" value={vips.length} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Membership Plans</h3>
          <button
            onClick={() => setEditing({ tier: "access", price_cents: 0, benefits: [], is_active: true, sort_order: plans.length })}
            className="h-9 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-semibold text-[13px] inline-flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> New Plan
          </button>
        </div>

        {isLoading ? (
          <div className="text-sm text-[hsl(var(--ax-secondary))]">Loading…</div>
        ) : plans.length === 0 ? (
          <div className="ax-card p-6 text-center text-sm text-[hsl(var(--ax-secondary))]">
            No membership plans yet. Create Follow (free), Access, and VIP tiers.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {plans.map((p) => (
              <div key={p.id} className="ax-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">{p.tier}</span>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(p)} className="h-7 w-7 rounded-md border border-[hsl(var(--ax-border))] flex items-center justify-center"><Pencil className="h-3.5 w-3.5" /></button>
                    <button
                      onClick={async () => { await deletePlan(p.id); refresh(); toast.success("Plan removed"); }}
                      className="h-7 w-7 rounded-md border border-[hsl(var(--ax-border))] flex items-center justify-center text-[hsl(var(--ax-red))]"
                    ><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="font-bold mt-1">{p.name}</div>
                <div className="text-sm text-[hsl(var(--ax-secondary))]">{money(p.price_cents)}</div>
                {Array.isArray(p.benefits) && p.benefits.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {(p.benefits as string[]).slice(0, 5).map((b, i) => (
                      <li key={i} className="text-[12px] text-[hsl(var(--ax-secondary))] flex items-start gap-1.5">
                        <Check className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))] mt-0.5 shrink-0" /> {b}
                      </li>
                    ))}
                  </ul>
                )}
                {!p.is_active && <div className="mt-2 text-[11px] font-semibold text-[hsl(var(--ax-amber))]">Disabled</div>}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-[hsl(var(--ax-faint))] mt-2">Billing is not connected — subscriptions use mock state. Stripe is the integration point.</p>
      </div>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" /> Subscribers ({members.length})
        </h3>
        {members.length === 0 ? (
          <div className="ax-card p-6 text-center text-sm text-[hsl(var(--ax-secondary))]">No paid subscribers yet.</div>
        ) : (
          <div className="ax-card divide-y divide-[hsl(var(--ax-line))]">
            {members.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 h-12">
                <span className="text-sm font-mono text-[hsl(var(--ax-secondary))]">{s.fan_user_id.slice(0, 8)}…</span>
                <span className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">{s.state === "vip" ? "VIP" : "Access"}</span>
                <span className="text-[12px] text-[hsl(var(--ax-faint))]">{new Date(s.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-[hsl(var(--ax-faint))] mt-2">Fan identities are shown minimally for privacy.</p>
      </div>

      {editing && (
        <PlanDialog
          plan={editing}
          athleteId={athleteId}
          organizationId={organizationId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="ax-card p-4 text-center">
      <div className="text-2xl font-black text-[hsl(var(--ax-accent))]">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-[hsl(var(--ax-faint))] mt-0.5">{label}</div>
    </div>
  );
}

function PlanDialog({
  plan, athleteId, organizationId, onClose, onSaved,
}: {
  plan: Partial<MembershipPlan>;
  athleteId: string; organizationId: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(plan.name ?? "");
  const [tier, setTier] = useState(plan.tier ?? "access");
  const [price, setPrice] = useState(String((plan.price_cents ?? 0) / 100));
  const [benefits, setBenefits] = useState((Array.isArray(plan.benefits) ? (plan.benefits as string[]) : []).join("\n"));
  const [active, setActive] = useState(plan.is_active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const input: PlanInput = {
        id: plan.id,
        organization_id: organizationId,
        athlete_id: athleteId,
        tier,
        name: name.trim(),
        price_cents: Math.round((parseFloat(price) || 0) * 100),
        benefits: benefits.split("\n").map((b) => b.trim()).filter(Boolean),
        is_active: active,
        sort_order: plan.sort_order ?? 0,
      };
      await upsertPlan(input);
      toast.success("Plan saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md ax-card p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-4">{plan.id ? "Edit Plan" : "New Plan"}</h3>
        <div className="space-y-3">
          <Field label="Tier">
            <select value={tier} onChange={(e) => setTier(e.target.value as MembershipPlan["tier"])} className="ax-field capitalize">
              {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Plan name"><input className="ax-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mooney Access" /></Field>
          <Field label="Price (USD / month, 0 = free)"><input className="ax-field" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="Benefits (one per line)"><textarea className="ax-field min-h-[90px]" value={benefits} onChange={(e) => setBenefits(e.target.value)} placeholder={"Exclusive content\nEarly drops\nEarly camp access"} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 h-10 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Plan
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-1">{label}</label>
      {children}
    </div>
  );
}
