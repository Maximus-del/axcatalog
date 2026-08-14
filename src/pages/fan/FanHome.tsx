// Personalized fan feed — new merch from athletes you follow.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Compass, Sparkles } from "lucide-react";
import { useFollows } from "@/hooks/useFan";
import { useDiscoverAthletes, useFeedProducts } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { AthleteAvatar } from "@/components/fan/AthleteAvatar";
import { ProductCard } from "@/components/fan/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";

export default function FanHome() {
  const { followedIds, isLoading: followsLoading } = useFollows();
  const followedArr = useMemo(() => [...followedIds], [followedIds]);
  const { data: athletes = [] } = useDiscoverAthletes();
  const { data: products = [], isLoading: productsLoading } = useFeedProducts(followedArr);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of athletes as PublicAthlete[]) m.set(a.id, athleteName(a));
    return m;
  }, [athletes]);

  const followedAthletes = useMemo(
    () => (athletes as PublicAthlete[]).filter((a) => followedIds.has(a.id)),
    [athletes, followedIds],
  );

  if (followsLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
    );
  }

  if (followedIds.size === 0) {
    return (
      <div className="pt-6">
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-accent/15 flex items-center justify-center mb-4">
            <Sparkles className="h-7 w-7 text-accent" />
          </div>
          <h2 className="text-lg font-black">Build your feed</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
            Follow athletes to see their newest merch, drops, and exclusive content here.
          </p>
          <Link
            to="/feed/discover"
            className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-full bg-accent text-accent-foreground font-bold text-sm"
          >
            <Compass className="h-4 w-4" /> Discover athletes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Following row */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="ax-section-header">Following</h2>
          <Link to="/feed/following" className="text-[12px] font-semibold text-accent">Manage</Link>
        </div>
        <div className="flex gap-4 overflow-x-auto -mx-4 px-4 pb-1">
          {followedAthletes.map((a) => (
            <Link key={a.id} to={`/a/${a.slug}`} className="flex flex-col items-center gap-1.5 shrink-0 w-16">
              <AthleteAvatar athlete={a} />
              <span className="text-[11px] text-muted-foreground text-center leading-tight truncate w-full">
                {athleteName(a).split(" ")[0]}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Feed */}
      <section>
        <h2 className="ax-section-header mb-3">New from athletes you follow</h2>
        {productsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No merch from your athletes yet — check back soon.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} athleteName={nameById.get(p.athlete_id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
