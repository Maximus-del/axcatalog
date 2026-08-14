// Personalized Home — hierarchical, not an infinite wall. Featured moment,
// Stories, a focused "New From Your Athletes" feed with filters, then
// discovery modules (Camps, Stories, Continue Exploring).
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useFanEvents } from "@/hooks/useFanEvents";
import type { PublicAthlete } from "@/lib/ecosystem/types";
import { demoCamps, demoArticles } from "@/lib/ecosystem/demo-content";
import { recommendAthletes } from "@/lib/ecosystem/recommend";
import type { FeedType } from "@/lib/ecosystem/content-types";
import { StoryRow } from "@/components/fan/ui/StoryRow";
import { FeedCard } from "@/components/fan/ui/FeedCard";
import { FeaturedCard } from "@/components/fan/ui/FeaturedCard";
import { CampCard } from "@/components/fan/ui/CampCard";
import { ArticleCard } from "@/components/fan/ui/ArticleCard";
import { AthleteCardCompact } from "@/components/fan/ui/AthleteCard";
import { HorizontalSection } from "@/components/fan/ui/HorizontalSection";
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
  const { followed, followedIds, feed, newIds, featured, athletes, loading } = useFanEvents();
  const [filter, setFilter] = useState<Filter>("for_you");

  const athleteById = useMemo(() => new Map(followed.map((a) => [a.id, a] as const)), [followed]);
  const camps = useMemo(() => demoCamps(followed.map((a) => ({ id: a.id, slug: a.slug, first: a.first_name }))).slice(0, 8), [followed]);
  const articles = useMemo(() => demoArticles(followed.map((a) => ({ id: a.id, slug: a.slug, first: a.first_name }))).slice(0, 8), [followed]);
  const recs = useMemo(() => recommendAthletes(athletes, followedIds, 12), [athletes, followedIds]);

  const featuredAthlete = featured ? athleteById.get(featured.athleteId) : undefined;
  const nameById = useMemo(() => new Map((athletes as PublicAthlete[]).map((a) => [a.id, a.full_name || `${a.first_name} ${a.last_name}`] as const)), [athletes]);

  const visible = useMemo(() => {
    const types = FILTER_TYPES[filter];
    const list = types ? feed.filter((f) => types.has(f.type)) : feed;
    return list.filter((f) => f.id !== featured?.id).slice(0, 12);
  }, [feed, filter, featured]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-64 rounded-3xl" />
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
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
    <div className="space-y-7">
      <section>
        <h2 className="ax-section-header mb-3">Your Access</h2>
        <StoryRow athletes={followed} newIds={newIds} />
      </section>

      {featured && featuredAthlete && <FeaturedCard item={featured} athlete={featuredAthlete} />}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="ax-section-header">New From Your Athletes</h2>
        </div>
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 scroll-touch mb-4">
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
        <div className="space-y-4 max-w-xl">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nothing here yet — try another filter.</p>
          ) : (
            visible.map((item) => {
              const athlete = athleteById.get(item.athleteId);
              return athlete ? <FeedCard key={item.id} item={item} athlete={athlete} /> : null;
            })
          )}
        </div>
      </section>

      {camps.length > 0 && (
        <HorizontalSection title="Upcoming Camps" action={{ label: "See all", to: "/feed/camps" }}>
          {camps.map((c) => <CampCard key={c.id} camp={c} athleteName={nameById.get(c.athleteId)} />)}
        </HorizontalSection>
      )}

      {articles.length > 0 && (
        <HorizontalSection title="From the Farm">
          {articles.map((a) => <ArticleCard key={a.id} article={a} />)}
        </HorizontalSection>
      )}

      {recs.length > 0 && (
        <HorizontalSection title="Continue Exploring" action={{ label: "Discover", to: "/feed/discover" }}>
          {recs.map((r) => <AthleteCardCompact key={r.athlete.id} athlete={r.athlete} />)}
        </HorizontalSection>
      )}
    </div>
  );
}
