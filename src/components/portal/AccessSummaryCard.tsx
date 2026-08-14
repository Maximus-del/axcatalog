// Athlete-facing Access summary — followers / Access / VIP counts via the
// permission-checked athlete_access_summary RPC (no fan rows exposed).
import { useQuery } from "@tanstack/react-query";
import { Users, Star, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Summary { followers: number; access: number; vip: number }

export function AccessSummaryCard({ athleteId }: { athleteId: string }) {
  const { data } = useQuery({
    queryKey: ["access-summary", athleteId],
    queryFn: async (): Promise<Summary> => {
      const { data, error } = await supabase.rpc("athlete_access_summary" as never, { _athlete_id: athleteId } as never);
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as Summary | null;
      return row ?? { followers: 0, access: 0, vip: 0 };
    },
  });
  const stats = [
    { label: "Followers", value: data?.followers ?? 0, icon: Users },
    { label: "Access", value: data?.access ?? 0, icon: Star },
    { label: "VIP", value: data?.vip ?? 0, icon: Crown },
  ];
  return (
    <section>
      <div className="text-sm font-bold uppercase tracking-[0.1em] text-accent mb-3">Your Access</div>
      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl border border-border bg-card p-4 text-center">
              <Icon className="h-4 w-4 text-accent mx-auto" />
              <div className="text-2xl font-bold tabular-nums mt-1.5">{s.value.toLocaleString()}</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">Fans following and subscribing to your Goat Farm Access.</p>
    </section>
  );
}
