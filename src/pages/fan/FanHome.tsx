// Personalized Home feed — Stories row + filter chips + mixed feed cards.
// Demo narrative content is layered over REAL product drops for followed
// athletes who have published merch.
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useFollows } from "@/hooks/useFan";
import { useDiscoverAthletes, useFeedProducts } from "@/hooks/useDiscoverAthletes";
import type { PublicAthlete, PublicAthleteProduct } from "@/lib/ecosystem/types";
import { demoFeed } from "@/lib/ecosystem/demo-content";
import type { FeedItem, FeedType } from "@/lib/ecosystem/content-types";
import { StoryRow } from "@/components/fan/ui/StoryRow";
import { FeedCard } from "@/components/fan/ui/FeedCard";
import { EmptyState } from "@/components/fan/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Filter = "for_you" | "drops" | "content" | "camps";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "for_you", label: "For You" },
  { key: "drops", label: "Drops" },
  { key: "content", label: "Content" },
  { key: "camps", label: "Camps" },
];
const FILTER_TYPES: Record<Filter, Set<FeedType> | null> = {
  for_you: null,
  drops: new Set<FeedType>(["drop"]),
  content: new Set<FeedType>(["exclusive", "photoshoot", "update", "article"]),
  camps: new Set<FeedType>(["camp", "event"]),
};

export default function FanHome() {
  const { followedIds, isLoading: followsLoading } = useFollows();
  const followedArr = useMemo(() => [...followedIds], [followedIds]);
  const { data: athletes = [] } = useDiscoverAthletes();
  const { data: products = [] } = useFeedProducts(followedArr);
  const [filter, setFilter] = useState<Filter>("for_you");

  const followedAthletes = useMemo(
    () => (athletes as PublicAthlete[]).filter((a) => followedIds.has(a.id)),
    [athletes, followedIds],
  );
  const athleteById = useMemo(() => {
    const m = new Map<string, PublicAthlete>();
    for (const a of followedAthletes) m.set(a.id, a);
    return m;
  }, [followedAthletes]);
  const productByAthlete = useMemo(() => {
    const m = new Map<string, PublicAthleteProduct>();
    for (const p of products as PublicAthleteProduct[]) if (!m.has(p.athlete_id)) m.set(p.athlete_id, p);
    return m;
  }, [products]);

  const feed = useMemo<FeedItem[]>(
    () => demoFeed(followedAthletes.map((a) => ({ id: a.id, slug: a.slug, first: a.first_name }))),
    [followedAthletes],
  );
  const newIds = useMemo(() => new Set(feed.map((f) => f.athleteId)), [feed]);

  const visible = useMemo(() => {
    const types = FILTER_TYPES[filter];
    return types ? feed.filter((f) => types.has(f.type)) : feed;
  }, [feed, filter]);

  if (followsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (followedIds.size === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Your Access starts here"
        body="Follow athletes to get drops, camps, content, and updates in one place."
        ctaLabel="Discover Athletes"
        ctaTo="/feed/discover"
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Stories */}
      <section>
        <h2 className="ax-section-header mb-3">Your Access</h2>
        <StoryRow athletes={followedAthletes} newIds={newIds} />
      </section>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 scroll-touch sticky top-14 z-30 bg-background/80 backdrop-blur py-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 h-8 px-3.5 rounded-full text-[13px] font-semibold border transition-colors",
              filter === f.key ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      <div className="space-y-4 max-w-xl">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">Nothing here yet — check another filter.</p>
        ) : (
          visible.map((item) => {
            const athlete = athleteById.get(item.athleteId);
            if (!athlete) return null;
            return (
              <FeedCard
                key={item.id}
                item={item}
                athlete={athlete}
                product={item.type === "drop" ? productByAthlete.get(item.athleteId) : undefined}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
