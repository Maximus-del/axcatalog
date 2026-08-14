// Athlete discovery — browse and follow athletes across the network.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { AthleteAvatar } from "@/components/fan/AthleteAvatar";
import { FollowButton } from "@/components/fan/FollowButton";
import { Skeleton } from "@/components/ui/skeleton";

export default function FanDiscover() {
  const { data: athletes = [], isLoading } = useDiscoverAthletes();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = athletes as PublicAthlete[];
    if (!term) return list;
    return list.filter((a) =>
      [athleteName(a), a.position, a.team_name, a.league, a.org_name]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(term)),
    );
  }, [athletes, q]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black tracking-tight">Discover athletes</h1>
        <p className="text-sm text-muted-foreground mt-1">Follow athletes to personalize your feed.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="portal-input w-full pl-9"
          placeholder="Search by name, position, team…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No athletes match “{q}”.</p>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border bg-card p-3 flex items-center gap-3">
              <Link to={`/a/${a.slug}`} className="shrink-0">
                <AthleteAvatar athlete={a} />
              </Link>
              <Link to={`/a/${a.slug}`} className="min-w-0 flex-1">
                <div className="font-semibold truncate">{athleteName(a)}</div>
                <div className="text-[12px] text-muted-foreground truncate">
                  {[a.position, a.team_name, a.league].filter(Boolean).join(" · ") || "Athlete"}
                </div>
              </Link>
              <FollowButton athleteId={a.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
