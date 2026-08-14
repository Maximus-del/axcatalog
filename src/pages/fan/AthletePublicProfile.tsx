// Public, shareable athlete profile at /a/:slug — hero + tabbed experience
// (Home / Access / Shop / Camps / About). Feed is enriched through the feed
// engine so content links to merch ("Shop the Look").
import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Star, Instagram, Twitter, Globe, MapPin, Calendar, ExternalLink } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { useAthletePublic, useAthleteProducts } from "@/hooks/useDiscoverAthletes";
import { useAthleteContent, useAthleteEvents } from "@/hooks/useContent";
import { useAthleteAccess } from "@/hooks/useFan";
import { athleteName, type PublicAthlete, type PublicAthleteProduct } from "@/lib/ecosystem/types";
import { demoCampForAthlete } from "@/lib/ecosystem/demo-content";
import { buildFeed, type EnrichedFeedItem } from "@/lib/ecosystem/feed-engine";
import { ACCESS_TYPES } from "@/lib/ecosystem/content-types";
import { earlyAccess } from "@/lib/ecosystem/access";
import type { PublicEvent } from "@/lib/ecosystem/content";
import { AthleteHero, AthleteStatBar } from "@/components/fan/ui/AthleteHero";
import { FollowButton } from "@/components/fan/FollowButton";
import { AccessButton } from "@/components/fan/ui/AccessButton";
import { FeedCard } from "@/components/fan/ui/FeedCard";
import { CampCard } from "@/components/fan/ui/CampCard";
import { ContentCard } from "@/components/fan/ui/ContentCard";
import { AccessPlans } from "@/components/fan/ui/AccessPlans";
import { ProductCard } from "@/components/fan/ProductCard";
import { HorizontalSection } from "@/components/fan/ui/HorizontalSection";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TABS = ["home", "access", "shop", "camps", "about"] as const;
type Tab = (typeof TABS)[number];

