// Global Events view — all camps/events across the network (shared events
// object). Create/edit from each athlete's Events tab.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin } from "lucide-react";
import { listOrgEvents } from "@/lib/ecosystem/content";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";

export default function AdminEvents() {
  const { data: events = [], isLoading } = useQuery({ queryKey: ["op-all-events"], queryFn: () => listOrgEvents(200) });
  const { data: athletes = [] } = useDiscoverAthletes();
  const nameById = useMemo(() => new Map((athletes as PublicAthlete[]).map((a) => [a.id, athleteName(a)] as const)), [athletes]);

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Camps & Events</h1>
        <p className="text-sm text-muted-foreground mt-1">All events across the network. Create and edit from each athlete's Events tab.</p>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : events.length === 0 ? (
        <div className="ax-card p-10 text-center">
          <CalendarDays className="h-8 w-8 text-[hsl(var(--ax-accent))] mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No events yet. Open an athlete and use the Events tab to create a camp or event.</p>
          <Link to="/admin/athletes" className="mt-4 inline-block text-[hsl(var(--ax-accent))] font-semibold text-sm">Go to athletes →</Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((e) => (
            <Link key={e.id} to={e.athlete_id ? `/admin/athletes/${e.athlete_id}` : "/admin/events"} className="ax-card p-4 hover:border-[hsl(var(--ax-accent)/0.5)] transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">{e.type.replace("_", " ")}</span>
                <span className="text-[11px] text-[hsl(var(--ax-faint))] capitalize">{e.status.replace("_", " ")}</span>
              </div>
              <div className="font-bold mt-1">{e.name}</div>
              <div className="text-[12px] text-[hsl(var(--ax-secondary))] mt-1">{e.athlete_id ? nameById.get(e.athlete_id) : "Goat Farm"}</div>
              <div className="mt-1.5 flex items-center gap-3 text-[12px] text-[hsl(var(--ax-faint))]">
                {e.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {e.city}</span>}
                {e.event_date && <span>{new Date(e.event_date).toLocaleDateString()}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
