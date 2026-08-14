// Access — the premium layer. Shows the athletes a fan has Access with and
// their exclusive content; otherwise a "Get Closer" state to unlock it.
// Access is a free preview until billing is wired (no payment here).
import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { useFollows } from "@/hooks/useFan";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { demoFeed } from "@/lib/ecosystem/demo-content";
import { ACCESS_TYPES } from "@/lib/ecosystem/content-types";
import { AthleteRow } from "@/components/fan/ui/AthleteCard";
import { AccessButton } from "@/components/fan/ui/AccessButton";
import { FeedCard } from "@/components/fan/ui/FeedCard";
import { Skeleton } from "@/components/ui/skeleton";

export default function FanAccess() {
  const { byAthlete, followedIds, isLoading } = useFollows();
  const { data: athletes = [] } = useDiscoverAthletes();
  const list = athletes as PublicAthlete[];

  const accessAthletes = useMemo(
    () => list.filter((a) => { const s = byAthlete.get(a.id)?.state; return s === "subscriber" || s === "vip"; }),
    [list, byAthlete],
  );
  const athleteById = useMemo(() => new Map(list.map((a) => [a.id, a] as const)), [list]);

  const accessContent = useMemo(() => {
    const feed = demoFeed(accessAthletes.map((a) => ({ id: a.id, slug: a.slug, first: a.first_name })));
    return feed.filter((f) => ACCESS_TYPES.has(f.type));
  }, [accessAthletes]);

  // Athletes to offer Access: ones the fan follows but hasn't upgraded, else featured.
  const offerAthletes = useMemo(() => {
    const followedNotAccess = list.filter((a) => followedIds.has(a.id) && !accessAthletes.includes(a));
    return (followedNotAccess.length > 0 ? followedNotAccess : list).slice(0, 8);
  }, [list, followedIds, accessAthletes]);

  if (isLoading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>;
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-xl font-black tracking-tight">Access</h1>
        <p className="text-sm text-muted-foreground mt-1">Exclusive content, early drops, and member perks from your athletes.</p>
      </div>

      {accessAthletes.length === 0 ? (
        <div className="rounded-3xl border border-accent/30 bg-accent/[0.06] px-6 py-10 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-accent/15 flex items-center justify-center mb-4">
            <Sparkles className="h-7 w-7 text-accent" />
          </div>
          <h2 className="text-lg font-black">Get closer to the athletes you follow</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Unlock exclusive content, early drops, member pricing, and early camp registration.
          </p>
        </div>
      ) : (
        <>
          <section>
            <h2 className="ax-section-header mb-3">Your Access</h2>
            <ul className="space-y-2.5">
              {accessAthletes.map((a) => (
                <AthleteRow key={a.id} athlete={a} note="Access member">
                  <AccessButton athleteId={a.id} />
                </AthleteRow>
              ))}
            </ul>
          </section>

          {accessContent.length > 0 && (
            <section>
              <h2 className="ax-section-header mb-3">Latest Access</h2>
              <div className="space-y-4 max-w-xl">
                {accessContent.map((item) => {
                  const a = athleteById.get(item.athleteId);
                  return a ? <FeedCard key={item.id} item={item} athlete={a} /> : null;
                })}
              </div>
            </section>
          )}
        </>
      )}

      <section>
        <h2 className="ax-section-header mb-3">{accessAthletes.length === 0 ? "Athletes offering Access" : "Add more Access"}</h2>
        <ul className="space-y-2.5">
          {offerAthletes.map((a) => (
            <AthleteRow key={a.id} athlete={a} note={[a.position, a.team_name, a.league].filter(Boolean).join(" · ")}>
              <AccessButton athleteId={a.id} />
            </AthleteRow>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground mt-3 text-center">
          Access &amp; VIP tiers are configurable per athlete. Billing connects later — Access is a free preview for now.
        </p>
      </section>
    </div>
  );
}
