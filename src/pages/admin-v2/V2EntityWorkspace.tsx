import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, Plus } from "lucide-react";
import { useEntityWorkspace } from "@/lib/v2/data";
import { roleLabel, typeLabel } from "@/lib/v2/entity";
import { cleanDesignTitle, stageOf, STAGE_LABELS, STAGE_TONES } from "@/lib/v2/concepts";
import { fmtMoney } from "@/lib/v2/pricing";
import { AssetImage, Card, Chip, PageHeader, Section, Skeleton } from "@/components/admin-v2/primitives";
import ConceptBuilder from "@/components/admin-v2/ConceptBuilder";

// The entity workspace. Opening an entity should feel like opening their whole
// AX presence: what exists, what is in flight, what needs a decision — with the
// creative objects kept conceptually distinct (§8).

export default function V2EntityWorkspace() {
  const { id } = useParams();
  const { data, isLoading } = useEntityWorkspace(id);
  const [building, setBuilding] = useState(false);

  if (isLoading) {
    return (
      <>
        <Skeleton className="mb-6 h-24" />
        <Skeleton className="mb-4 h-40" />
        <Skeleton className="h-40" />
      </>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center text-[13px] text-[hsl(var(--ax-faint))]">
        That entity does not exist, or you do not have access to its organisation.
        <div className="mt-3">
          <Link to="/admin-v2/people" className="text-[hsl(var(--ax-accent))]">
            Back to People
          </Link>
        </div>
      </div>
    );
  }

  const { entity, collections, concepts, designs, products, orders, ordersNote } = data;
  const isAthlete = entity.roles.includes("athlete");
  const awaiting = concepts.filter((c) => c.approvalState === "pending").length;
  const productionReady = designs.filter((d) => d.productionReady).length;
  const liveProducts = products.filter((p) => p.shopifyProductId && p.status === "published").length;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <AssetImage
          url={entity.avatarUrl}
          alt={entity.name}
          className="h-20 w-20 shrink-0 rounded-2xl sm:h-24 sm:w-24"
          fallbackSeed={entity.id}
        />
        <div className="min-w-0 flex-1">
          <PageHeader
            title={entity.name}
            subtitle={
              <span className="flex flex-wrap items-center gap-1.5">
                <Chip>{typeLabel(entity.entityType)}</Chip>
                {entity.roles.map((r) => (
                  <Chip key={r} tone="var(--ax-accent)">
                    {roleLabel(r)}
                  </Chip>
                ))}
                {entity.position && <span className="text-[12px]">{entity.position}</span>}
                {entity.league && <span className="text-[12px]">· {entity.league}</span>}
                {entity.hasOwnOrg && (
                  <Chip tone="var(--ax-violet)" title="Owns a dedicated Supabase organisation">
                    Own org
                  </Chip>
                )}
              </span>
            }
            actions={
              <>
                <button
                  type="button"
                  onClick={() => setBuilding(true)}
                  className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))]"
                >
                  <Plus className="h-4 w-4" />
                  New concept
                </button>
                {isAthlete && (
                  <a
                    href={`/a/${entity.slug}`}
                    className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
                  >
                    Fan profile <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}
                <a
                  href={`/admin/athletes/${entity.id}`}
                  className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
                >
                  Open in V1 <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </>
            }
          />
        </div>
      </div>

      {/* A short status strip, not a KPI wall. */}
      <div className="mb-8 flex flex-wrap gap-2 text-[12px]">
        <StatusPill label="Collections" value={collections.length} />
        <StatusPill label="Concepts" value={concepts.length} />
        {awaiting > 0 && <StatusPill label="Awaiting approval" value={awaiting} tone="var(--ax-amber)" />}
        <StatusPill label="Designs" value={designs.length} />
        <StatusPill
          label="Production-ready artwork"
          value={`${productionReady}/${designs.length}`}
          tone={productionReady === 0 && designs.length > 0 ? "var(--ax-red)" : undefined}
        />
        <StatusPill label="Products" value={products.length} />
        <StatusPill label="Live on Shopify" value={liveProducts} tone="var(--ax-accent)" />
      </div>

      <Section
        title="Collections"
        count={collections.length}
        empty="No collections yet. A collection is a permanent home for this entity's creative work — it does not need Shopify products to exist."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {collections.map((c) => (
            <a key={c.id} href={`/admin/collections/${c.id}`} className="ax-card ax-card-hover overflow-hidden transition-all">
              <AssetImage url={c.coverImageUrl} alt={c.name} className="aspect-[4/3] w-full" fallbackSeed={c.id} />
              <div className="p-3">
                <div className="truncate text-[13px] font-medium">{c.name}</div>
                <div className="mt-1 text-[11px] tabular-nums text-[hsl(var(--ax-faint))]">
                  {c.designCount} designs · {c.conceptCount} concepts · {c.productCount} products
                </div>
              </div>
            </a>
          ))}
        </div>
      </Section>

      <Section
        title="Product concepts"
        count={concepts.length}
        action={
          <button type="button" onClick={() => setBuilding(true)} className="text-[12px] text-[hsl(var(--ax-accent))]">
            + New
          </button>
        }
        empty="No concepts yet. A concept can be nothing more than an image and this entity — start one and fill in the rest later."
      >
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
                  <div className="mt-1 truncate text-[10px] text-[hsl(var(--ax-faint))]">
                    {[c.colorName, c.placementLabel].filter(Boolean).join(" · ") || "Unspecified"}
                  </div>
                  <div className="mt-1.5">
                    <Chip tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Chip>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section
        title="Designs"
        count={designs.length}
        empty="No artwork linked to this entity yet."
      >
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
          {designs.slice(0, 24).map((d) => (
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
                {!d.productionReady && <div className="mt-0.5 text-[9px] text-[hsl(var(--ax-amber))]">concept art</div>}
              </div>
            </a>
          ))}
        </div>
      </Section>

      <Section title="Products" count={products.length} empty="Nothing configured for sale yet.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {products.slice(0, 18).map((p) => (
            <a key={p.id} href={`/admin/products/${p.id}`} className="ax-card ax-card-hover overflow-hidden transition-all">
              <AssetImage url={p.imageUrl} alt={p.title} className="aspect-square w-full bg-white/[0.03]" fit="contain" />
              <div className="p-2.5">
                <div className="truncate text-[12px] font-medium">{p.title}</div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="tabular-nums text-[hsl(var(--ax-secondary))]">{fmtMoney(p.price)}</span>
                  {p.shopifyProductId ? (
                    <Chip tone="var(--ax-accent)">Live</Chip>
                  ) : (
                    <Chip tone="var(--ax-faint)">{p.status}</Chip>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      </Section>

      <Section title="Recent orders" count={orders.length} empty={ordersNote}>
        <div className="ax-card divide-y divide-[hsl(var(--ax-line))] overflow-hidden">
          {orders.map((o) => (
            <a key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center gap-3 px-3 py-2.5 text-[12px] hover:bg-white/[0.03]">
              <span className="w-24 shrink-0 truncate font-medium">{o.name ?? "—"}</span>
              <span className="w-24 shrink-0 truncate text-[hsl(var(--ax-faint))]">
                {o.orderDate ? new Date(o.orderDate).toLocaleDateString() : "—"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[hsl(var(--ax-secondary))]">{o.customerName ?? "—"}</span>
              <span className="shrink-0 tabular-nums">{fmtMoney(o.total)}</span>
              <span className="hidden w-24 shrink-0 truncate text-right text-[hsl(var(--ax-faint))] sm:block">
                {o.fulfillmentStatus ?? "unfulfilled"}
              </span>
            </a>
          ))}
        </div>
        {orders.length > 0 && <p className="mt-2 text-[11px] text-[hsl(var(--ax-faint))]">{ordersNote}</p>}
      </Section>

      {building && (
        <ConceptBuilder entity={entity} onClose={() => setBuilding(false)} />
      )}
    </>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5"
      style={tone ? { borderColor: `hsl(${tone} / 0.4)` } : undefined}
    >
      <span className="font-semibold tabular-nums" style={tone ? { color: `hsl(${tone})` } : undefined}>
        {value}
      </span>
      <span className="text-[hsl(var(--ax-secondary))]">{label}</span>
    </span>
  );
}
