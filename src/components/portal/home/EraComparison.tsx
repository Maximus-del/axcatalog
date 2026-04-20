// Mobile-first. Test at 375px before merging.
import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface TeamRow {
  id: string;
  name: string;
  primary_color: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface Props {
  athleteId: string;
}

/**
 * Era Comparison — only renders when athlete has 2+ team_memberships.
 * Stacks vertically on mobile (current era top, previous below) with
 * a comparison badge between. Stub revenue numbers for now.
 */
export function EraComparison({ athleteId }: Props) {
  const [teams, setTeams] = useState<TeamRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("team_memberships")
        .select("start_date, end_date, team:teams(id, name, primary_color)")
        .eq("athlete_id", athleteId)
        .order("start_date", { ascending: false });
      if (cancelled) return;
      const rows = (data ?? [])
        .map((r) => {
          const team = Array.isArray(r.team) ? r.team[0] : r.team;
          return team
            ? {
                id: team.id,
                name: team.name,
                primary_color: team.primary_color,
                start_date: r.start_date,
                end_date: r.end_date,
              }
            : null;
        })
        .filter(Boolean) as TeamRow[];
      setTeams(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  if (teams === null) {
    return <Skeleton className="h-48 rounded-xl" />;
  }
  if (teams.length < 2) return null;

  const [current, previous] = teams;
  const fmt = (d: string | null) =>
    d ? new Date(d).getFullYear().toString() : "—";

  return (
    <div className="space-y-3">
      <EraCard
        team={current}
        label="Current Era"
        period={`${fmt(current.start_date)} – Present`}
        revenue="$—"
        tone="accent"
      />
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/15 text-accent text-xs font-bold uppercase tracking-[0.14em] border border-accent/30">
          <ArrowUp className="h-3.5 w-3.5" /> On pace vs prior era
        </span>
      </div>
      <EraCard
        team={previous}
        label="Previous Era"
        period={`${fmt(previous.start_date)} – ${fmt(previous.end_date)}`}
        revenue="$—"
        tone="muted"
      />
    </div>
  );
}

function EraCard({
  team,
  label,
  period,
  revenue,
  tone,
}: {
  team: TeamRow;
  label: string;
  period: string;
  revenue: string;
  tone: "accent" | "muted";
}) {
  const dotColor = team.primary_color || (tone === "accent" ? "#2ecc71" : "#555");
  return (
    <article className="ax-card min-h-[148px] flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
          aria-hidden
        />
        <span className="ax-label">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-xl leading-tight truncate" title={team.name}>
            {team.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">{period}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="ax-label">Revenue</p>
          <p className={tone === "accent" ? "text-2xl font-bold text-accent tabular-nums mt-1" : "text-2xl font-bold text-muted-foreground tabular-nums mt-1"}>
            {revenue}
          </p>
        </div>
      </div>
    </article>
  );
}