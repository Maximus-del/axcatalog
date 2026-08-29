import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Plus } from "lucide-react";
import { useEntityWorkspace, useMockupLibrary } from "@/lib/v2/data";
import { roleLabel, typeLabel } from "@/lib/v2/entity";
import { cleanDesignTitle, isConfigurable, stageOf, STAGE_LABELS, STAGE_TONES } from "@/lib/v2/concepts";
import { fmtMoney } from "@/lib/v2/pricing";
import { shopLink } from "@/lib/ecosystem/image";
import { AssetImage, Card, Chip, PageHeader, Section, Skeleton } from "@/components/admin-v2/primitives";
import WorkflowNav, { type WorkflowStep } from "@/components/admin-v2/WorkflowNav";
import DesignShelf, { type ShelfFilter } from "@/components/admin-v2/DesignShelf";
import ProductizeDrawer from "@/components/admin-v2/ProductizeDrawer";
import ConceptBuilder from "@/components/admin-v2/ConceptBuilder";
import DesignDrawer from "@/components/admin-v2/DesignDrawer";
import MockupLibrary from "@/components/admin-v2/MockupLibrary";
import AssetsDrawer from "@/components/admin-v2/AssetsDrawer";
import MockupDetail from "@/components/admin-v2/MockupDetail";
import type { Design, Mockup } from "@/lib/v2/types";

// The AX operator workspace for one entity.
//
// Everything an athlete or client eventually sees in their own dashboard is
// built here, so the page is ordered as the work actually happens:
//
//     Designs -> Mockups -> Products -> Collections -> Live
//
// Blanks are deliberately absent. They are shared AX infrastructure, not this
// entity's property, and they belong in the moment a mockup is created — which
// is where ConceptBuilder already surfaces them.

type StepKey = "designs" | "mockups" | "products" | "collections" | "live";
const STEP_ORDER: StepKey[] = ["designs", "mockups", "products", "collections", "live"];


