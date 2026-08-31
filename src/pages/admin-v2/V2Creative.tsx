import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Clock3,
  FileImage,
  FolderOpen,
  ImagePlus,
  Layers3,
  Palette,
  Shapes,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useConcepts, useDesignTemplates, useDesigns, useEntities } from "@/lib/v2/data";
import { cleanDesignTitle, stageOf, STAGE_LABELS, STAGE_TONES, type ConceptStage } from "@/lib/v2/concepts";
import type { Design, ProductConcept } from "@/lib/v2/types";
import AssetsDrawer, { type AssetSource } from "@/components/admin-v2/AssetsDrawer";
import {
  ActionCard,
  AssetImage,
  Chip,
  EmptyState,
  ErrorState,
  Heading,
  Metric,
  PageHeader,
  Skeleton,
  TabBar,
  Toolbar,
  WorkspaceCard,
} from "@/components/admin-v2/primitives";

// CREATIVE — the workspace for everything before a product exists.
//
// Five surfaces, in the order the work happens: what needs you (Overview),
// the artwork (Designs), the artwork on garments (Mockups), what gets made
// FROM those (Assets), and the reusable directions behind all of it
// (Templates).
//
// NAMING. What the database calls a Product Concept is called a MOCKUP
// everywhere a person can read it — see AX_V2_NAMING.md. This page used to say
// "Product concepts" in its own tab bar while the entity workspace said
// "Mockups" for the same rows.
//
// Every filter is in the URL, so a shelf can be sent to someone and Back
// returns to it.

const TABS = ["overview", "designs", "mockups", "assets", "templates"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  designs: "Designs",
  mockups: "Mockups",
  assets: "Assets",
  templates: "Design templates",
};

const STAGES: ConceptStage[] = [
  "idea",
  "specified",
  "awaiting_approval",
  "approved",
  "changes_requested",
  "productized",
];

