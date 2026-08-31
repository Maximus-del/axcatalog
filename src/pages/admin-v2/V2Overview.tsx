import { Link } from "react-router-dom";
import { ArrowRight, Layers3, Package, Receipt, ShoppingBag, Users } from "lucide-react";
import { useOverview } from "@/lib/v2/data";
import { entityLibraryHref } from "@/lib/v2/entity-nav";
import { fmtMoney } from "@/lib/v2/pricing";
import { stageOf, STAGE_LABELS, STAGE_TONES } from "@/lib/v2/concepts";
import { catalogHref } from "@/lib/v2/catalog-nav";
import { AssetImage, Chip, ErrorState, Metric, PageHeader, Section, Skeleton } from "@/components/admin-v2/primitives";

// THE START OF A WORKDAY, NOT AN ANALYTICS PAGE.
//
// Four questions, in this order: what needs me, what is moving, who am I
// working with. Every number and every card on this page is a link — a figure
// you cannot act on is decoration, and this is the one screen where decoration
// costs the most.

export default function V2Overview() {
  const { data, isLoading, isError, error, refetch } = useOverview();
  const loading = isLoading || !data;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="What needs your attention today. Every number and every card links straight into the work."
      />

      <div className="mb-9 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Active people" value={data?.stats.activeEntities ?? 0} loading={loading} icon={<Users />} href="/admin-v2/people" />
        <Metric label="Mockups" value={data?.stats.concepts ?? 0} loading={loading} icon={<Layers3 />} href="/admin-v2/creative?tab=mockups" />
        <Metric label="Live products" value={data?.stats.liveProducts ?? 0} loading={loading} icon={<ShoppingBag />} href={catalogHref({ tab: "products" })} />
        <Metric label="Blanks" value={data?.stats.blanks ?? 0} loading={loading} icon={<Package />} href={catalogHref({ tab: "blanks" })} />
        <Metric label="Open orders" value={data?.openOrders ?? 0} loading={loading} icon={<Receipt />} href="/admin-v2/orders?open=1" />
      </div>

      {isError && (
        <div className="mb-6">
          <ErrorState error={error} what="your overview" onRetry={() => void refetch()} />
        </div>
      )}

      <Section
        eyebrow="Today"
        title="Action required"
        detail="Work that cannot move forward without a decision."
        count={data?.actions.length}
        empty="Nothing waiting. Every mockup, product and blank is in a settled state."
      >
        <div className="grid gap-2">
          {loading && <Skeleton className="h-16" />}
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
        eyebrow="Across AX"
        title="Recent mockups"
        detail="The newest artwork-on-garment from every athlete, client and organisation."
        count={data?.recentConcepts.length}
        empty="No mockups yet. Open someone in People and build one from a design or a blank."
        action={
          <Link to="/admin-v2/creative?tab=mockups" className="text-[12px] text-[hsl(var(--ax-accent))]">
            All creative
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {data?.recentConcepts.map((c) => {
            const stage = stageOf(c);
            return (
              /*
                A mockup's home is its person's workspace, so the card routes
                there and asks that page to open it. Same destination Creative
                uses — one object, one place to live.
              */
              <Link
                key={c.id}
                to={c.entityId ? entityLibraryHref(c.entityId, { mockup: c.id }) : "/admin-v2/people"}
                title={c.entityId ? `Open ${c.title}` : "This mockup has no owner — pick one"}
                className="ax-card ax-card-hover overflow-hidden p-0 transition-all"
              >
                <AssetImage
                  url={c.imageUrl}
                  bucket={c.imageBucket}
                  path={c.imagePath}
                  alt={c.title}
                  className="aspect-square w-full"
                  fit="contain"
                  fallbackSeed={c.id}
                />
                <div className="p-2.5">
                  <div className="truncate text-[12px] font-medium">{c.title}</div>
                  <div className="mt-1.5">
                    <Chip tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Chip>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section
        eyebrow="Commerce"
        title="Recent orders"
        detail="What customers have actually bought, newest first."
        count={data?.recentOrders.length}
        empty="No orders recorded yet."
        action={
          <Link to="/admin-v2/orders" className="text-[12px] text-[hsl(var(--ax-accent))]">
            All orders
          </Link>
        }
      >
        <div className="ax-card divide-y divide-[hsl(var(--ax-line))] overflow-hidden">
          {data?.recentOrders.map((o) => (
            <Link
              key={o.id}
              to={`/admin/orders/${o.id}`}
              className="flex items-center gap-3 px-3 py-2.5 text-[12px] hover:bg-white/[0.03]"
            >
              <span className="w-24 shrink-0 truncate font-medium">{o.name ?? "—"}</span>
              <span className="w-24 shrink-0 truncate text-[hsl(var(--ax-faint))]">
                {o.orderDate ? new Date(o.orderDate).toLocaleDateString() : "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[hsl(var(--ax-secondary))]">{o.customerName ?? "—"}</span>
              <span className="shrink-0 tabular-nums">{fmtMoney(o.total)}</span>
              <span className="hidden w-24 shrink-0 truncate text-right text-[hsl(var(--ax-faint))] sm:block">
                {o.fulfillmentStatus ?? "unfulfilled"}
              </span>
            </Link>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Directory"
        title="People"
        detail="Athletes, clients and partners AX is currently working with."
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
