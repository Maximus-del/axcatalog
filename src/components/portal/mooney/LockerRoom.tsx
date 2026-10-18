import { useEffect, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, CalendarDays, ChartNoAxesCombined, Copy, ImageOff, Package, Pencil, RefreshCw, ShoppingCart, ShoppingBag, Ticket, Wallet, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { usePortalData } from "../PortalDataContext";
import { usePortalCatalog, usePortalDestinations, usePortalDrops, usePortalProfile, usePortalProjects, usePortalScope, usePortalSummary } from "@/hooks/usePortalApi";
import { entityVoice } from "@/lib/portal/entity-voice";
import { formatMoney } from "@/lib/portal/api/money";
import type { Destination, Project } from "@/lib/portal/api/contract";
import { portalLink } from "./navigation";

export function RetryState({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="mw-state" role="alert"><p>{error instanceof Error ? error.message : "Unable to load this section."}</p><Button variant="ghost" onClick={retry} className="min-h-11"><RefreshCw />Try again</Button></div>;
}

function DestinationDisplay({ destination, onOpen, priority }: { destination: Destination; onOpen: () => void; priority: boolean }) {
  const [failed, setFailed] = useState(false);
  const [wide, setWide] = useState(false);
  useEffect(() => { setFailed(false); setWide(false); }, [destination.image]);
  return <article className="mw-destination" style={{ "--mw-destination-accent": destination.accent } as CSSProperties}>
    <Button variant="ghost" className="mw-figure-stage" data-wide={wide} onClick={onOpen} aria-label={`Open ${destination.label} collection`}>
      {destination.image && !failed ? <img className="mw-figure" src={destination.image} alt={`${destination.label} collectible`} loading={priority ? "eager" : "lazy"} onError={() => setFailed(true)} onLoad={(event) => { const image = event.currentTarget; setWide(image.naturalWidth > image.naturalHeight); }} /> : <div className="mw-figure-placeholder"><ImageOff className="h-8 w-8" /><span className="text-xs">Artwork unavailable</span></div>}
    </Button>
    <div className="mw-destination-caption">
    <h2>{destination.label}</h2>
    <p className="mw-destination-meta">{destination.jerseyNumber !== null ? `#${destination.jerseyNumber}` : ""}</p>
    <Button variant="outline" className="mw-collection-link" onClick={onOpen} aria-label={`Open ${destination.label} collection`}>Open collection<ArrowRight /></Button>
    </div>
  </article>;
}

function CollectionContents({ destination }: { destination: Destination }) {
  const catalog = usePortalCatalog({ collection: destination.id });
  const location = useLocation();
  return <div className="overflow-y-auto py-4">
    {catalog.loading ? <Skeleton className="h-32" /> : catalog.items.length === 0 ? <p className="text-sm text-muted-foreground py-6">No products available in this collection.</p> : <div className="grid grid-cols-2 gap-3">{catalog.items.map((product) => <Link key={product.id} to={portalLink(`/portal/products/${encodeURIComponent(product.id)}`, location.search)} className="border border-border rounded-md p-2 hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"><div className="aspect-square bg-card flex items-center justify-center mb-2">{product.frontImage ? <img src={product.frontImage} alt={product.title} className="h-full w-full object-contain p-2" loading="lazy" /> : <ImageOff className="h-7 w-7 text-muted-foreground" />}</div><strong className="text-xs block break-words">{product.title}</strong><span className="mt-2 flex items-center gap-2 text-xs text-accent">View product<ArrowRight className="h-3 w-3" /></span></Link>)}</div>}
  </div>;
}

function ProjectPreview({ project, href }: { project: Project; href: string }) {
  const image = project.concepts.find((concept) => concept.imageUrl)?.imageUrl;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return <article className="mw-next-card"><div className="mw-next-body">{image && !failed ? <img className="mw-next-image" src={image} alt="" onError={() => setFailed(true)} /> : <Pencil className="h-7 w-7 shrink-0 text-accent" />}<div><strong>{project.title}</strong><small>{project.status === "feedback" ? "Design feedback" : project.status.replace(/_/g, " ")}</small></div></div><Button variant="outline" asChild className="mw-pill"><Link to={href}>Go to Studio<ArrowRight /></Link></Button></article>;
}

export function LockerRoom() {
  const { athlete, openOrderSheet } = usePortalData();
  const voice = entityVoice(athlete);
  const { viewingAs } = usePortalScope();
  const destinations = usePortalDestinations();
  const summary = usePortalSummary();
  const projects = usePortalProjects();
  const drops = usePortalDrops();
  const profile = usePortalProfile();
  const location = useLocation();
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [collection, setCollection] = useState<Destination | null>(null);
  const activeProjects = projects.data?.items.filter((project) => project.status !== "archived" && project.status !== "approved").slice(0, 2) ?? [];
  const nextDrops = drops.data?.items.filter((drop) => drop.status !== "live").slice(0, 2) ?? [];
  const link = (href: string) => portalLink(href, location.search);

  useEffect(() => {
    const refresh = () => { void summary.refetch(); void destinations.refetch(); void projects.refetch(); void drops.refetch(); };
    window.addEventListener("portal:refresh", refresh);
    const timer = window.setInterval(() => void projects.refetch(), 4 * 60_000);
    return () => { window.removeEventListener("portal:refresh", refresh); window.clearInterval(timer); };
  }, [summary.refetch, destinations.refetch, projects.refetch, drops.refetch]);

  const statistics = [
    { label: "AX Credit", value: formatMoney(summary.data?.creditBalance ?? null, { cents: true }), icon: Wallet },
    { label: "Lifetime gross revenue", value: formatMoney(summary.data?.lifetimeRevenue ?? null), icon: ChartNoAxesCombined },
    { label: "Orders", value: summary.data?.ordersCount?.toLocaleString() ?? "—", icon: ShoppingBag },
    { label: "Live products", value: summary.data?.liveProductsCount?.toLocaleString() ?? "—", icon: Package },
  ];
  const plays = [
    { title: "Order gear", icon: ShoppingCart, onClick: openOrderSheet },
    { title: "Start a design", icon: Pencil, href: "/portal/studio" },
    { title: "Get my code", icon: Ticket, onClick: () => setShowCode((value) => !value) },
    { title: "Download content", icon: Download, href: "/portal/content" },
  ];

  return <main>
    <section className="mw-hero" data-wall={destinations.data?.length === 4} aria-labelledby="locker-room-heading">
      <div className="mw-locker-scene">
      <div className="mw-scene-layer">
      <div className="mw-scene-heading">
      <h1 id="locker-room-heading" className="mw-heading">Welcome to your Locker Room, {voice.name}.</h1>
      <p className="mw-tagline">Same game. Bigger moves.</p>
      </div>
      {destinations.isLoading && <div className="mw-lockers" role="status" aria-label="Loading collections">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[360px] rounded-md" />)}</div>}
      {destinations.isError && <RetryState error={destinations.error} retry={() => void destinations.refetch()} />}
      {destinations.isSuccess && destinations.data.length === 0 && <div className="mw-state"><Package className="mx-auto h-8 w-8 mb-3" /><p>No collections available yet.</p></div>}
      {destinations.data && destinations.data.length > 0 && <div className="mw-lockers" aria-label="Your collections">{destinations.data.map((destination, index) => <DestinationDisplay key={destination.id} destination={destination} priority={index < 2} onOpen={() => setCollection(destination)} />)}</div>}
      </div>
      </div>
    </section>
    <div className="mw-content">
      {summary.isError ? <RetryState error={summary.error} retry={() => void summary.refetch()} /> : <section className="mw-kpis" aria-label="Your summary">{statistics.map((stat, index) => <article key={stat.label} className="mw-stat"><span className="mw-stat-icon"><stat.icon className="h-5 w-5" /></span><div className="mw-stat-copy"><span className="mw-stat-label">{stat.label}</span>{summary.isLoading ? <Skeleton className="h-7 w-20 mt-1" /> : <strong className="mw-stat-value">{stat.value}</strong>}</div>{index === 0 && <Button variant="outline" className="mw-pill" onClick={openOrderSheet} disabled={viewingAs}>Use credit<ArrowRight /></Button>}</article>)}</section>}
      {viewingAs && <p className="mw-viewing mt-3">View-as is read-only. Orders, messages and uploads are disabled.</p>}
      <div className="mw-lower">
        <section className="mw-section" aria-labelledby="quick-plays"><h2 id="quick-plays" className="mw-section-title">Quick Plays</h2><div className="mw-plays">{plays.map((play) => play.href ? <Button key={play.title} variant="ghost" className="mw-play" asChild><Link to={link(play.href)}><play.icon /><span className="mw-play-label">{play.title}<ArrowRight /></span></Link></Button> : <Button key={play.title} variant="ghost" className="mw-play" onClick={play.onClick} disabled={play.title === "Order gear" && viewingAs} aria-expanded={play.title === "Get my code" ? showCode : undefined}><play.icon /><span className="mw-play-label">{play.title}<ArrowRight /></span></Button>)}</div>
          {showCode && <div className="mw-code">{profile.isLoading ? <Skeleton className="h-8 w-24" /> : profile.isError ? <RetryState error={profile.error} retry={() => void profile.refetch()} /> : profile.data?.referral ? <><code>{profile.data.referral.code}</code><Button variant="ghost" className="min-h-11" onClick={async () => { const code = profile.data?.referral?.code; if (!code) return; try { await navigator.clipboard.writeText(code); setCopied(true); setCopyError(""); } catch { setCopyError("Unable to copy. Please select the code above."); } }}><Copy />{copied ? "Copied" : "Copy code"}</Button>{copyError && <p className="text-xs text-destructive" role="alert">{copyError}</p>}</> : <p className="text-sm text-muted-foreground">No approved referral code available.</p>}</div>}
        </section>
        <section className="mw-section" aria-labelledby="next-move"><h2 id="next-move" className="mw-section-title">Your Next Move</h2><div className="mw-next">
          <div className="space-y-3">{projects.isLoading ? <Skeleton className="h-36" /> : projects.isError ? <RetryState error={projects.error} retry={() => void projects.refetch()} /> : activeProjects.length > 0 ? activeProjects.map((project) => <ProjectPreview key={project.id} project={project} href={link("/portal/studio")} />) : <article className="mw-next-card"><div className="mw-next-body"><Pencil className="text-accent h-7 w-7 shrink-0" /><div><strong>No active projects</strong></div></div><Button className="mw-pill" variant="outline" asChild><Link to={link("/portal/studio")}>Start a design<ArrowRight /></Link></Button></article>}</div>
          <div className="space-y-3">{drops.isLoading ? <Skeleton className="h-36" /> : drops.isError ? <RetryState error={drops.error} retry={() => void drops.refetch()} /> : nextDrops.length > 0 ? nextDrops.map((drop) => <article className="mw-next-card" key={drop.id}><div className="mw-next-body"><CalendarDays className="h-7 w-7 shrink-0 text-accent" /><div><strong>{drop.title}</strong><small>{drop.status}</small><small>{drop.scheduledAt ? new Date(drop.scheduledAt).toLocaleString(undefined, { timeZone: drop.timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Unscheduled"}</small></div></div><Button variant="outline" className="mw-pill" asChild><Link to={link("/portal/content?panel=drops")}>View drops<ArrowRight /></Link></Button></article>) : <article className="mw-next-card"><div className="mw-next-body"><CalendarDays className="text-muted-foreground h-7 w-7 shrink-0" /><div><strong>No drops scheduled</strong></div></div><Button variant="outline" className="mw-pill" asChild><Link to={link("/portal/content?panel=drops")}>View drops<ArrowRight /></Link></Button></article>}</div>
        </div></section>
      </div>
      <footer className="mw-footer"><div className="mw-context-links"><Link to={link("/portal/products")}>All gear</Link><Link to={link("/portal/content?panel=drops")}>Drops</Link><Link to={link("/portal/profile")}>Profile</Link></div><span>AthleteXclusive · {voice.name}</span></footer>
    </div>
    <Sheet open={collection !== null} onOpenChange={(open) => { if (!open) setCollection(null); }}><SheetContent className="mw-drawer sm:max-w-[440px]"><SheetHeader className="text-left"><SheetTitle>{collection?.label ?? "Collection"}</SheetTitle><SheetDescription>Collection products</SheetDescription></SheetHeader>{collection && <CollectionContents destination={collection} />}</SheetContent></Sheet>
  </main>;
}