// Discover — browse a real athlete network (Spotify/Netflix-style shelves),
// with search and lightweight quick-filters. Not a database table.
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
import { cn } from "@/lib/utils";

const DEFENSE = new Set(["CB", "S", "LB", "EDGE", "DE", "DT"]);
const QUICK = ["All", "NFL", "College", "QB", "WR", "RB", "Defense"] as const;
type Quick = (typeof QUICK)[number];

function matchesQuick(a: PublicAthlete, q: Quick): boolean {
  switch (q) {
    case "All": return true;
    case "NFL": return a.league === "NFL";
    case "College": return a.league === "NCAA";
    case "QB": return a.position === "QB";
    case "WR": return a.position === "WR" || a.position === "TE";
    case "RB": return a.position === "RB";
    case "Defense": return !!a.position && DEFENSE.has(a.position);
  }
}

export default function FanDiscover() {
  const { data: athletes = [], isLoading } = useDiscoverAthletes();
  const { data: products = [] } = useAllAthleteProducts(24);
  const [q, setQ] = useState("");
  const [quick, setQuick] = useState<Quick>("All");

  const list = athletes as PublicAthlete[];
  const nameById = useMemo(() => new Map(list.map((a) => [a.id, athleteName(a)] as const)), [list]);

  const searchResults = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return null;
    return list.filter((a) =>
      [athleteName(a), a.position, a.team_name, a.league].filter(Boolean).some((v) => (v as string).toLowerCase().includes(term)),
    );
  }, [list, q]);

  const camps = useMemo(() => demoCamps(list.map((a) => ({ id: a.id, slug: a.slug, first: a.first_name }))).slice(0, 10), [list]);

  const group = (fn: (a: PublicAthlete) => boolean) => list.filter(fn);

  return (
    <div className="space-y-7">
      <div className="sticky top-14 z-30 bg-background/90 backdrop-blur py-1 -mx-4 px-4 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="portal-input w-full pl-9"
            placeholder="Search athletes, teams, positions..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {!searchResults && (
          <div className="flex gap-2 overflow-x-auto scroll-touch">
            {QUICK.map((qk) => (
              <button
                key={qk}
                onClick={() => setQuick(qk)}
                className={cn(
                  "shrink-0 h-8 px-3.5 rounded-full text-[13px] font-semibold border transition-colors",
                  quick === qk ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground",
                )}
              >
                {qk}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      ) : searchResults ? (
        searchResults.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">No athletes match “{q}”.</p>
        ) : (
          <ul className="space-y-2.5">
            {searchResults.map((a) => (
              <AthleteRow key={a.id} athlete={a}><FollowButton athleteId={a.id} /></AthleteRow>
            ))}
          </ul>
        )
      ) : quick !== "All" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {group((a) => matchesQuick(a, quick)).map((a) => (
            <div key={a.id} className="w-full"><AthleteCardCompactFull athlete={a} /></div>
          ))}
        </div>
      ) : (
        <>
          <HorizontalSection title="Featured">
            {list.slice(0, 8).map((a) => <AthleteCardFeatured key={a.id} athlete={a} />)}
          </HorizontalSection>

          <HorizontalSection title="Trending">
            {list.slice(8, 22).map((a) => <AthleteCardCompact key={a.id} athlete={a} />)}
          </HorizontalSection>

          {products.length > 0 && (
            <HorizontalSection title="Upcoming Drops" action={{ label: "Shop", to: "/feed/shop" }}>
              {(products as PublicAthleteProduct[]).slice(0, 12).map((p) => (
                <div key={p.id} className="w-[160px] shrink-0 snap-start"><ProductCard product={p} athleteName={nameById.get(p.athlete_id)} /></div>
              ))}
            </HorizontalSection>
          )}

          <Shelf title="Quarterbacks" items={group((a) => a.position === "QB")} />
          <Shelf title="Receivers & Tight Ends" items={group((a) => a.position === "WR" || a.position === "TE")} />
          <Shelf title="Running Backs" items={group((a) => a.position === "RB")} />
          <Shelf title="Defense" items={group((a) => !!a.position && DEFENSE.has(a.position))} />

          <HorizontalSection title="Upcoming Camps" action={{ label: "See all", to: "/feed/camps" }}>
            {camps.map((c) => <CampCard key={c.id} camp={c} athleteName={nameById.get(c.athleteId)} />)}
          </HorizontalSection>

          <Shelf title="College" items={group((a) => a.league === "NCAA")} />
          <Shelf title="New to Goat Farm" items={list.slice(-12)} />
        </>
      )}
    </div>
  );
}

function Shelf({ title, items }: { title: string; items: PublicAthlete[] }) {
  if (items.length === 0) return null;
  return (
    <HorizontalSection title={title}>
      {items.slice(0, 16).map((a) => <AthleteCardCompact key={a.id} athlete={a} />)}
    </HorizontalSection>
  );
}

// Full-width compact tile for the filtered grid (compact card is fixed-width).
function AthleteCardCompactFull({ athlete }: { athlete: PublicAthlete }) {
  return (
    <AthleteRow athlete={athlete}><FollowButton athleteId={athlete.id} /></AthleteRow>
  );
}
