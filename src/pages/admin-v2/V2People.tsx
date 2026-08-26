import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, List, Search } from "lucide-react";
import { useEntities } from "@/lib/v2/data";
import {
  DEFAULT_ENTITY_FILTER,
  ENTITY_FACETS,
  matchesFilter,
  rankEntities,
  roleLabel,
  typeLabel,
} from "@/lib/v2/entity";
import { AssetImage, Chip, EmptyState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";

// People is the gateway into the AX ecosystem. One directory, one record per
// entity — a person who is both an athlete and a client appears under both
// filters as the SAME row, never as two profiles.

export default function V2People() {
  const { data, isLoading } = useEntities();
  const [filter, setFilter] = useState(DEFAULT_ENTITY_FILTER);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showDemo, setShowDemo] = useState(false);

  const rows = useMemo(() => {
    const all = (data ?? []).filter((e) => showDemo || !e.isDemo);
    return rankEntities(all.filter((e) => matchesFilter(e, filter)));
  }, [data, filter, showDemo]);

  const demoCount = (data ?? []).filter((e) => e.isDemo).length;

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Athletes, clients, organisations, schools, teams and partners — one record each."
        actions={
          <div className="flex items-center gap-1 rounded-full border border-[hsl(var(--ax-border))] p-0.5">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`rounded-full p-1.5 ${view === "grid" ? "bg-white/10 text-[hsl(var(--ax-ink))]" : "text-[hsl(var(--ax-faint))]"}`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`rounded-full p-1.5 ${view === "list" ? "bg-white/10 text-[hsl(var(--ax-ink))]" : "text-[hsl(var(--ax-faint))]"}`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <div className="mb-5 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
          <input
            value={filter.search}
            onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            placeholder="Search name, position, league, school…"
            className="w-full rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-2.5 pl-10 pr-4 text-[14px] outline-none placeholder:text-[hsl(var(--ax-faint))] focus:border-[hsl(var(--ax-accent))]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={filter.facet === "all"} onClick={() => setFilter({ ...filter, facet: "all" })}>
            All
          </Chip>
          {ENTITY_FACETS.map((f) => (
            <Chip key={f.key} active={filter.facet === f.key} onClick={() => setFilter({ ...filter, facet: f.key })}>
              {f.label}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-[hsl(var(--ax-border))]" />
          {(["active", "inactive", "all"] as const).map((a) => (
            <Chip key={a} active={filter.activity === a} onClick={() => setFilter({ ...filter, activity: a })}>
              {a === "all" ? "Any status" : a === "active" ? "Active" : "Inactive"}
            </Chip>
          ))}
          {demoCount > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-[hsl(var(--ax-border))]" />
              <Chip active={showDemo} onClick={() => setShowDemo(!showDemo)} title="Seeded Goat Farm Access demo athletes">
                {showDemo ? "Hiding nothing" : `Show ${demoCount} demo`}
              </Chip>
            </>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-[210px]" />
          ))}
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <EmptyState>No entity matches that filter. Try “All” or clear the search.</EmptyState>
      )}

      {!isLoading && rows.length > 0 && view === "grid" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {rows.map((e) => (
            <Link key={e.id} to={`/admin-v2/people/${e.id}`} className="ax-card ax-card-hover p-3 transition-all">
              <AssetImage
                url={e.avatarUrl}
                alt={e.name}
                className="mb-2.5 aspect-square w-full rounded-xl"
                fallbackSeed={e.id}
              />
              <div className="truncate text-[13px] font-medium">{e.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-[hsl(var(--ax-faint))]">
                {[typeLabel(e.entityType), e.position, e.league].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {e.roles.map((r) => (
                  <Chip key={r}>{roleLabel(r)}</Chip>
                ))}
              </div>
              <div className="mt-2 text-[11px] tabular-nums text-[hsl(var(--ax-secondary))]">
                {e.counts.products} products · {e.counts.designs} designs
              </div>
            </Link>
          ))}
        </div>
      )}

      {!isLoading && rows.length > 0 && view === "list" && (
        <div className="ax-card divide-y divide-[hsl(var(--ax-line))] overflow-hidden">
          {rows.map((e) => (
            <Link key={e.id} to={`/admin-v2/people/${e.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03]">
              <AssetImage url={e.avatarUrl} alt={e.name} className="h-9 w-9 shrink-0 rounded-lg" fallbackSeed={e.id} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{e.name}</span>
                <span className="block truncate text-[11px] text-[hsl(var(--ax-faint))]">
                  {[typeLabel(e.entityType), ...e.roles.map(roleLabel)].join(" · ")}
                </span>
              </span>
              <span className="hidden shrink-0 gap-4 text-[11px] tabular-nums text-[hsl(var(--ax-secondary))] sm:flex">
                <span>{e.counts.collections} coll</span>
                <span>{e.counts.concepts} concepts</span>
                <span>{e.counts.designs} designs</span>
                <span>{e.counts.products} products</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
