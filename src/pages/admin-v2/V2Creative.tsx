import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useConcepts, useDesigns, useEntities } from "@/lib/v2/data";
import { cleanDesignTitle, stageOf, STAGE_LABELS, STAGE_TONES, type ConceptStage } from "@/lib/v2/concepts";
import { AssetImage, Card, Chip, EmptyState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";

// Creative is the production system: the artwork and the ideas made from it.
// Design Templates already exist and are strong — V2 links to that system
// rather than rebuilding it (§12).

const TABS = ["concepts", "designs"] as const;
type Tab = (typeof TABS)[number];

const STAGES: ConceptStage[] = ["idea", "specified", "awaiting_approval", "approved", "changes_requested", "productized"];

export default function V2Creative() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) ?? "concepts");
  const stageFilter = params.get("stage") ?? "all";
  const [artworkOnly, setArtworkOnly] = useState(false);

  const conceptsQ = useConcepts();
  const designsQ = useDesigns();
  const entitiesQ = useEntities();

  const entityName = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entitiesQ.data ?? []) m.set(e.id, e.name);
    return m;
  }, [entitiesQ.data]);

  const concepts = useMemo(() => {
    const all = conceptsQ.data ?? [];
    if (stageFilter === "all") return all;
    return all.filter((c) => stageOf(c) === stageFilter);
  }, [conceptsQ.data, stageFilter]);

  const designs = useMemo(() => {
    const all = designsQ.data ?? [];
    return artworkOnly ? all.filter((d) => d.productionReady) : all;
  }, [designsQ.data, artworkOnly]);

  const setStage = (s: string) => {
    const next = new URLSearchParams(params);
    if (s === "all") next.delete("stage");
    else next.set("stage", s);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Creative"
        subtitle="Artwork, and the concepts built from it. A concept is an idea; a design is the artwork itself."
        actions={
          <a
            href="/admin/design-templates"
            className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
            title="The Design Template system stays where it is — V2 does not rebuild it"
          >
            Design templates <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <Chip key={t} active={tab === t} onClick={() => setTab(t)}>
            {t === "concepts" ? "Product concepts" : "Designs"}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-[hsl(var(--ax-border))]" />
        {tab === "concepts" ? (
          <>
            <Chip active={stageFilter === "all"} onClick={() => setStage("all")}>
              All stages
            </Chip>
            {STAGES.map((s) => (
              <Chip key={s} active={stageFilter === s} onClick={() => setStage(s)}>
                {STAGE_LABELS[s]}
              </Chip>
            ))}
          </>
        ) : (
          <>
            <Chip active={!artworkOnly} onClick={() => setArtworkOnly(false)}>
              Everything
            </Chip>
            <Chip active={artworkOnly} onClick={() => setArtworkOnly(true)}>
              Production artwork only
            </Chip>
            <span className="text-[11px] text-[hsl(var(--ax-faint))]">
              Only designs with an exported production file count as artwork.
            </span>
          </>
        )}
      </div>

      {tab === "concepts" && (
        <>
          {conceptsQ.isLoading && <GridSkeleton />}
          {!conceptsQ.isLoading && concepts.length === 0 && (
            <EmptyState>
              No concepts at this stage. Open an entity in People and use “New concept” to start one.
            </EmptyState>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {concepts.map((c) => {
              const stage = stageOf(c);
              return (
                <Card key={c.id} className="p-0">
                  <AssetImage
                    url={c.imageUrl}
                    bucket={c.imageBucket}
                    path={c.imagePath}
                    alt={c.title}
                    className="aspect-square w-full bg-white/[0.03]"
                    fit="contain"
                  />
                  <div className="p-2.5">
                    <div className="truncate text-[12px] font-medium">{c.title}</div>
                    <div className="mt-0.5 truncate text-[10px] text-[hsl(var(--ax-faint))]">
                      {c.entityId ? entityName.get(c.entityId) ?? "—" : "No entity"}
                    </div>
                    <div className="mt-1.5">
                      <Chip tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Chip>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {tab === "designs" && (
        <>
          {designsQ.isLoading && <GridSkeleton />}
          {!designsQ.isLoading && designs.length === 0 && (
            <EmptyState>
              No production artwork found. Almost every design in the library today is concept art rather than an
              exported production file — this is tracked as a reconciliation item.
            </EmptyState>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
            {designs.map((d) => (
              <a key={d.id} href={`/admin/designs/${d.id}`} className="ax-card ax-card-hover overflow-hidden transition-all">
                <AssetImage
                  bucket={d.fileBucket}
                  path={d.filePath}
                  alt={d.title}
                  className="aspect-square w-full bg-black/30"
                  fit="contain"
                />
                <div className="p-1.5">
                  <div className="truncate text-[10px] text-[hsl(var(--ax-secondary))]">
                    {cleanDesignTitle(d.title) ?? "Untitled"}
                  </div>
                  <div className="mt-0.5 text-[9px]" style={{ color: d.productionReady ? "hsl(var(--ax-accent))" : "hsl(var(--ax-amber))" }}>
                    {d.productionReady ? "production" : "concept art"}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </>
      )}
    </>
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
