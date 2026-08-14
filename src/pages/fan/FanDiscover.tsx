// Discover — visual, sectioned athlete + merch + camp discovery.
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useDiscoverAthletes, useAllAthleteProducts } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete, type PublicAthleteProduct } from "@/lib/ecosystem/types";
import { demoCamps } from "@/lib/ecosystem/demo-content";
import { AthleteCardFeatured, AthleteCardCompact, AthleteRow } from "@/components/fan/ui/AthleteCard";
import { HorizontalSection } from "@/components/fan/ui/HorizontalSection";
import { CampCard } from "@/components/fan/ui/CampCard";
import { ProductCard } from "@/components/fan/ProductCard";
import { FollowButton } from "@/components/fan/FollowButton";
import { Skeleton } from "@/components/ui/skeleton";

export default function FanDiscover() {
  const { data: athletes = [], isLoading } = useDiscoverAthletes();
  const { data: products = [] } = useAllAthleteProducts(24);
  const [q, setQ] = useState("");

  const list = athletes as PublicAthlete[];
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of list) m.set(a.id, athleteName(a));
    return m;
  }, [list]);

  const searchResults = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    return list.filter((a) =>
      [athleteName(a), a.position, a.team_name, a.league].filter(Boolean).some((v) => (v as string).toLowerCase().includes(term)),
    );
  }, [list, q]);

  const featured = list.slice(0, 6);
  const trending = list.slice(6, 16);
  const nfl = list.filter((a) => a.league === "NFL");
  const college = list.filter((a) => a.league === "NCAA");
  const rising = list.slice(-8);
  const camps = useMemo(
    () => demoCamps(list.map((a) => ({ id: a.id, slug: a.slug, first: a.first_name }))).slice(0, 8),
    [list],
  );

  return (
    <div className="space-y-7">
      <div className="relative sticky top-14 z-30 bg-background/90 backdrop-blur py-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="portal-input w-full pl-9"
          placeholder="Search athletes, teams, sports..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : searchResults ? (
        searchResults.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">No athletes match “{q}”.</p>
        ) : (
          <ul className="space-y-2.5">
            {searchResults.map((a) => (
              <AthleteRow key={a.id} athlete={a}>
                <FollowButton athleteId={a.id} />
              </AthleteRow>
            ))}
          </ul>
        )
      ) : (
        <>
          <HorizontalSection title="Featured">
            {featured.map((a) => (
              <AthleteCardFeatured key={a.id} athlete={a} />
            ))}
          </HorizontalSection>

          {trending.length > 0 && (
            <HorizontalSection title="Trending Athletes">
              {trending.map((a) => (
                <AthleteCardCompact key={a.id} athlete={a} />
              ))}
            </HorizontalSection>
          )}

          {products.length > 0 && (
            <HorizontalSection title="Upcoming Drops">
              {(products as PublicAthleteProduct[]).slice(0, 12).map((p) => (
                <div key={p.id} className="w-[160px] shrink-0 snap-start">
                  <ProductCard product={p} athleteName={nameById.get(p.athlete_id)} />
                </div>
              ))}
            </HorizontalSection>
          )}

          {nfl.length > 0 && (
            <HorizontalSection title="NFL">
              {nfl.slice(0, 14).map((a) => (
                <AthleteCardCompact key={a.id} athlete={a} />
              ))}
            </HorizontalSection>
          )}

          {college.length > 0 && (
            <HorizontalSection title="College">
              {college.map((a) => (
                <AthleteCardCompact key={a.id} athlete={a} />
              ))}
            </HorizontalSection>
          )}

          <HorizontalSection title="Upcoming Camps" action={{ label: "See all", to: "/feed/camps" }}>
            {camps.map((c) => (
              <CampCard key={c.id} camp={c} athleteName={nameById.get(c.athleteId)} />
            ))}
          </HorizontalSection>

          {rising.length > 0 && (
            <HorizontalSection title="Rising">
              {rising.map((a) => (
                <AthleteCardCompact key={a.id} athlete={a} />
              ))}
            </HorizontalSection>
          )}
        </>
      )}
    </div>
  );
}
