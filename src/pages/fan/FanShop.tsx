// Shop — personalized merch. "From athletes you follow" first, then network
// drops. Real products from public_athlete_products; checkout hands off to AX.
import { useMemo } from "react";
import { ShoppingBag } from "lucide-react";
import { useFollows } from "@/hooks/useFan";
import { useDiscoverAthletes, useAllAthleteProducts, useFeedProducts } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete, type PublicAthleteProduct } from "@/lib/ecosystem/types";
import { ProductCard } from "@/components/fan/ProductCard";
import { HorizontalSection } from "@/components/fan/ui/HorizontalSection";
import { EmptyState } from "@/components/fan/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

export default function FanShop() {
  const { followedIds } = useFollows();
  const followedArr = useMemo(() => [...followedIds], [followedIds]);
  const { data: athletes = [] } = useDiscoverAthletes();
  const { data: all = [], isLoading } = useAllAthleteProducts(48);
  const { data: followed = [] } = useFeedProducts(followedArr);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of athletes as PublicAthlete[]) m.set(a.id, athleteName(a));
    return m;
  }, [athletes]);

  const allProducts = all as PublicAthleteProduct[];
  const followedProducts = followed as PublicAthleteProduct[];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
      </div>
    );
  }

  if (allProducts.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="No drops yet"
        body="Merch from athletes across the network will show up here."
        ctaLabel="Discover Athletes"
        ctaTo="/feed/discover"
      />
    );
  }

  return (
    <div className="space-y-7">
      <h1 className="text-xl font-black tracking-tight">Shop</h1>

      {followedProducts.length > 0 && (
        <HorizontalSection title="From athletes you follow" action={{ label: "See all", to: "/feed/following" }}>
          {followedProducts.slice(0, 12).map((p) => (
            <div key={p.id} className="w-[160px] shrink-0 snap-start">
              <ProductCard product={p} athleteName={nameById.get(p.athlete_id)} />
            </div>
          ))}
        </HorizontalSection>
      )}

      <section>
        <h2 className="ax-section-header mb-3">New Drops</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {allProducts.slice(0, 9).map((p) => (
            <ProductCard key={p.id} product={p} athleteName={nameById.get(p.athlete_id)} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="ax-section-header mb-3">All Athletes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {allProducts.map((p) => (
            <ProductCard key={p.id} product={p} athleteName={nameById.get(p.athlete_id)} />
          ))}
        </div>
      </section>
    </div>
  );
}
