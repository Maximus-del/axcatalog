import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, LayoutGrid, List, Search, UserPlus } from "lucide-react";
import { useEntities } from "@/lib/v2/data";
import { ENTITY_FACETS, matchesFilter, rankEntities, roleLabel, typeLabel } from "@/lib/v2/entity";
import { AssetImage, Chip, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";

// People is the gateway into the AX ecosystem. One directory, one record per
// entity — a person who is both an athlete and a client appears under both
// filters as the SAME row, never as two profiles.
//
// The directory's state lives in the URL. Walking into someone's workspace and
// pressing back used to land you on a reset grid, which is the wrong answer to
// "let me check the next client on that list".

export default function V2People() {
  const { data, isLoading, isError, error, refetch } = useEntities();
  const [params, setParams] = useSearchParams();

  const facet = params.get("facet") ?? "all";
  const activity = params.get("activity") ?? "active";
  const search = params.get("q") ?? "";
  const view = params.get("view") === "list" ? "list" : "grid";
  const showDemo = params.get("demo") === "1";

  const patch = (changes: Partial<{ facet: string; activity: string; q: string; view: string; demo: boolean }>) => {
    const next = new URLSearchParams(params);
    const set = (key: string, value: string, fallback: string) => {
      if (value === fallback) next.delete(key);
      else next.set(key, value);
    };
    set("facet", changes.facet ?? facet, "all");
    set("activity", changes.activity ?? activity, "active");
    set("view", changes.view ?? view, "grid");
    const q = changes.q ?? search;
    set("q", q.trim(), "");
    const demo = changes.demo ?? showDemo;
    set("demo", demo ? "1" : "0", "0");
    setParams(next, { replace: true });
  };

  const rows = useMemo(() => {
    const all = (data ?? []).filter((e) => showDemo || !e.isDemo);
    return rankEntities(all.filter((e) => matchesFilter(e, { search, facet, activity })));
  }, [data, search, facet, activity, showDemo]);

  const demoCount = (data ?? []).filter((e) => e.isDemo).length;

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Athletes, clients, organisations, schools, teams and partners — one record each."
        actions={
          <>
            {/*
              Entity creation still lives in V1 — it is a real form with roles,
              org assignment and slug rules, and rebuilding it before V2 needs
              to own it would be duplication for its own sake. Linking out is
              honest; a disabled button would not be.
            */}
            <Link
              to="/admin/athletes"
              className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))]"
              title="Adding a person still happens in the V1 directory"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add someone
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <div className="flex items-center gap-1 rounded-full border border-[hsl(var(--ax-border))] p-0.5">
              <button
                type="button"
                onClick={() => patch({ view: "grid" })}
                className={`rounded-full p-1.5 ${view === "grid" ? "bg-white/10 text-[hsl(var(--ax-ink))]" : "text-[hsl(var(--ax-faint))]"}`}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => patch({ view: "list" })}
                className={`rounded-full p-1.5 ${view === "list" ? "bg-white/10 text-[hsl(var(--ax-ink))]" : "text-[hsl(var(--ax-faint))]"}`}
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </>
        }
      />

      <div className="mb-5 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
          <input
            value={search}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Search name, position, league, school…"
            className="w-full rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-2.5 pl-10 pr-4 text-[14px] outline-none placeholder:text-[hsl(var(--ax-faint))] focus:border-[hsl(var(--ax-accent))]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={facet === "all"} onClick={() => patch({ facet: "all" })}>
            All
          </Chip>
          {ENTITY_FACETS.map((f) => (
            <Chip key={f.key} active={facet === f.key} onClick={() => patch({ facet: f.key })}>
              {f.label}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-[hsl(var(--ax-border))]" />
          {(["active", "inactive", "all"] as const).map((a) => (
            <Chip key={a} active={activity === a} onClick={() => patch({ activity: a })}>
              {a === "all" ? "Any status" : a === "active" ? "Active" : "Inactive"}
            </Chip>
          ))}
          {demoCount > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-[hsl(var(--ax-border))]" />
              <Chip
                active={showDemo}
                onClick={() => patch({ demo: !showDemo })}
                title="Seeded Goat Farm Access demo athletes"
              >
                {showDemo ? "Hiding nothing" : `Show ${demoCount} demo`}
              </Chip>
            </>
          )}
          <span className="ml-auto text-[11px] tabular-nums text-[hsl(var(--ax-faint))]">{rows.length} shown</span>
        </div>
      </div>

      {isError && <ErrorState error={error} what="the directory" onRetry={() => void refetch()} />}

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-[210px]" />
          ))}
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
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
            <Link
              key={e.id}
              to={`/admin-v2/people/${e.id}`}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.03]"
            >
              <AssetImage url={e.avatarUrl} alt={e.name} className="h-9 w-9 shrink-0 rounded-lg" fallbackSeed={e.id} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{e.name}</span>
                <span className="block truncate text-[11px] text-[hsl(var(--ax-faint))]">
                  {[typeLabel(e.entityType), ...e.roles.map(roleLabel)].join(" · ")}
                </span>
              </span>
              <span className="hidden shrink-0 gap-4 text-[11px] tabular-nums text-[hsl(var(--ax-secondary))] sm:flex">
                <span>{e.counts.collections} coll</span>
                <span>{e.counts.concepts} mockups</span>
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
