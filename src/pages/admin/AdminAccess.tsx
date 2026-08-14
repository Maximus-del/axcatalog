// Global Access view — athletes ranked by membership. Configure plans on each
// athlete's Access tab (shared membership_plans / athlete_follows objects).
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { AthletePhoto } from "@/components/fan/ui/AthletePhoto";

interface FollowLite { athlete_id: string; state: string }

export default function AdminAccess() {
  const { data: athletes = [] } = useDiscoverAthletes();
  const { data: follows = [] } = useQuery({
    queryKey: ["op-all-follows"],
    queryFn: async (): Promise<FollowLite[]> => {
      const { data, error } = await supabase.from("athlete_follows" as never).select("athlete_id, state");
      if (error) throw error;
      return (data ?? []) as unknown as FollowLite[];
    },
  });

  const stats = useMemo(() => {
    const m = new Map<string, { followers: number; access: number }>();
    for (const f of follows) {
      const s = m.get(f.athlete_id) ?? { followers: 0, access: 0 };
      s.followers += 1;
      if (f.state === "subscriber" || f.state === "vip") s.access += 1;
      m.set(f.athlete_id, s);
    }
    return m;
  }, [follows]);

  const ranked = useMemo(
    () => [...(athletes as PublicAthlete[])].sort((a, b) => (stats.get(b.id)?.access ?? 0) - (stats.get(a.id)?.access ?? 0)),
    [athletes, stats],
  );
  const totalAccess = follows.filter((f) => f.state === "subscriber" || f.state === "vip").length;

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Access & Memberships</h1>
        <p className="text-sm text-muted-foreground mt-1">{totalAccess.toLocaleString()} Access members across the network. Configure plans on each athlete's Access tab.</p>
      </div>

      <div className="ax-card divide-y divide-[hsl(var(--ax-line))]">
        {ranked.map((a) => {
          const s = stats.get(a.id) ?? { followers: 0, access: 0 };
          return (
            <Link key={a.id} to={`/admin/athletes/${a.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[hsl(var(--ax-line))] transition-colors">
              <AthletePhoto athlete={a} className="h-10 w-10 rounded-full" textClass="text-xs" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{athleteName(a)}</div>
                <div className="text-[12px] text-[hsl(var(--ax-faint))]">{[a.position, a.league].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{s.followers}</div>
                <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))]">Followers</div>
              </div>
              <div className="text-right w-16">
                <div className="text-sm font-bold text-[hsl(var(--ax-accent))] flex items-center justify-end gap-1"><Star className="h-3.5 w-3.5" />{s.access}</div>
                <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))]">Access</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
