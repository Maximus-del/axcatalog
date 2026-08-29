import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CheckCircle2, Clock3, FileImage, FolderOpen, ImagePlus, Layers3, Palette, Search, Shapes, Sparkles, Upload, WandSparkles } from "lucide-react";
import { useConcepts, useDesigns, useEntities } from "@/lib/v2/data";
import { cleanDesignTitle, stageOf, STAGE_LABELS, STAGE_TONES, type ConceptStage } from "@/lib/v2/concepts";
import { AssetImage, Card, Chip, EmptyState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";

const TABS = ["home", "concepts", "designs"] as const;
type Tab = (typeof TABS)[number];
const STAGES: ConceptStage[] = ["idea", "specified", "awaiting_approval", "approved", "changes_requested", "productized"];
type Concept = NonNullable<ReturnType<typeof useConcepts>["data"]>[number];
type Design = NonNullable<ReturnType<typeof useDesigns>["data"]>[number];

export default function V2Creative() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab") as Tab | null;
  const [tab, setTabState] = useState<Tab>(requested && TABS.includes(requested) ? requested : "home");
  const [query, setQuery] = useState("");
  const [artworkOnly, setArtworkOnly] = useState(false);
  const stageFilter = params.get("stage") ?? "all";
  const conceptsQ = useConcepts();
  const designsQ = useDesigns();
  const entitiesQ = useEntities();

  const entityName = useMemo(() => new Map((entitiesQ.data ?? []).map((e) => [e.id, e.name])), [entitiesQ.data]);
  const concepts = useMemo(() => (conceptsQ.data ?? []).filter((c) => {
    if (stageFilter !== "all" && stageOf(c) !== stageFilter) return false;
    const owner = c.entityId ? entityName.get(c.entityId) : "";
    return !query || `${c.title} ${owner}`.toLowerCase().includes(query.toLowerCase());
  }), [conceptsQ.data, entityName, query, stageFilter]);
  const designs = useMemo(() => (designsQ.data ?? []).filter((d) => {
    if (artworkOnly && !d.productionReady) return false;
    const owner = d.entityId ? entityName.get(d.entityId) : "";
    return !query || `${d.title} ${owner}`.toLowerCase().includes(query.toLowerCase());
  }), [artworkOnly, designsQ.data, entityName, query]);
  const totals = useMemo(() => {
    const cs = conceptsQ.data ?? [];
    const ds = designsQ.data ?? [];
    return {
      concepts: cs.length,
      designs: ds.length,
      production: ds.filter((d) => d.productionReady).length,
      approvals: cs.filter((c) => stageOf(c) === "awaiting_approval").length,
      changes: cs.filter((c) => stageOf(c) === "changes_requested").length,
      ideas: cs.filter((c) => stageOf(c) === "idea").length,
      represented: new Set([...cs.map((c) => c.entityId), ...ds.map((d) => d.entityId)].filter(Boolean)).size,
    };
  }, [conceptsQ.data, designsQ.data]);

  const setTab = (nextTab: Tab) => {
    setTabState(nextTab);
    const next = new URLSearchParams(params);
    nextTab === "home" ? next.delete("tab") : next.set("tab", nextTab);
    if (nextTab !== "concepts") next.delete("stage");
    setParams(next, { replace: true });
  };
  const setStage = (stage: string) => {
    setTabState("concepts");
    const next = new URLSearchParams(params);
    next.set("tab", "concepts");
    stage === "all" ? next.delete("stage") : next.set("stage", stage);
    setParams(next, { replace: true });
  };

  return <>
    <PageHeader title="Creative" subtitle="The command center for artwork, mockups, product ideas, production files, and everything waiting on a decision." actions={<>
      <a href="/admin/designs/new" className="flex items-center gap-2 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[12px] font-semibold text-black"><ImagePlus className="h-3.5 w-3.5" /> Create design</a>
      <a href="/admin-v2/people" className="flex items-center gap-2 rounded-full border border-[hsl(var(--ax-border))] px-4 py-2 text-[12px] text-[hsl(var(--ax-secondary))]"><WandSparkles className="h-3.5 w-3.5" /> Create mockup</a>
      <a href="/admin/design-templates" className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[12px] text-[hsl(var(--ax-secondary))]">Templates <ArrowUpRight className="h-3.5 w-3.5" /></a>
    </>} />

    <div className="mb-6 flex border-b border-[hsl(var(--ax-line))]">
      {TABS.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={`relative px-4 pb-3 pt-1 text-[12px] font-semibold ${tab === item ? "text-[hsl(var(--ax-accent))]" : "text-[hsl(var(--ax-secondary))]"}`}>
        {item === "home" ? "Creative home" : item === "concepts" ? "Product concepts" : "Designs"}
        {tab === item && <span className="absolute inset-x-2 -bottom-px h-0.5 bg-[hsl(var(--ax-accent))]" />}
      </button>)}
    </div>

    {tab === "home" && <CreativeHome totals={totals} loading={conceptsQ.isLoading || designsQ.isLoading} concepts={conceptsQ.data ?? []} designs={designsQ.data ?? []} entityName={entityName} onNavigate={setTab} onStage={setStage} />}
    {tab === "concepts" && <><Toolbar query={query} onQuery={setQuery}>{<><Chip active={stageFilter === "all"} onClick={() => setStage("all")}>All stages</Chip>{STAGES.map((s) => <Chip key={s} active={stageFilter === s} onClick={() => setStage(s)}>{STAGE_LABELS[s]}</Chip>)}</>}</Toolbar>{conceptsQ.isLoading ? <GridSkeleton /> : concepts.length === 0 ? <EmptyState>No concepts match these filters. Open an entity in People to start one.</EmptyState> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{concepts.map((c) => <ConceptCard key={c.id} concept={c} owner={c.entityId ? entityName.get(c.entityId) : undefined} />)}</div>}</>}
    {tab === "designs" && <><Toolbar query={query} onQuery={setQuery}><Chip active={!artworkOnly} onClick={() => setArtworkOnly(false)}>Everything</Chip><Chip active={artworkOnly} onClick={() => setArtworkOnly(true)}>Production artwork only</Chip></Toolbar>{designsQ.isLoading ? <GridSkeleton /> : designs.length === 0 ? <EmptyState>No designs match these filters.</EmptyState> : <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">{designs.map((d) => <DesignCard key={d.id} design={d} owner={d.entityId ? entityName.get(d.entityId) : undefined} />)}</div>}</>}
  </>;
}

function CreativeHome({ totals, loading, concepts, designs, entityName, onNavigate, onStage }: { totals: { concepts: number; designs: number; production: number; approvals: number; changes: number; ideas: number; represented: number }; loading: boolean; concepts: Concept[]; designs: Design[]; entityName: Map<string, string>; onNavigate: (tab: Tab) => void; onStage: (stage: string) => void }) {
  const recentConcepts = [...concepts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const recentDesigns = [...designs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <div className="space-y-8">
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Metric label="Designs" value={totals.designs} loading={loading} icon={<Palette />} />
      <Metric label="Product concepts" value={totals.concepts} loading={loading} icon={<Layers3 />} />
      <Metric label="Production assets" value={totals.production} loading={loading} icon={<FileImage />} />
      <Metric label="Awaiting approval" value={totals.approvals} loading={loading} icon={<Clock3 />} />
      <Metric label="People represented" value={totals.represented} loading={loading} icon={<Shapes />} />
    </section>

    <section><Heading eyebrow="Today" title="Action required" detail="Creative work that cannot move forward without a decision." /><div className="grid gap-3 md:grid-cols-3">
      <Action count={totals.approvals} title="Awaiting approval" detail="Review concepts sent for a decision." onClick={() => onStage("awaiting_approval")} />
      <Action count={totals.changes} title="Changes requested" detail="Revise feedback and return concepts for approval." onClick={() => onStage("changes_requested")} />
      <Action count={totals.ideas} title="Ideas not specified" detail="Choose the blank, color, placement, and owner." onClick={() => onStage("idea")} />
    </div></section>

    <section><Heading eyebrow="Workspaces" title="What do you want to work on?" detail="Each creative object has one clear home and one next action." /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Workspace icon={<Palette />} title="Designs" count={totals.designs} description="Artwork, reference images, production PNGs, and design files." action="Open designs" onClick={() => onNavigate("designs")} />
      <Workspace icon={<WandSparkles />} title="Mockups" description="Artwork placed on blanks, organized inside each person’s workspace." action="Choose a person" href="/admin-v2/people" />
      <Workspace icon={<Layers3 />} title="Product concepts" count={totals.concepts} description="Ideas that can be approved, configured, and turned into products." action="Open concepts" onClick={() => onNavigate("concepts")} />
      <Workspace icon={<Sparkles />} title="Design templates" description="Reusable creative directions, master prompts, and reference sets." action="Open templates" href="/admin/design-templates" />
      <Workspace icon={<FolderOpen />} title="Brand assets" description="Logos, marks, fonts, colors, photography, and client-safe files." action="Open assets" href="/admin/brand-assets" />
      <Workspace icon={<Upload />} title="PNG creation" description="Extract, generate, review, and save production artwork." action="Choose a design" onClick={() => onNavigate("designs")} />
    </div></section>

    <section><div className="mb-3 flex items-end justify-between"><Heading eyebrow="Across AX" title="Recent creative work" detail="The newest work across every athlete, client, and organization." /><button onClick={() => onNavigate("concepts")} className="text-[11px] font-semibold text-[hsl(var(--ax-accent))]">View all <ArrowRight className="inline h-3 w-3" /></button></div>
      {loading ? <GridSkeleton /> : recentConcepts.length + recentDesigns.length === 0 ? <EmptyState>No creative work yet.</EmptyState> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{recentConcepts.map((c) => <ConceptCard key={c.id} concept={c} owner={c.entityId ? entityName.get(c.entityId) : undefined} />)}{recentDesigns.slice(0, 5 - recentConcepts.length).map((d) => <DesignCard key={d.id} design={d} owner={d.entityId ? entityName.get(d.entityId) : undefined} />)}</div>}
    </section>

    <section><Heading eyebrow="System" title="Creative lifecycle" detail="Every object keeps its identity as it moves toward sale." /><div className="ax-card grid overflow-hidden sm:grid-cols-3 lg:grid-cols-6">{["Idea", "Design", "Mockup", "Approval", "Production asset", "Product"].map((step, index) => <div key={step} className="relative border-b border-r border-[hsl(var(--ax-line))] p-4"><div className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--ax-accent)/0.14)] text-[10px] font-bold text-[hsl(var(--ax-accent))]">{index + 1}</div><div className="text-[12px] font-semibold">{step}</div></div>)}</div></section>
  </div>;
}

function Metric({ label, value, loading, icon }: { label: string; value: number; loading: boolean; icon: ReactNode }) { return <div className="ax-card px-4 py-3.5"><div className="mb-3 flex items-center justify-between text-[hsl(var(--ax-secondary))]"><span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</span><span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span></div>{loading ? <Skeleton className="h-8 w-14" /> : <div className="text-[27px] font-semibold tabular-nums">{value}</div>}</div>; }
function Action({ count, title, detail, onClick }: { count: number; title: string; detail: string; onClick: () => void }) { return <Card onClick={onClick} className="p-4"><div className="flex items-start gap-3"><div className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white/[0.06] text-[14px] font-semibold">{count}</div><div className="min-w-0 flex-1"><div className="text-[12px] font-semibold">{title}</div><p className="mt-1 text-[11px] text-[hsl(var(--ax-faint))]">{count ? detail : "Nothing waiting here."}</p></div>{count ? <ArrowRight className="h-4 w-4 text-[hsl(var(--ax-faint))]" /> : <CheckCircle2 className="h-4 w-4 text-[hsl(var(--ax-accent))]" />}</div></Card>; }
function Workspace({ icon, title, count, description, action, onClick, href }: { icon: ReactNode; title: string; count?: number; description: string; action: string; onClick?: () => void; href?: string }) { const body = <><div className="mb-5 flex justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] [&>svg]:h-5 [&>svg]:w-5">{icon}</span>{count != null && <span className="text-[22px] font-semibold">{count}</span>}</div><div className="text-[14px] font-semibold">{title}</div><p className="mt-1.5 min-h-10 text-[11px] text-[hsl(var(--ax-faint))]">{description}</p><div className="mt-4 text-[11px] font-semibold text-[hsl(var(--ax-accent))]">{action} <ArrowRight className="inline h-3 w-3" /></div></>; return href ? <a href={href} className="ax-card ax-card-hover block p-4">{body}</a> : <Card onClick={onClick} className="p-4">{body}</Card>; }
function Heading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail: string }) { return <div className="mb-3"><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[hsl(var(--ax-accent))]">{eyebrow}</div><h2 className="mt-1 text-[17px] font-semibold">{title}</h2><p className="text-[11px] text-[hsl(var(--ax-faint))]">{detail}</p></div>; }
function Toolbar({ query, onQuery, children }: { query: string; onQuery: (value: string) => void; children: ReactNode }) { return <div className="mb-5 flex flex-wrap items-center gap-2"><label className="relative mr-auto min-w-[220px] max-w-sm flex-1"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--ax-faint))]" /><input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search creative work…" className="w-full rounded-full border border-[hsl(var(--ax-border))] bg-white/[0.03] py-2 pl-9 pr-3 text-[12px] outline-none" /></label>{children}</div>; }
function ConceptCard({ concept, owner }: { concept: Concept; owner?: string }) { const stage = stageOf(concept); return <Card className="group p-0"><AssetImage url={concept.imageUrl} bucket={concept.imageBucket} path={concept.imagePath} alt={concept.title} className="aspect-square w-full bg-white/[0.03]" fit="contain" /><div className="p-2.5"><div className="truncate text-[12px] font-medium">{concept.title}</div><div className="mt-0.5 truncate text-[10px] text-[hsl(var(--ax-faint))]">{owner ?? "No owner"}</div><div className="mt-2"><Chip tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Chip></div></div></Card>; }
function DesignCard({ design, owner }: { design: Design; owner?: string }) { return <a href={`/admin/designs/${design.id}`} className="ax-card ax-card-hover overflow-hidden"><AssetImage bucket={design.fileBucket} path={design.filePath} alt={design.title} className="aspect-square w-full bg-black/30" fit="contain" /><div className="p-2"><div className="truncate text-[11px] text-[hsl(var(--ax-secondary))]">{cleanDesignTitle(design.title) ?? "Untitled"}</div><div className="truncate text-[9px] text-[hsl(var(--ax-faint))]">{owner ?? "No owner"}</div><div className="mt-1 text-[9px]" style={{ color: design.productionReady ? "hsl(var(--ax-accent))" : "hsl(var(--ax-amber))" }}>{design.productionReady ? "Production asset" : "Concept art"}</div></div></a>; }
function GridSkeleton() { return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}</div>; }
