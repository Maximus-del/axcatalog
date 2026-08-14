// Public, shareable athlete profile at /a/:slug. Works signed-out (with a
// prompt to join) or signed-in (with follow + access). Reads public views only.
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useAthletePublic, useAthleteProducts } from "@/hooks/useDiscoverAthletes";
import { athleteName } from "@/lib/ecosystem/types";
import { AthleteAvatar } from "@/components/fan/AthleteAvatar";
import { FollowButton } from "@/components/fan/FollowButton";
import { ProductCard } from "@/components/fan/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";

export default function AthletePublicProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { session, hasFanProfile } = useAuth();
  const { data: athlete, isLoading } = useAthletePublic(slug);
  const { data: products = [], isLoading: productsLoading } = useAthleteProducts(athlete?.id);

  const canFollow = !!session && hasFanProfile;

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      <header className="sticky top-0 z-40 bg-[hsl(var(--dark))]/95 backdrop-blur-md border-b border-border">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link to={canFollow ? "/feed/discover" : "/join"} className="h-9 w-9 -ml-2 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="font-black tracking-tight text-[15px]">GOAT FARM <span className="text-accent">ACCESS</span></span>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6">
        {isLoading ? (
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ) : !athlete ? (
          <div className="py-20 text-center text-muted-foreground">
            <p>This athlete isn’t available.</p>
            <Link to="/join" className="text-accent font-semibold mt-3 inline-block">Explore Goat Farm Access</Link>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <AthleteAvatar athlete={athlete} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-black tracking-tight truncate">{athleteName(athlete)}</h1>
                <p className="text-sm text-muted-foreground truncate">
                  {[athlete.position, athlete.team_name, athlete.league].filter(Boolean).join(" · ") || "Athlete"}
                </p>
              </div>
              {canFollow ? (
                <FollowButton athleteId={athlete.id} />
              ) : (
                <Link to="/join" className="h-9 px-4 rounded-full bg-accent text-accent-foreground font-bold text-[13px] inline-flex items-center gap-1.5">
                  <Star className="h-4 w-4" /> Follow
                </Link>
              )}
            </div>

            {/* Access teaser */}
            <div className="mt-6 rounded-2xl border border-accent/30 bg-accent/[0.06] p-4 flex items-start gap-3">
              <span className="h-9 w-9 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
                <Star className="h-4 w-4 text-accent" />
              </span>
              <div>
                <div className="font-bold text-sm">{athleteName(athlete).split(" ")[0]} Access</div>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  Follow for free drops &amp; updates. Exclusive Access &amp; VIP tiers are coming soon.
                </p>
              </div>
            </div>

            {/* Merch */}
            <section className="mt-7">
              <h2 className="ax-section-header mb-3">Merch</h2>
              {productsLoading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-2xl" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No merch published yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
