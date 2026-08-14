// Templates — configuration/defaults for spinning up new athletes fast.
// Apply from an athlete's profile ("Apply Template").
import { useTemplates } from "@/hooks/useContent";
import { LayoutTemplate, Check } from "lucide-react";

export default function AdminTemplates() {
  const { data: templates = [], isLoading } = useTemplates();

  return (
    <div className="p-6 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">Reusable athlete configurations. Apply one from an athlete's profile to provision default plans and modules.</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {templates.map((t) => {
            const cfg = t.config as { modules?: string[]; plans?: { tier: string; name: string; price_cents: number }[]; content_categories?: string[] };
            return (
              <div key={t.id} className="ax-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <LayoutTemplate className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">{t.kind.replace("_", " ")}</span>
                </div>
                <div className="font-bold text-lg">{t.name}</div>
                <p className="text-[13px] text-[hsl(var(--ax-secondary))] mt-1">{t.description}</p>

                <div className="mt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">Modules</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(cfg.modules ?? []).map((m) => (
                      <span key={m} className="text-[11px] font-semibold rounded-full bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] px-2 py-0.5 capitalize">{m}</span>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1.5">Default Plans</div>
                  <ul className="space-y-1">
                    <li className="text-[12px] text-[hsl(var(--ax-secondary))] flex items-center gap-1.5"><Check className="h-3 w-3 text-[hsl(var(--ax-accent))]" /> Follow · Free</li>
                    {(cfg.plans ?? []).map((p) => (
                      <li key={p.tier} className="text-[12px] text-[hsl(var(--ax-secondary))] flex items-center gap-1.5">
                        <Check className="h-3 w-3 text-[hsl(var(--ax-accent))]" /> {p.name} · {p.price_cents ? `$${(p.price_cents / 100).toFixed(0)}/mo` : "Free"}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