export default function V2Creative() {
  const [params, setParams] = useSearchParams();
  const conceptsQ = useConcepts();
  const designsQ = useDesigns();
  const entitiesQ = useEntities();

  const requested = params.get("tab");
  // A stage filter arriving on its own — from Overview's Action Required — is a
  // request for the mockups shelf, whatever the tab parameter says.
  const tab: Tab = TABS.includes(requested as Tab)
    ? (requested as Tab)
    : params.get("stage")
      ? "mockups"
      : "overview";

  const query = params.get("q") ?? "";
  const stage = params.get("stage") ?? "all";
  const entityId = params.get("entity") ?? "all";
  const artworkOnly = params.get("artwork") === "1";

  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === "" || value === "all") next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const goTab = (next: Tab) => patch({ tab: next === "overview" ? null : next, stage: null });

  const entityName = useMemo(
    () => new Map((entitiesQ.data ?? []).map((e) => [e.id, e.name])),
    [entitiesQ.data],
  );

  /** People who actually have creative work, so the filter is never a list of empties. */
  const creativePeople = useMemo(() => {
    const ids = new Set<string>();
    for (const c of conceptsQ.data ?? []) if (c.entityId) ids.add(c.entityId);
    for (const d of designsQ.data ?? []) if (d.entityId) ids.add(d.entityId);
    return [...ids]
      .map((id) => ({ id, name: entityName.get(id) ?? "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [conceptsQ.data, designsQ.data, entityName]);

  const matchesEntity = (owner: string | null) => entityId === "all" || owner === entityId;
  const matchesQuery = (text: string, owner: string | null) => {
    if (!query.trim()) return true;
    const hay = `${text} ${owner ? (entityName.get(owner) ?? "") : ""}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  };

  const mockups = useMemo(
    () =>
      (conceptsQ.data ?? []).filter(
        (c) =>
          matchesEntity(c.entityId) &&
          (stage === "all" || stageOf(c) === stage) &&
          matchesQuery(c.title, c.entityId),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conceptsQ.data, entityId, stage, query, entityName],
  );

  const designs = useMemo(
    () =>
      (designsQ.data ?? []).filter(
        (d) =>
          matchesEntity(d.entityId) && (!artworkOnly || d.productionReady) && matchesQuery(d.title, d.entityId),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [designsQ.data, entityId, artworkOnly, query, entityName],
  );

  const totals = useMemo(() => {
    const cs = conceptsQ.data ?? [];
    const ds = designsQ.data ?? [];
    return {
      designs: ds.length,
      mockups: cs.length,
      production: ds.filter((d) => d.productionReady).length,
      approvals: cs.filter((c) => stageOf(c) === "awaiting_approval").length,
      changes: cs.filter((c) => stageOf(c) === "changes_requested").length,
      ideas: cs.filter((c) => stageOf(c) === "idea").length,
      noArtwork: ds.filter((d) => !d.productionReady).length,
      represented: new Set([...cs.map((c) => c.entityId), ...ds.map((d) => d.entityId)].filter(Boolean)).size,
    };
  }, [conceptsQ.data, designsQ.data]);

  const loading = conceptsQ.isLoading || designsQ.isLoading;
  const failed = conceptsQ.isError || designsQ.isError;
  const failure = conceptsQ.error ?? designsQ.error;
  const retry = () => {
    void conceptsQ.refetch();
    void designsQ.refetch();
  };

  /** The one filter row every shelf shares, so they cannot drift apart. */
  const personFilter = (
    <select
      value={entityId}
      onChange={(e) => patch({ entity: e.target.value })}
      className="rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-1.5 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
    >
      <option value="all">Everyone</option>
      {creativePeople.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <PageHeader
        title="Creative"
        subtitle="Artwork, mockups, the assets made from them, and everything waiting on a decision."
        actions={
          <>
            <Link
              to="/admin/designs/new"
              className="flex items-center gap-2 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))]"
            >
              <ImagePlus className="h-3.5 w-3.5" /> Create design
            </Link>
            <Link
              to="/admin-v2/people"
              title="A mockup belongs to someone — pick who it is for"
              className="flex items-center gap-2 rounded-full border border-[hsl(var(--ax-border))] px-4 py-2 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))]"
            >
              <WandSparkles className="h-3.5 w-3.5" /> Create mockup
            </Link>
          </>
        }
      />

      <TabBar tabs={TABS} active={tab} onSelect={goTab} label={(t) => TAB_LABEL[t]} />

      {failed && tab !== "templates" && (
        <div className="mb-5">
          <ErrorState error={failure} what="your creative work" onRetry={retry} />
        </div>
      )}

      {tab === "overview" && (
        <CreativeOverview
          totals={totals}
          loading={loading}
          concepts={conceptsQ.data ?? []}
          designs={designsQ.data ?? []}
          entityName={entityName}
          onTab={goTab}
          onStage={(s) => patch({ tab: "mockups", stage: s })}
          onArtworkGap={() => patch({ tab: "designs", artwork: null })}
        />
      )}

      {tab === "designs" && (
        <>
          <Toolbar query={query} onQuery={(v) => patch({ q: v })} placeholder="Search designs and owners…">
            {personFilter}
            <Chip active={!artworkOnly} onClick={() => patch({ artwork: null })}>
              Everything {totals.designs}
            </Chip>
            <Chip active={artworkOnly} onClick={() => patch({ artwork: "1" })}>
              Production artwork {totals.production}
            </Chip>
          </Toolbar>
          {loading ? (
            <GridSkeleton />
          ) : designs.length === 0 ? (
            <EmptyState>
              No designs match. A Design is the artwork itself — the file that gets printed, or the concept art it
              starts as.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
              {designs.map((d) => (
                <DesignCard key={d.id} design={d} owner={d.entityId ? entityName.get(d.entityId) : undefined} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "mockups" && (
        <>
          <Toolbar query={query} onQuery={(v) => patch({ q: v })} placeholder="Search mockups and owners…">
            {personFilter}
            <Chip active={stage === "all"} onClick={() => patch({ stage: null })}>
              All stages
            </Chip>
            {STAGES.map((s) => (
              <Chip key={s} active={stage === s} onClick={() => patch({ stage: s })}>
                {STAGE_LABELS[s]}
              </Chip>
            ))}
          </Toolbar>
          {loading ? (
            <GridSkeleton />
          ) : mockups.length === 0 ? (
            <EmptyState>
              No mockups match. A mockup is artwork placed on a blank — open someone in People to build one.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {mockups.map((c) => (
                <MockupCard key={c.id} concept={c} owner={c.entityId ? entityName.get(c.entityId) : undefined} />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "assets" && (
        <AssetStudio
          concepts={conceptsQ.data ?? []}
          entityName={entityName}
          loading={loading}
          query={query}
          onQuery={(v) => patch({ q: v })}
          personFilter={personFilter}
          filter={(c) => matchesEntity(c.entityId) && matchesQuery(c.title, c.entityId)}
        />
      )}

      {tab === "templates" && <TemplateIndex />}
    </>
  );
}

/* --------------------------------------------------------------- overview */

function CreativeOverview({
  totals,
  loading,
  concepts,
  designs,
  entityName,
  onTab,
  onStage,
  onArtworkGap,
}: {
  totals: {
    designs: number;
    mockups: number;
    production: number;
    approvals: number;
    changes: number;
    ideas: number;
    noArtwork: number;
    represented: number;
  };
  loading: boolean;
  concepts: ProductConcept[];
  designs: Design[];
  entityName: Map<string, string>;
  onTab: (tab: Tab) => void;
  onStage: (stage: string) => void;
  onArtworkGap: () => void;
}) {
  const recentMockups = [...concepts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const recentDesigns = [...designs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);

  return (
    <div className="space-y-8">
      {/*
        Five numbers, each one a door. A count you cannot open is a poster.
      */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Designs" value={totals.designs} loading={loading} icon={<Palette />} onClick={() => onTab("designs")} />
        <Metric label="Mockups" value={totals.mockups} loading={loading} icon={<Layers3 />} onClick={() => onTab("mockups")} />
        <Metric
          label="Production assets"
          value={totals.production}
          loading={loading}
          icon={<FileImage />}
          onClick={() => onTab("designs")}
        />
        <Metric
          label="Awaiting approval"
          value={totals.approvals}
          loading={loading}
          icon={<Clock3 />}
          onClick={() => onStage("awaiting_approval")}
        />
        <Metric label="People represented" value={totals.represented} loading={loading} icon={<Shapes />} />
      </section>

      <section>
        <Heading
          eyebrow="Today"
          title="Needs you"
          detail="Creative work that cannot move forward on its own."
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <ActionCard
            count={totals.approvals}
            title="Awaiting approval"
            detail="Sent for a decision, nothing back yet."
            onClick={() => onStage("awaiting_approval")}
          />
          <ActionCard
            count={totals.changes}
            title="Changes requested"
            detail="Feedback to work through, then send again."
            onClick={() => onStage("changes_requested")}
          />
          <ActionCard
            count={totals.ideas}
            title="Unfinished mockups"
            detail="Missing a design, blank, colour or placement."
            onClick={() => onStage("idea")}
          />
          <ActionCard
            count={totals.noArtwork}
            title="No production artwork"
            detail="Concept art only — nothing printable behind it."
            onClick={onArtworkGap}
          />
        </div>
      </section>

      <section>
        <Heading
          eyebrow="Across AX"
          title="Latest mockups"
          detail="The newest artwork-on-garment from everyone."
        />
        {loading ? (
          <GridSkeleton />
        ) : recentMockups.length === 0 ? (
          <EmptyState>No mockups yet.</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recentMockups.map((c) => (
              <MockupCard key={c.id} concept={c} owner={c.entityId ? entityName.get(c.entityId) : undefined} />
            ))}
          </div>
        )}
      </section>

      <section>
        <Heading eyebrow="Across AX" title="Latest designs" detail="Recently added artwork." />
        {loading ? (
          <GridSkeleton />
        ) : recentDesigns.length === 0 ? (
          <EmptyState>No designs yet.</EmptyState>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
            {recentDesigns.map((d) => (
              <DesignCard key={d.id} design={d} owner={d.entityId ? entityName.get(d.entityId) : undefined} />
            ))}
          </div>
        )}
      </section>

      <section>
        <Heading
          eyebrow="Elsewhere"
          title="Creative tools that live in V1"
          detail="Strong already, deliberately not rebuilt. V2 links out rather than forking them."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <WorkspaceCard
            icon={<Sparkles />}
            title="Design templates"
            description="Style DNA, master prompts, reference sets and athlete best-fit matching."
            action="Open the library"
            onClick={() => onTab("templates")}
          />
          <WorkspaceCard
            icon={<FolderOpen />}
            title="Brand assets"
            description="Logos, marks, fonts, colours, photography and client-safe files."
            action="Open assets"
            href="/admin/brand-assets"
          />
          <WorkspaceCard
            icon={<ImagePlus />}
            title="PNG creation"
            description="Extract, generate, review and save production artwork from a design."
            action="Choose a design"
            onClick={() => onTab("designs")}
          />
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------- asset studio */

/**
 * Where an asset starts.
 *
 * The asset flow existed only inside one entity's mockup menu, which meant
 * "make a launch graphic" began with remembering whose mockup it was. Assets
 * derive from mockups, so the entry point is the mockup shelf.
 *
 * Generation is still deliberately unbuilt — see AssetsDrawer for why.
 */
function AssetStudio({
  concepts,
  entityName,
  loading,
  query,
  onQuery,
  personFilter,
  filter,
}: {
  concepts: ProductConcept[];
  entityName: Map<string, string>;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  personFilter: React.ReactNode;
  filter: (concept: ProductConcept) => boolean;
}) {
  const [source, setSource] = useState<{ asset: AssetSource; owner: string } | null>(null);
  const rows = concepts.filter(filter);

  return (
    <>
      <Heading
        eyebrow="Assets"
        title="Make something from a mockup"
        detail="Posts, stories, launch graphics and lookbook images — each one traceable back to the mockup it came from."
      />

      <Toolbar query={query} onQuery={onQuery} placeholder="Search mockups to start from…">
        {personFilter}
      </Toolbar>

      {loading ? (
        <GridSkeleton />
      ) : rows.length === 0 ? (
        <EmptyState>
          No mockups to work from yet. An asset is made FROM a mockup, so a mockup comes first.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() =>
                setSource({
                  asset: {
                    id: c.id,
                    title: c.title,
                    imageUrl: c.imageUrl,
                    imageBucket: c.imageBucket,
                    imagePath: c.imagePath,
                    colorName: c.colorName,
                  },
                  owner: (c.entityId ? entityName.get(c.entityId) : null) ?? "AX",
                })
              }
              className="ax-card ax-card-hover overflow-hidden p-0 text-left transition-all"
            >
              <AssetImage
                url={c.imageUrl}
                bucket={c.imageBucket}
                path={c.imagePath}
                alt={c.title}
                className="aspect-square w-full bg-white/[0.03]"
                fit="contain"
                fallbackSeed={c.id}
              />
              <div className="p-2.5">
                <div className="truncate text-[12px] font-medium">{c.title}</div>
                <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
                  {(c.entityId ? entityName.get(c.entityId) : null) ?? "No owner"}
                </div>
                <div className="mt-1.5 text-[10px] font-semibold text-[hsl(var(--ax-accent))]">Make an asset →</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {source && (
        <AssetsDrawer mockup={source.asset} entityName={source.owner} onClose={() => setSource(null)} />
      )}
    </>
  );
}

/* -------------------------------------------------------- template index */

function TemplateIndex() {
  const { data, isLoading, isError, error, refetch } = useDesignTemplates();

  return (
    <>
      <Heading
        eyebrow="Style DNA"
        title="Design templates"
        detail="Reusable creative directions. Editing, master prompts and best-fit matching stay in V1 — this is the index."
      />

      {isError && <ErrorState error={error} what="the template library" onRetry={() => void refetch()} />}
      {isLoading && <GridSkeleton />}
      {!isLoading && !isError && (data ?? []).length === 0 && <EmptyState>No design templates yet.</EmptyState>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {(data ?? []).map((tpl) => (
          <Link
            key={tpl.id}
            to={`/admin/design-templates/${tpl.id}`}
            className={`ax-card ax-card-hover overflow-hidden transition-all ${tpl.isActive ? "" : "opacity-50"}`}
          >
            <AssetImage
              url={tpl.previewImage}
              alt={tpl.name}
              className="aspect-[4/3] w-full bg-white/[0.03]"
              fit="cover"
              fallbackSeed={tpl.id}
            />
            <div className="p-3">
              <div className="truncate text-[13px] font-medium">{tpl.name}</div>
              <div className="truncate text-[11px] capitalize text-[hsl(var(--ax-faint))]">
                {tpl.style ?? "no style recorded"}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <Chip tone={tpl.applications > 0 ? "var(--ax-accent)" : undefined}>
                  {tpl.applications > 0
                    ? `${tpl.applications} ${tpl.applications === 1 ? "athlete" : "athletes"}`
                    : "Not used yet"}
                </Chip>
                {!tpl.isActive && <Chip tone="var(--ax-faint)">Archived</Chip>}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p className="mt-4 text-[11px] text-[hsl(var(--ax-faint))]">
        <Link to="/admin/design-templates" className="text-[hsl(var(--ax-accent))]">
          Open the full template library in V1 <ArrowUpRight className="inline h-3 w-3" />
        </Link>{" "}
        to edit a direction, manage reference sets, or run best-fit matching against a person.
      </p>
    </>
  );
}

/* -------------------------------------------------------------- shared bits */

/**
 * A mockup card, which always goes somewhere.
 *
 * A mockup's home is its person's workspace, so the card routes there and asks
 * that page to open it — rather than duplicating the detail view here and
 * giving one object two places to live. An ownerless mockup still has a
 * destination: the directory, where it can be given one.
 */
function MockupCard({ concept, owner }: { concept: ProductConcept; owner?: string }) {
  const stage = stageOf(concept);
  return (
    <Link
      to={concept.entityId ? `/admin-v2/people/${concept.entityId}?mockup=${concept.id}` : "/admin-v2/people"}
      title={concept.entityId ? `Open ${concept.title}` : "This mockup has no owner — pick one"}
      className="ax-card ax-card-hover block overflow-hidden p-0 transition-all"
    >
      <AssetImage
        url={concept.imageUrl}
        bucket={concept.imageBucket}
        path={concept.imagePath}
        alt={concept.title}
        className="aspect-square w-full bg-white/[0.03]"
        fit="contain"
        fallbackSeed={concept.id}
      />
      <div className="p-2.5">
        <div className="truncate text-[12px] font-medium">{concept.title}</div>
        <div className="mt-0.5 truncate text-[10px] text-[hsl(var(--ax-faint))]">
          {owner ?? "No owner — click to assign"}
        </div>
        <div className="mt-2">
          <Chip tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Chip>
        </div>
      </div>
    </Link>
  );
}

function DesignCard({ design, owner }: { design: Design; owner?: string }) {
  return (
    <Link to={`/admin/designs/${design.id}`} className="ax-card ax-card-hover overflow-hidden transition-all">
      <AssetImage
        bucket={design.fileBucket}
        path={design.filePath}
        alt={design.title}
        className="aspect-square w-full bg-black/30"
        fit="contain"
      />
      <div className="p-2">
        <div className="truncate text-[11px] text-[hsl(var(--ax-secondary))]">
          {cleanDesignTitle(design.title) ?? "Untitled"}
        </div>
        <div className="truncate text-[9px] text-[hsl(var(--ax-faint))]">{owner ?? "No owner"}</div>
        <div
          className="mt-1 text-[9px]"
          style={{ color: design.productionReady ? "hsl(var(--ax-accent))" : "hsl(var(--ax-amber))" }}
        >
          {design.productionReady ? "Production asset" : "Concept art"}
        </div>
      </div>
    </Link>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square" />
      ))}
    </div>
  );
}