function mockFollowers(slug: string): string {
  let h = 0;
  for (const c of slug) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${(h % 380) + 20}K`;
}

export default function AthletePublicProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { session, hasFanProfile } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "home") as Tab;
  const { data: athlete, isLoading } = useAthletePublic(slug);
  const { data: products = [], isLoading: productsLoading } = useAthleteProducts(athlete?.id);
  const { data: realContent = [] } = useAthleteContent(athlete?.id);
  const { data: realEvents = [] } = useAthleteEvents(athlete?.id);
  const access = useAthleteAccess(athlete?.id);

  const canFollow = !!session && hasFanProfile;
  const feed = useMemo<EnrichedFeedItem[]>(
    () => (athlete ? buildFeed([athlete], new Map([[athlete.id, products as PublicAthleteProduct[]]])) : []),
    [athlete, products],
  );
  const accessContent = feed.filter((f) => ACCESS_TYPES.has(f.type));
  const accessRealContent = realContent.filter((c) => c.visibility === "access" || c.visibility === "vip");
  const camp = athlete ? demoCampForAthlete({ id: athlete.id, slug: athlete.slug, first: athlete.first_name }) : null;

  function setTab(t: Tab) {
    params.set("tab", t);
    setParams(params, { replace: true });
  }

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

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-5">
        {isLoading ? (
          <Skeleton className="h-64 rounded-3xl" />
        ) : !athlete ? (
          <div className="py-20 text-center text-muted-foreground">
            <p>This athlete isn’t available.</p>
            <Link to="/join" className="text-accent font-semibold mt-3 inline-block">Explore Goat Farm Access</Link>
          </div>
        ) : (
          <>
            <AthleteHero athlete={athlete} />

            <div className="flex gap-2 mt-3">
              {canFollow ? (
                <>
                  <FollowButton athleteId={athlete.id} className="flex-1" />
                  <AccessButton athleteId={athlete.id} className="flex-1" />
                </>
              ) : (
                <Link to="/join" className="flex-1 h-9 rounded-full bg-accent text-accent-foreground font-bold text-[13px] inline-flex items-center justify-center gap-1.5">
                  <Star className="h-4 w-4" /> Join to follow
                </Link>
              )}
            </div>

            <AthleteStatBar followers={mockFollowers(athlete.slug)} drops={products.length} posts={accessContent.length} />

            <div className="flex gap-1 mt-5 border-b border-border overflow-x-auto scroll-touch">
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cn("shrink-0 h-10 px-3.5 text-sm font-bold capitalize border-b-2 -mb-px transition-colors", tab === t ? "border-accent text-accent" : "border-transparent text-muted-foreground")}>
                  {t}
                </button>
              ))}
            </div>

            <div className="mt-5">
              {tab === "home" && (
                <div className="space-y-6">
                  {products.length > 0 && (
                    <HorizontalSection title="Latest Merch" action={{ label: "Shop", to: `/a/${athlete.slug}?tab=shop` }}>
                      {products.slice(0, 8).map((p) => (
                        <div key={p.id} className="w-[160px] shrink-0 snap-start"><ProductCard product={p} /></div>
                      ))}
                    </HorizontalSection>
                  )}
                  {realContent.length > 0 && (
                    <section>
                      <h2 className="ax-section-header mb-3">Latest</h2>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {realContent.slice(0, 6).map((c) => <ContentCard key={c.id} content={c} access={access} />)}
                      </div>
                    </section>
                  )}
                  <ProfileFeed athlete={athlete} items={feed} />
                </div>
              )}
              {tab === "access" && (
                <div className="space-y-6">
                  <AccessPlans athleteId={athlete.id} canFollow={canFollow} />
                  {accessRealContent.length > 0 && (
                    <section>
                      <h2 className="ax-section-header mb-3">Access Content</h2>
                      <div className="grid sm:grid-cols-2 gap-3">
                        {accessRealContent.map((c) => <ContentCard key={c.id} content={c} access={access} />)}
                      </div>
                    </section>
                  )}
                  {accessContent.length > 0 && accessRealContent.length === 0 && (
                    <div className="space-y-4 max-w-xl">
                      {accessContent.map((item) => <FeedCard key={item.id} item={item} athlete={athlete} />)}
                    </div>
                  )}
                </div>
              )}
              {tab === "shop" && <ProfileShop products={products} loading={productsLoading} />}
              {tab === "camps" && (
                <div className="space-y-3 max-w-lg">
                  {realEvents.map((e) => <EventRow key={e.id} event={e} isMember={access.isMember} />)}
                  {camp && realEvents.length === 0 && <CampCard camp={camp} block />}
                </div>
              )}
              {tab === "about" && <ProfileAbout athlete={athlete} />}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ProfileFeed({ athlete, items }: { athlete: PublicAthlete; items: EnrichedFeedItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">No updates yet.</p>;
  return (
    <div className="space-y-4 max-w-xl">
      {items.map((item) => <FeedCard key={item.id} item={item} athlete={athlete} />)}
    </div>
  );
}

function EventRow({ event, isMember }: { event: PublicEvent; isMember: boolean }) {
  const early = earlyAccess(event.access_date, event.public_date, isMember);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-wider text-accent">{event.type.replace("_", " ")}</span>
        <span className="text-[11px] text-muted-foreground capitalize">{event.status.replace("_", " ")}</span>
      </div>
      <div className="font-bold mt-1">{event.name}</div>
      <div className="mt-1.5 space-y-0.5 text-[12px] text-muted-foreground">
        {event.city && <div className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> {event.city}</div>}
        {event.event_date && <div className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {new Date(event.event_date).toLocaleDateString()}</div>}
      </div>
      {early.label && <div className="mt-2 text-[12px] font-bold text-accent">{early.label}</div>}
      {event.registration_url && (
        <a href={event.registration_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-accent text-accent-foreground font-bold text-[13px]">
          Register <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

function ProfileShop({ products, loading }: { products: PublicAthleteProduct[]; loading: boolean }) {
  if (loading) {
    return <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}</div>;
  }
  if (products.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">No merch published yet.</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {products.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}

function ProfileAbout({ athlete }: { athlete: PublicAthlete }) {
  const meta = [
    ["Position", athlete.position],
    ["Team", athlete.team_name],
    ["League", athlete.league],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-5 max-w-lg">
      <p className="text-sm text-muted-foreground">{athleteName(athlete)} on Goat Farm Access — merch, exclusive content, camps, and events in one place.</p>
      <div className="rounded-2xl border border-border bg-card divide-y divide-border">
        {meta.map(([k, v]) => (
          <div key={k as string} className="flex items-center justify-between px-4 h-12">
            <span className="text-[13px] text-muted-foreground">{k}</span>
            <span className="text-sm font-semibold">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {[Instagram, Twitter, Globe].map((Icon, i) => (
          <span key={i} className="h-10 w-10 rounded-xl border border-border flex items-center justify-center text-muted-foreground"><Icon className="h-4 w-4" /></span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Bio &amp; social links are placeholder content for this demo athlete.</p>
    </div>
  );
}
