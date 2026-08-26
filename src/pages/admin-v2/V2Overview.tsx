import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useOverview } from "@/lib/v2/data";
import { AssetImage, Card, PageHeader, Section, Skeleton, Stat } from "@/components/admin-v2/primitives";
import { stageOf, STAGE_LABELS } from "@/lib/v2/concepts";

// Overview answers one question: what needs my attention?
// Four numbers, then a deep-linked action list. No vanity metric wall.

export default function V2Overview() {
  const { data, isLoading } = useOverview();

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="What needs your attention today. Every action links straight into the work."
      />

      <div className="mb-9 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading || !data ? (
          <>
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
            <Skeleton className="h-[76px]" />
          </>
        ) : (
          <>
            <Stat label="Active entities" value={data.stats.activeEntities} />
            <Stat label="Concepts" value={data.stats.concepts} />
            <Stat label="Live products" value={data.stats.liveProducts} />
            <Stat label="Blanks" value={data.stats.blanks} />
          </>
        )}
      </div>

      <Section
        title="Action required"
        count={data?.actions.length}
        empty="Nothing waiting. Every concept, product and blank is in a settled state."
      >
        <div className="grid gap-2">
          {isLoading && <Skeleton className="h-16" />}
          {data?.actions.map((a) => (
            <Link
              key={a.id}
              to={a.to}
              className="ax-card ax-card-hover flex items-center gap-4 px-4 py-3.5 transition-all"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[15px] font-semibold tabular-nums"
                style={{ background: `hsl(${a.tone} / 0.14)`, color: `hsl(${a.tone})` }}
              >
                {a.count}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{a.label}</span>
                <span className="block truncate text-[12px] text-[hsl(var(--ax-faint))]">{a.detail}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-[hsl(var(--ax-faint))]" />
            </Link>
          ))}
        </div>
      </Section>

      <Section
        title="Recent concepts"
        count={data?.recentConcepts.length}
        empty="No product concepts yet. Open an entity and start one from a design or a blank."
        action={
          <Link to="/admin-v2/creative" className="text-[12px] text-[hsl(var(--ax-accent))]">
            All creative
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data?.recentConcepts.map((c) => (
            <Card key={c.id} className="p-0">
              <AssetImage
                url={c.imageUrl}
                bucket={c.imageBucket}
                path={c.imagePath}
                alt={c.title}
                className="aspect-square w-full"
                fit="contain"
              />
              <div className="p-2.5">
                <div className="truncate text-[12px] font-medium">{c.title}</div>
                <div className="mt-0.5 text-[11px] text-[hsl(var(--ax-faint))]">{STAGE_LABELS[stageOf(c)]}</div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        title="People"
        count={data?.recentEntities.length}
        action={
          <Link to="/admin-v2/people" className="text-[12px] text-[hsl(var(--ax-accent))]">
            Full directory
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data?.recentEntities.map((e) => (
            <Link key={e.id} to={`/admin-v2/people/${e.id}`} className="ax-card ax-card-hover p-3 transition-all">
              <AssetImage
                url={e.avatarUrl}
                alt={e.name}
                className="mb-2 aspect-square w-full rounded-xl"
                fallbackSeed={e.id}
              />
              <div className="truncate text-[12px] font-medium">{e.name}</div>
              <div className="truncate text-[11px] text-[hsl(var(--ax-faint))]">
                {e.counts.products} products · {e.counts.collections} collections
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
