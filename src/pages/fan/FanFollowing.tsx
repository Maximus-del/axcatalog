// Your Athletes — the fan's athlete library. Primary action is opening a
// profile; Following/unfollow is the de-emphasized pill on the right.
import { useMemo } from "react";
import { Star } from "lucide-react";
import { useFollows } from "@/hooks/useFan";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import type { PublicAthlete } from "@/lib/ecosystem/types";
import { demoFeedForAthlete } from "@/lib/ecosystem/demo-content";
import { FEED_TYPE_LABEL } from "@/lib/ecosystem/content-types";
import { AthleteRow } from "@/components/fan/ui/AthleteCard";
import { FollowButton } from "@/components/fan/FollowButton";
import { EmptyState } from "@/components/fan/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

export default function FanFollowing() {
  const { followedIds, isLoading } = useFollows();
  const { data: athletes = [] } = useDiscoverAthletes();

  const followed = useMemo(
    () => (athletes as PublicAthlete[]).filter((a) => followedIds.has(a.id)),
    [athletes, followedIds],
  );

  function note(a: PublicAthlete): string {
    const items = demoFeedForAthlete({ id: a.id, slug: a.slug, first: a.first_name });
    if (items.length === 0) return [a.position, a.team_name, a.league].filter(Boolean).join(" · ");
    return `${items.length} new · ${FEED_TYPE_LABEL[items[0].type]}`;
  }

  if (isLoading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (followed.length === 0) {
    return (
      <EmptyState
        icon={Star}
        title="Your Access starts here"
        body="Follow athletes to get drops, camps, content, and updates in one place."
        ctaLabel="Discover Athletes"
        ctaTo="/feed/discover"
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black tracking-tight">Your Athletes</h1>
      <ul className="space-y-2.5">
        {followed.map((a) => (
          <li key={a.id}>
            <AthleteRow athlete={a} note={note(a)}>
              <FollowButton athleteId={a.id} />
            </AthleteRow>
          </li>
        ))}
      </ul>
    </div>
  );
}
