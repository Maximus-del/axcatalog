// Camps — discover camps from athletes you follow first, then the network.
import { useMemo } from "react";
import { Calendar } from "lucide-react";
import { useFollows } from "@/hooks/useFan";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { demoCamps } from "@/lib/ecosystem/demo-content";
import { CampCard } from "@/components/fan/ui/CampCard";
import { EmptyState } from "@/components/fan/ui/EmptyState";

export default function FanCamps() {
  const { followedIds } = useFollows();
  const { data: athletes = [] } = useDiscoverAthletes();
  const list = athletes as PublicAthlete[];

  const nameById = useMemo(() => new Map(list.map((a) => [a.id, athleteName(a)] as const)), [list]);
  const followed = list.filter((a) => followedIds.has(a.id));
  const others = list.filter((a) => !followedIds.has(a.id));

  const followedCamps = useMemo(
    () => demoCamps(followed.map((a) => ({ id: a.id, slug: a.slug, first: a.first_name }))),
    [followed],
  );
  const networkCamps = useMemo(
    () => demoCamps(others.map((a) => ({ id: a.id, slug: a.slug, first: a.first_name }))).slice(0, 12),
    [others],
  );

  if (list.length === 0) {
    return <EmptyState icon={Calendar} title="No camps yet" body="Camps from athletes across the network will appear here." ctaLabel="Discover Athletes" ctaTo="/feed/discover" />;
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-xl font-black tracking-tight">Camps &amp; Events</h1>
        <p className="text-sm text-muted-foreground mt-1">Save a camp to get a reminder when registration opens.</p>
      </div>

      {followedCamps.length > 0 && (
        <section>
          <h2 className="ax-section-header mb-3">From athletes you follow</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {followedCamps.map((c) => (
              <CampCard key={c.id} camp={c} athleteName={nameById.get(c.athleteId)} block />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="ax-section-header mb-3">Across the network</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {networkCamps.map((c) => (
            <CampCard key={c.id} camp={c} athleteName={nameById.get(c.athleteId)} block />
          ))}
        </div>
      </section>
    </div>
  );
}
