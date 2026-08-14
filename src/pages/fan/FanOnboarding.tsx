// Fast onboarding: follow ≥3 athletes, pick optional interests, then feed.
// Full-screen (no bottom nav). Following writes real athlete_follows rows.
import { useMemo, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Check, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import { useFollows } from "@/hooks/useFan";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { AthletePhoto } from "@/components/fan/ui/AthletePhoto";
import { FollowButton } from "@/components/fan/FollowButton";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const INTERESTS = ["NFL", "College Football", "High School", "Training", "Merch", "Camps", "Behind the Scenes", "Lifestyle"];

export default function FanOnboarding() {
  const { user, session, hasFanProfile, loading } = useAuth();
  const navigate = useNavigate();
  const { data: athletes = [], isLoading } = useDiscoverAthletes();
  const { followedIds } = useFollows();
  const [step, setStep] = useState<1 | 2>(1);
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  if (loading) return null;
  if (!session) return <Navigate to="/join" replace />;
  if (!hasFanProfile) return <Navigate to="/join" replace />;

  const featured = (athletes as PublicAthlete[]).slice(0, 15);

  async function finish() {
    if (!user) return;
    setSaving(true);
    try {
      await supabase
        .from("fan_profiles" as never)
        .update({ preferences: { interests: [...interests] } } as never)
        .eq("id", user.id);
    } catch {
      /* preferences are optional; don't block entry */
    } finally {
      setSaving(false);
      navigate("/feed", { replace: true });
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-14 flex items-center justify-between px-4 sm:px-6 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center text-accent-foreground font-black text-sm">G</span>
          <span className="font-black tracking-tight text-[15px]">GOAT FARM <span className="text-accent">ACCESS</span></span>
        </div>
        <button onClick={finish} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">Skip</button>
      </header>

      <div className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 pb-28">
        {step === 1 ? (
          <>
            <h1 className="text-2xl font-black tracking-tight">Who do you want access to?</h1>
            <p className="text-sm text-muted-foreground mt-1.5">Follow at least 3 athletes to build your feed.</p>
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
                {featured.map((a) => (
                  <div key={a.id} className="rounded-2xl overflow-hidden border border-border bg-card">
                    <AthletePhoto athlete={a} className="h-24 w-full" textClass="text-2xl" />
                    <div className="p-2.5">
                      <div className="font-semibold text-sm truncate">{athleteName(a)}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[a.position, a.league].filter(Boolean).join(" · ")}
                      </div>
                      <FollowButton athleteId={a.id} className="mt-2 w-full h-8" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black tracking-tight">What are you into?</h1>
            <p className="text-sm text-muted-foreground mt-1.5">Optional — helps tune your feed.</p>
            <div className="flex flex-wrap gap-2 mt-5">
              {INTERESTS.map((it) => {
                const on = interests.has(it);
                return (
                  <button
                    key={it}
                    onClick={() => setInterests((s) => { const n = new Set(s); if (n.has(it)) n.delete(it); else n.add(it); return n; })}
                    className={cn(
                      "h-10 px-4 rounded-full text-sm font-semibold border inline-flex items-center gap-1.5 transition-colors",
                      on ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground",
                    )}
                  >
                    {on && <Check className="h-4 w-4" />} {it}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Sticky footer CTA */}
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 backdrop-blur pb-safe">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3">
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={followedIds.size === 0}
              className="w-full h-12 rounded-xl bg-accent text-accent-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {followedIds.size === 0 ? "Follow at least 1 to continue" : `Continue · Following ${followedIds.size}`}
              {followedIds.size > 0 && <ArrowRight className="h-4 w-4" />}
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={saving}
              className="w-full h-12 rounded-xl bg-accent text-accent-foreground font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Enter Goat Farm Access
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