export default function V2EntityWorkspace() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useEntityWorkspace(id);
  const [building, setBuilding] = useState(false);
  // The design currently opened for its creative options, and the design the
  // mockup builder was launched from (they differ for a moment while the drawer
  // hands off to the builder).
  const [openDesign, setOpenDesign] = useState<Design | null>(null);
  const [mockupFrom, setMockupFrom] = useState<Design | null>(null);
  // A saved mockup reopened for editing, and one being turned into assets.
  const [editMockupId, setEditMockupId] = useState<string | null>(null);
  const [assetsFor, setAssetsFor] = useState<Mockup | null>(null);
  // Clicking a mockup opens its own page; editing is one step further in.
  const [detailMockup, setDetailMockup] = useState<Mockup | null>(null);
  const [productizing, setProductizing] = useState<string | null>(null);
  // A deep link from Creative: /admin-v2/people/:id?mockup=<id>. Consumed once
  // and stripped from the URL, so a refresh does not keep reopening it and the
  // back button behaves.
  const requestedMockup = params.get("mockup");
  const [active, setActive] = useState<StepKey>("designs");
  const [designFilter, setDesignFilter] = useState<ShelfFilter>("all");
  const scrollingTo = useRef<StepKey | null>(null);

  const goTo = useCallback((key: string) => {
    const step = key as StepKey;
    setActive(step);
    // Suppress the observer while the smooth scroll is in flight, otherwise the
    // sections we pass through steal the highlight.
    scrollingTo.current = step;
    document.getElementById(step)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      scrollingTo.current = null;
    }, 700);
  }, []);

  // Keep the rail in sync while the operator scrolls by hand.
  useEffect(() => {
    if (!data) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingTo.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id as StepKey);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: 0 },
    );
    for (const key of STEP_ORDER) {
      const el = document.getElementById(key);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [data]);

  const derived = useMemo(() => {
    if (!data) return null;
    const { designs, concepts, products } = data;
    const productionReady = designs.filter((d) => d.productionReady);
    const missingArtwork = designs.filter((d) => !d.productionReady);
    const awaiting = concepts.filter((c) => c.approvalState === "pending");
    const readyToConfigure = concepts.filter(
      (c) => !c.productId && c.approvalState !== "pending" && isConfigurable(c),
    );
    const live = products.filter((p) => p.shopifyProductId && p.status === "published");
    const readyForShopify = products.filter(
      (p) => p.approvalState === "approved" && !p.shopifyProductId && p.status !== "archived",
    );
    return { productionReady, missingArtwork, awaiting, readyToConfigure, live, readyForShopify };
  }, [data]);

  if (isLoading) {
    return (
      <>
        <Skeleton className="mb-6 h-24" />
        <Skeleton className="mb-6 h-16" />
        <Skeleton className="mb-4 h-40" />
        <Skeleton className="h-40" />
      </>
    );
  }

  if (!data || !derived) {
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
  const { productionReady, missingArtwork, awaiting, readyToConfigure, live, readyForShopify } = derived;
  const isAthlete = entity.roles.includes("athlete");

  const steps: WorkflowStep[] = [
    {
      key: "designs",
      label: "Designs",
      count: designs.length,
      flag: missingArtwork.length > 0 ? `${missingArtwork.length} no artwork` : undefined,
    },
    {
      key: "mockups",
      label: "Mockups",
      count: concepts.length,
      flag: awaiting.length > 0 ? `${awaiting.length} waiting` : undefined,
    },
    {
      key: "products",
      label: "Products",
      count: products.length,
      flag: readyForShopify.length > 0 ? `${readyForShopify.length} to push` : undefined,
      flagTone: "var(--ax-violet)",
    },
    { key: "collections", label: "Collections", count: collections.length },
    { key: "live", label: "Live", count: live.length, tone: live.length > 0 ? "var(--ax-accent)" : undefined },
  ];

  const attention = [
    missingArtwork.length > 0 && {
      id: "artwork",
      text: `${missingArtwork.length} ${missingArtwork.length === 1 ? "design has" : "designs have"} no production artwork`,
      action: () => {
        setDesignFilter("concept");
        goTo("designs");
      },
      tone: "var(--ax-amber)",
    },
    awaiting.length > 0 && {
      id: "approval",
      text: `${awaiting.length} ${awaiting.length === 1 ? "mockup is" : "mockups are"} awaiting approval`,
      action: () => goTo("mockups"),
      tone: "var(--ax-amber)",
    },
    readyToConfigure.length > 0 && {
      id: "configure",
      text: `${readyToConfigure.length} ${readyToConfigure.length === 1 ? "mockup is" : "mockups are"} ready to become products`,
      action: () => goTo("mockups"),
      tone: "var(--ax-blue)",
    },
    readyForShopify.length > 0 && {
      id: "shopify",
      text: `${readyForShopify.length} approved ${readyForShopify.length === 1 ? "product has" : "products have"} never been pushed to Shopify`,
      action: () => goTo("products"),
      tone: "var(--ax-violet)",
    },
  ].filter(Boolean) as { id: string; text: string; action: () => void; tone: string }[];


  return (
    <>
      {/* ---------------------------------------------------------- identity */}
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
                  Create Mockup
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

      {/* ------------------------------------------------- pipeline as nav */}
      <WorkflowNav steps={steps} active={active} onSelect={goTo} />

      {/* --------------------------------------------------- needs attention */}
      {attention.length > 0 && (
        <div className="mb-8 grid gap-1.5">
          {attention.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={a.action}
              className="ax-card ax-card-hover flex items-center gap-3 px-3.5 py-2.5 text-left text-[13px] transition-all"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `hsl(${a.tone})` }} />
              <span className="min-w-0 flex-1">{a.text}</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-faint))]" />
            </button>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------ 1 DESIGNS */}
      <Section
        id="designs"
        eyebrow="Step 1"
        title="Designs"
        detail="Artwork linked to this entity. Everything downstream refers back to one."
        count={designs.length}
        action={
          designs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip active={designFilter === "all"} onClick={() => setDesignFilter("all")}>
                All {designs.length}
              </Chip>
              <Chip active={designFilter === "ready"} onClick={() => setDesignFilter("ready")}>
                Production-ready {productionReady.length}
              </Chip>
              <Chip active={designFilter === "concept"} onClick={() => setDesignFilter("concept")}>
                No artwork yet {missingArtwork.length}
              </Chip>
            </div>
          ) : undefined
        }
        empty="No artwork linked to this entity yet. Designs are the starting point — everything downstream refers back to one."
      >
        <DesignShelf
          entityId={entity.id}
          organizationId={entity.organizationId}
          entityName={entity.name}
          filter={designFilter}
          onOpenDesign={setOpenDesign}
        />
      </Section>

      {/* ------------------------------------------------------------ 2 MOCKUPS */}
      {/*
        The mockup LIBRARY, not a staging area. A mockup is a finished object
        that can live here indefinitely — no price, no product, nothing sent to
        Shopify — and it is organised exactly like the Designs shelf so there is
        only one filing system to learn.
      */}
      <Section
        id="mockups"
        eyebrow="Step 2"
        title="Mockups"
        detail="Artwork placed on a blank. A mockup is finished work in its own right."
        count={concepts.length}
        action={
          <button type="button" onClick={() => setBuilding(true)} className="text-[12px] text-[hsl(var(--ax-accent))]">
            + Create mockup
          </button>
        }
      >
        <MockupLibrary
          entityId={entity.id}
          organizationId={entity.organizationId}
          onOpen={(m) => setDetailMockup(m)}
          onTurnIntoAssets={(m) => setAssetsFor(m)}
          onCreateProduct={(m) => setProductizing(m.id)}
        />
      </Section>

      {/* ----------------------------------------------------------- 3 PRODUCTS */}
      <Section
        id="products"
        eyebrow="Step 3"
        title="Products"
        detail="Configured, sellable objects with pricing and variants."
        count={products.length}
        empty="Nothing configured for sale yet. A product is a mockup that has been given the commerce details — colours, sizes, price."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {products.slice(0, 18).map((p) => (
            <a
              key={p.id}
              href={`/admin/products/${p.id}`}
              className="ax-card ax-card-hover overflow-hidden transition-all"
            >
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
        {products.length > 18 && (
          <p className="mt-2 text-[11px] text-[hsl(var(--ax-faint))]">Showing 18 of {products.length}.</p>
        )}
      </Section>

      {/* -------------------------------------------------------- 4 COLLECTIONS */}
      <Section
        id="collections"
        eyebrow="Grouping"
        title="Collections"
        detail="Drops, capsules and lookbooks this entity’s work belongs to."
        count={collections.length}
        empty="No collections yet. A collection is a permanent home for this entity's creative work — it does not need Shopify products to exist."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {collections.map((c) => (
            <a
              key={c.id}
              href={`/admin/collections/${c.id}`}
              className="ax-card ax-card-hover overflow-hidden transition-all"
            >
              <AssetImage url={c.coverImageUrl} alt={c.name} className="aspect-[4/3] w-full" fallbackSeed={c.id} />
              <div className="p-3">
                <div className="truncate text-[13px] font-medium">{c.name}</div>
                <div className="mt-1 text-[11px] tabular-nums text-[hsl(var(--ax-faint))]">
                  {c.designCount} designs · {c.conceptCount} mockups · {c.productCount} products
                </div>
              </div>
            </a>
          ))}
        </div>
      </Section>

      {/* --------------------------------------------------------------- 5 LIVE */}
      <Section
        id="live"
        eyebrow="Storefront"
        title="Live"
        detail="What a customer can actually buy right now."
        count={live.length}
        empty="Nothing is live yet. Products appear here once they are published and carry a Shopify product."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {live.map((p) => {
            const store = shopLink(p.shopifyHandle);
            return (
              <div key={p.id} className="ax-card overflow-hidden">
                <AssetImage
                  url={p.imageUrl}
                  alt={p.title}
                  className="aspect-square w-full bg-white/[0.03]"
                  fit="contain"
                />
                <div className="p-2.5">
                  <div className="truncate text-[12px] font-medium">{p.title}</div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="tabular-nums text-[hsl(var(--ax-secondary))]">{fmtMoney(p.price)}</span>
                    <a href={`/admin/products/${p.id}`} className="text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]">
                      Edit
                    </a>
                  </div>
                  {store && (
                    <a
                      href={store}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 flex items-center gap-1 text-[11px] text-[hsl(var(--ax-accent))]"
                    >
                      View in store <ArrowUpRight className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Orders stay, quietly, below the pipeline — useful context, not a stage. */}
      <Section
        eyebrow="Commerce"
        title="Recent orders"
        detail="Orders attributed to this entity’s organisation."
        count={orders.length}
        empty={ordersNote}
      >
        <div className="ax-card divide-y divide-[hsl(var(--ax-line))] overflow-hidden">
          {orders.map((o) => (
            <a
              key={o.id}
              href={`/admin/orders/${o.id}`}
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
            </a>
          ))}
        </div>
        {orders.length > 0 && <p className="mt-2 text-[11px] text-[hsl(var(--ax-faint))]">{ordersNote}</p>}
      </Section>

      {openDesign && (
        <DesignDrawer
          design={openDesign}
          entity={entity}
          onClose={() => setOpenDesign(null)}
          onPlaceOnBlank={() => {
            setMockupFrom(openDesign);
            setOpenDesign(null);
            setBuilding(true);
          }}
        />
      )}

      {building && (
        <ConceptBuilder
          entity={entity}
          initialFlow="design_first"
          initialDesign={mockupFrom}
          onClose={() => {
            setBuilding(false);
            setMockupFrom(null);
          }}
        />
      )}

      {editMockupId && (
        <ConceptBuilder
          entity={entity}
          editMockupId={editMockupId}
          onClose={() => setEditMockupId(null)}
        />
      )}

      {requestedMockup && !detailMockup && (
        <MockupDeepLink
          mockupId={requestedMockup}
          entityId={id}
          onResolved={(m) => {
            setDetailMockup(m);
            const next = new URLSearchParams(params);
            next.delete("mockup");
            setParams(next, { replace: true });
          }}
        />
      )}

      {detailMockup && (
        <MockupDetail
          mockup={detailMockup}
          entity={entity}
          onClose={() => setDetailMockup(null)}
          onEdit={() => {
            setEditMockupId(detailMockup.id);
            setDetailMockup(null);
          }}
          onCreateAssets={() => {
            setAssetsFor(detailMockup);
            setDetailMockup(null);
          }}
          onMakeLive={() => {
            setProductizing(detailMockup.id);
            setDetailMockup(null);
          }}
          onDeleted={() => setDetailMockup(null)}
        />
      )}

      {assetsFor && (
        <AssetsDrawer mockup={assetsFor} entityName={entity.name} onClose={() => setAssetsFor(null)} />
      )}

      {productizing &&
        (() => {
          const c = concepts.find((x) => x.id === productizing);
          if (!c) return null;
          return (
            <ProductizeDrawer
              entity={entity}
              concept={c}
              design={designs.find((d) => d.id === c.designId) ?? null}
              collections={collections}
              onClose={() => setProductizing(null)}
            />
          );
        })()}
    </>
  );
}

/**
 * Resolves a ?mockup=<id> deep link into the full Mockup the detail page needs.
 *
 * Creative only knows the concept's id; the detail page wants the library row
 * with its folder, lifecycle and surfaces. Rather than thread a second loading
 * state through the workspace, this renders nothing and simply calls back once
 * the library has the row. If the id belongs to someone else — a stale link, or
 * a mockup that moved — nothing opens, which is the right outcome for a link
 * that no longer points anywhere.
 */
function MockupDeepLink({
  mockupId,
  entityId,
  onResolved,
}: {
  mockupId: string;
  entityId: string | undefined;
  onResolved: (mockup: Mockup) => void;
}) {
  const { data } = useMockupLibrary(entityId);
  useEffect(() => {
    const found = data?.mockups.find((m) => m.id === mockupId);
    if (found) onResolved(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, mockupId]);
  return null;
}
