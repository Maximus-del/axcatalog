// Fan-facing membership tier comparison + mock subscribe (no billing).
// Reads the shared membership_plans; writing sets follow state + a subscription.
import { Check, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/auth/AuthProvider";
import { useAthletePlans } from "@/hooks/useContent";
import { useAthleteAccess, useFollowActions } from "@/hooks/useFan";
import { subscribeMock } from "@/lib/ecosystem/content";
import type { MembershipPlan } from "@/lib/ecosystem/types";
import { cn } from "@/lib/utils";

const money = (cents: number) => (cents ? `$${(cents / 100).toFixed(0)}/mo` : "Free");

export function AccessPlans({ athleteId, canFollow }: { athleteId: string; canFollow: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: plans = [], isLoading } = useAthletePlans(athleteId);
  const access = useAthleteAccess(athleteId);
  const { follow } = useFollowActions();
  const [busy, setBusy] = useState<string | null>(null);

  const active = plans.filter((p) => p.is_active);
  const paid = active.filter((p) => p.tier !== "follow");

  async function choose(plan: MembershipPlan) {
    if (!user || !canFollow) { toast.info("Sign in to subscribe."); return; }
    setBusy(plan.id);
    try {
      await subscribeMock(user.id, athleteId, plan.tier === "vip" ? "vip" : "access", plan.id);
      await qc.invalidateQueries({ queryKey: ["fan-follows", user.id] });
      toast.success(`You're in — ${plan.name} unlocked`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(null); }
  }

  async function justFollow() {
    if (!canFollow) { toast.info("Sign in to follow."); return; }
    try { await follow.mutateAsync(athleteId); toast.success("Following"); } catch { /* ignore */ }
  }

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading plans…</div>;

  if (paid.length === 0) {
    return (
      <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-4">
        <div className="font-bold">Follow — Free</div>
        <p className="text-[13px] text-muted-foreground mt-1">Merch updates, camp announcements, and public content.</p>
        {canFollow && !access.isFollowing && (
          <button onClick={justFollow} className="mt-3 h-10 px-4 rounded-xl bg-accent text-accent-foreground font-bold text-sm">Follow</button>
        )}
        <p className="text-[11px] text-muted-foreground mt-3">Paid Access tiers aren't set up for this athlete yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Free follow tier */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold">Follow</div>
            <div className="text-[13px] text-muted-foreground">Free · updates & public content</div>
          </div>
          {access.isFollowing ? (
            <span className="text-[12px] font-bold text-accent">Following</span>
          ) : canFollow ? (
            <button onClick={justFollow} className="h-9 px-4 rounded-full border border-border font-bold text-[13px]">Follow</button>
          ) : null}
        </div>
      </div>

      {paid.map((plan) => {
        const isCurrent = (plan.tier === "vip" && access.isVip) || (plan.tier === "access" && access.isMember && !access.isVip);
        return (
          <div key={plan.id} className={cn("rounded-2xl border p-4", plan.tier === "vip" ? "border-accent/40 bg-accent/[0.06]" : "border-border bg-card")}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-black flex items-center gap-1.5">
                  {plan.tier === "vip" && <Star className="h-4 w-4 text-accent" />}
                  {plan.name}
                </div>
                <div className="text-[13px] text-muted-foreground">{money(plan.price_cents)}</div>
              </div>
              {isCurrent ? (
                <span className="text-[12px] font-bold text-accent inline-flex items-center gap-1"><Check className="h-4 w-4" /> Active</span>
              ) : (
                <button
                  onClick={() => choose(plan)}
                  disabled={busy === plan.id}
                  className="h-9 px-4 rounded-full bg-accent text-accent-foreground font-bold text-[13px] inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {busy === plan.id && <Loader2 className="h-4 w-4 animate-spin" />} Get {plan.tier === "vip" ? "VIP" : "Access"}
                </button>
              )}
            </div>
            {Array.isArray(plan.benefits) && plan.benefits.length > 0 && (
              <ul className="mt-3 space-y-1">
                {(plan.benefits as string[]).map((b, i) => (
                  <li key={i} className="text-[13px] text-muted-foreground flex items-start gap-1.5">
                    <Check className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" /> {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-muted-foreground text-center">Billing isn't connected yet — subscribing uses a mock state so you can preview the experience.</p>
    </div>
  );
}
