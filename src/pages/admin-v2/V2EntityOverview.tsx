import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Layers,
  MoreHorizontal,
  Palette,
  Plus,
  Eye,
  Pencil,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
} from "lucide-react";
import { useEntityWorkspace, useMockupLibrary } from "@/lib/v2/data";
import DropZone, { DropTrigger } from "@/components/admin-v2/DropZone";
import PortalInvitesCard from "@/components/admin-v2/PortalInvitesCard";
import ClientAccessCard from "@/components/admin-v2/ClientAccessCard";
import PortalThemeCard from "@/components/admin-v2/PortalThemeCard";
import CollectionWallCard from "@/components/admin-v2/CollectionWallCard";
import BrandTermsCard from "@/components/admin-v2/BrandTermsCard";
import { useDesignDrop } from "@/lib/v2/use-design-drop";
import { productHref } from "@/lib/v2/entity-nav";
import { useCart, useEntityOrders, type EntityOrder } from "@/lib/v2/cart-data";
import { PAYMENT_LABEL, fetchInvoice, invoiceEmail, mailtoHref, useSetPaymentStatus, type PaymentStatus } from "@/lib/v2/invoices";
import { useAuth } from "@/auth/AuthProvider";
import { entityCartHref, entityLibraryHref, entityPortalHref, type EntitySection } from "@/lib/v2/entity-nav";
import {
  identityLine,
  orderTone,
  preview,
  relativeTime,
  shortLabel,
  sinceLabel,
  statTiles,
} from "@/lib/v2/entity-overview";
import { isConfigurable } from "@/lib/v2/concepts";
import { mockupCover } from "@/lib/v2/mockup-image";
import { STATUS_LABEL, type BulkOrderStatus } from "@/lib/order-status";
import { fmtMoney } from "@/lib/v2/pricing";
import { roleLabel, typeLabel } from "@/lib/v2/entity";
import { AssetImage, Chip, ErrorState, Skeleton, V1Link, toneText } from "@/components/admin-v2/primitives";
import type { Collection, Design, Entity, Mockup, Product } from "@/lib/v2/types";

// THE ATHLETE OVERVIEW.
//
// One question: what is happening with this athlete right now, and what do I
// need to work on? Identity, then the numbers, then a few of each thing they
// own, then the orders.
//
// It shows THREE of anything and counts the rest. The full libraries live one
// click away at /admin-v2/people/:id/library, which is the page this one was
// split out of — it had grown into a vertical feed of every design, mockup,
// product and collection, which answers "show me everything" rather than
// "what needs me".
//
// Nothing here is a new data source. The workspace query already returns the
// entity, its designs, products and collections; the mockup library query is
// shared by key with the library page, so reading it here costs one cache hit.

export default function V2EntityOverview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useEntityWorkspace(id);
  const libraryQ = useMockupLibrary(id);
  const ordersQ = useEntityOrders(id);
  const cart = useCart(id, user?.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const drop = useDesignDrop(id ?? "", data?.entity.organizationId ?? "", data?.entity.name);

  const derived = useMemo(() => {
    if (!data) return null;
    const { designs, concepts, products } = data;
    return {
      awaiting: concepts.filter((c) => c.approvalState === "pending"),
      readyToConfigure: concepts.filter(
        (c) => !c.productId && c.approvalState !== "pending" && isConfigurable(c),
      ),
      missingArtwork: designs.filter((d) => !d.productionReady),
      readyForShopify: products.filter(
        (p) => p.approvalState === "approved" && !p.shopifyProductId && p.status !== "archived",
      ),
    };
  }, [data]);

  if (isLoading) {
    return (
      <>
        <Skeleton className="mb-6 h-[132px]" />
        <Skeleton className="mb-6 h-[92px]" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[280px]" />
          <Skeleton className="h-[280px]" />
        </div>
      </>
    );
  }

  // A failed read and a missing record are different facts. Telling someone
  // their client "does not exist" because the network blinked sends them
  // looking for a deletion that never happened.
  if (isError) {
    return (
      <>
        <Link to="/admin-v2/people" className="mb-3 inline-block text-[11px] text-[hsl(var(--ax-faint))]">
          ← People
        </Link>
        <ErrorState error={error} what="this athlete" onRetry={() => void refetch()} />
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

  const { entity, collections, designs, products } = data;

  /*
    TWO SHELVES, ONE EXISTING FACT.

    A design is production ARTWORK only when an export file exists for it.
    Everything else is a reference, a sketch, a screenshot — inspiration — and
    that is 111 of the 118 designs in the database. The split needed no new
    column and no new table; it was already true and simply never shown.
  */
  const artwork = designs.filter((d) => d.productionReady);
  const inspiration = designs.filter((d) => !d.productionReady);
  const mockups = libraryQ.data?.mockups ?? [];
  const orders = ordersQ.data;
  const lib = (section: EntitySection) => entityLibraryHref(entity.id, { focus: section });

  const tiles = statTiles({
    counts: entity.counts,
    orders: orders ?? { ytdTotal: 0, ytdCount: 0, ytdUnpriced: 0 },
    libraryHref: (section) => lib(section as EntitySection),
    ordersHref: lib("products"),
    money: (n) => fmtMoney(n),
  });

  /*
    WHAT NEEDS ME, IN ONE LINE EACH.

    Kept to a single strip directly under the numbers rather than a feed at the
    top of the page: the operator's first read is the athlete, not a changelog.
    Each row is a link into the library already scrolled to the right section.
  */
  const attention = [
    derived.awaiting.length > 0 && {
      id: "approval",
      text: `${derived.awaiting.length} ${derived.awaiting.length === 1 ? "mockup is" : "mockups are"} awaiting approval`,
      to: lib("mockups"),
      tone: "--ax-amber",
    },
    derived.readyToConfigure.length > 0 && {
      id: "configure",
      text: `${derived.readyToConfigure.length} ${derived.readyToConfigure.length === 1 ? "mockup is" : "mockups are"} ready to become products`,
      to: lib("mockups"),
      tone: "--ax-blue",
    },
    derived.readyForShopify.length > 0 && {
      id: "shopify",
      text: `${derived.readyForShopify.length} approved ${derived.readyForShopify.length === 1 ? "product has" : "products have"} never been pushed to Shopify`,
      to: lib("products"),
      tone: "--ax-violet",
    },
    derived.missingArtwork.length > 0 && {
      id: "artwork",
      text: `${derived.missingArtwork.length} ${derived.missingArtwork.length === 1 ? "design has" : "designs have"} no production artwork`,
      to: lib("designs"),
      tone: "--ax-amber",
    },
  ].filter(Boolean) as Array<{ id: string; text: string; to: string; tone: string }>;

  return (
    <>
      <AthleteHeader
        entity={entity}
        cartUnits={cart.data?.units ?? 0}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        onCreateMockup={() => navigate(entityLibraryHref(entity.id, { build: true }))}
      />

      {/* ------------------------------------------------------- stats strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <Link
            key={t.key}
            to={t.to}
            title={t.note}
            className="ax-card ax-card-hover flex items-center gap-3 px-3.5 py-3 transition-all"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `hsl(var(${t.tone}) / 0.14)`, color: toneText(`var(${t.tone})`) }}
              aria-hidden
            >
              <StatIcon name={t.key} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[20px] font-semibold leading-tight tabular-nums">{t.value}</span>
              <span className="block truncate text-[11px] text-[hsl(var(--ax-faint))]">{t.label}</span>
            </span>
          </Link>
        ))}
      </div>

      {/*
        Whether they can sign in sits above the work, not buried in a menu. For
        months the honest answer for every entity was "no" and nothing said so.
      */}
      <ClientAccessCard entityId={entity.id} entityName={entity.name} />
      {/* Owner/Team invite links, the approval queue, roles, and the public locker. */}
      <PortalInvitesCard entityId={entity.id} entityName={entity.name} organizationId={entity.organizationId ?? null} />
      {/* What their portal looks like — set here, seen there. */}
      <PortalThemeCard entityId={entity.id} entityName={entity.name} />
      {/* What stands on their home page — lockers, plaques — and in what order. */}
      <CollectionWallCard entityId={entity.id} entityName={entity.name} organizationId={entity.organizationId} />
      {/* The split, as the client's Brand HQ one-pagers will state it. */}
      <BrandTermsCard entityId={entity.id} entityName={entity.name} />
      <Link
        to={`/admin-v2/people/${entity.id}/lineup`}
        className="mb-6 flex items-center gap-3 rounded-2xl border border-[hsl(var(--ax-line))] bg-[hsl(var(--ax-card))] px-4 py-3 transition-colors hover:border-[hsl(var(--ax-accent)/0.5)]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">Portal lineup</span>
          <span className="block text-[12px] text-[hsl(var(--ax-faint))]">
            What {entity.name} sees in My Gear — add products, tag collections, pick Front / Back pictures.
          </span>
        </span>
        <span className="text-[12px] text-[hsl(var(--ax-accent))]">Open →</span>
      </Link>

      {attention.length > 0 && (
        <div className="mb-6 grid gap-1.5">
          {attention.map((a) => (
            <Link
              key={a.id}
              to={a.to}
              className="ax-card ax-card-hover flex items-center gap-3 px-3.5 py-2.5 text-[13px] transition-all"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `hsl(var(${a.tone}))` }} />
              <span className="min-w-0 flex-1">{a.text}</span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-faint))]" />
            </Link>
          ))}
        </div>
      )}

      {/* --------------------------------------------------- dashboard grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DashCard
          title="Recent Mockups"
          to={lib("mockups")}
          loading={libraryQ.isLoading}
          error={libraryQ.isError ? libraryQ.error : null}
          what="this athlete's mockups"
          empty="No mockups yet. A mockup is a design placed on a garment."
          count={mockups.length}
        >
          <TileGrid
            items={preview(mockups).shown}
            remaining={preview(mockups).remaining}
            to={lib("mockups")}
            render={(m: Mockup) => (
              <Link
                key={m.id}
                to={entityLibraryHref(entity.id, { mockup: m.id })}
                className="group min-w-0"
                title={m.title}
              >
                <AssetImage
                  {...mockupCover(m)}
                  alt={m.title}
                  className="aspect-square w-full rounded-xl border border-[hsl(var(--ax-border))] bg-white/[0.03] transition-colors group-hover:border-[hsl(var(--ax-accent))]"
                  fit="contain"
                  fallbackSeed={m.id}
                />
                <div className="mt-1.5 truncate text-[12px] font-medium">{m.title}</div>
                <div className="truncate text-[11px] text-[hsl(var(--ax-faint))]">{relativeTime(m.createdAt)}</div>
              </Link>
            )}
          />
        </DashCard>

        <DropZone
          onFiles={(files) => drop.accept(files, true)}
          busy={drop.busy}
          label={`Add production artwork for ${entity.name}`}
        >
          <DashCard
            title="Designs"
            to={entityLibraryHref(entity.id, { focus: "designs", shelf: "ready" })}
            empty="No production artwork yet. Drop a folder of exports here, or use Add files."
            count={artwork.length}
            action={<DropTrigger onFiles={(files) => drop.accept(files, true)} busy={drop.busy} />}
          >
          {/*
            Designs are judged by looking at them, so these tiles are the
            artwork and nothing else — no title, no status chip. The library is
            where the metadata lives.
          */}
            <TileGrid
              items={preview(artwork).shown}
              remaining={preview(artwork).remaining}
              to={lib("designs")}
              render={(d: Design) => <DesignTile key={d.id} design={d} to={lib("designs")} />}
            />
          </DashCard>
        </DropZone>

        {/*
          DESIGN CONCEPTS — inspiration. The same object as a design, minus a
          production file, which is exactly what makes it a reference rather
          than something you can print.
        */}
        <DropZone
          onFiles={(files) => drop.accept(files, false)}
          busy={drop.busy}
          label={`Add inspiration for ${entity.name}`}
        >
          <DashCard
            title="Design concepts"
            to={entityLibraryHref(entity.id, { focus: "designs", shelf: "concept" })}
            empty="No inspiration yet. Drag a folder of references onto this card, or use Add files."
            count={inspiration.length}
            action={<DropTrigger onFiles={(files) => drop.accept(files, false)} busy={drop.busy} />}
          >
            <TileGrid
              items={preview(inspiration).shown}
              remaining={preview(inspiration).remaining}
              to={lib("designs")}
              render={(d: Design) => <DesignTile key={d.id} design={d} to={lib("designs")} />}
            />
          </DashCard>
        </DropZone>

        <DashCard
          title="Products"
          to={lib("products")}
          empty="Nothing configured for sale yet. A product is a mockup given its commerce details."
          count={products.length}
        >
          <TileGrid
            items={preview(products).shown}
            remaining={preview(products).remaining}
            to={lib("products")}
            render={(p: Product) => (
              <Link key={p.id} to={productHref(p.id)} className="group min-w-0" title={p.title}>
                {/*
                  cover-source: product — url-first is correct here. A PRODUCT's
                  imageUrl is its own picture; bucket/path is only the fallback
                  copied from the concept it came from. That is the opposite of
                  a mockup, where the bucket holds the real composite.
                */}
                <AssetImage
                  url={p.imageUrl}
                  bucket={p.imageBucket}
                  path={p.imagePath}
                  alt={p.title}
                  className="aspect-square w-full rounded-xl border border-[hsl(var(--ax-border))] bg-white/[0.03] transition-colors group-hover:border-[hsl(var(--ax-accent))]"
                  fit="contain"
                  fallbackSeed={p.id}
                />
                <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="tabular-nums">{fmtMoney(p.price)}</span>
                  {/*
                    Live is a property of the product, not a separate shelf:
                    it means Shopify has it and it is published.
                  */}
                  {p.shopifyProductId && p.status === "published" ? (
                    <span className="text-[11px] font-medium text-[hsl(var(--ax-accent))]">Live</span>
                  ) : (
                    <span className="truncate text-[11px] text-[hsl(var(--ax-faint))]">{p.status}</span>
                  )}
                </div>
              </Link>
            )}
          />
        </DashCard>

        <DashCard
          title="Collections"
          to={lib("collections")}
          empty="No collections yet. A collection is how a drop is grouped."
          count={collections.length}
        >
          <TileGrid
            items={preview(collections).shown}
            remaining={preview(collections).remaining}
            to={lib("collections")}
            render={(c: Collection) => (
              <Link key={c.id} to={lib("collections")} className="group min-w-0" title={c.name}>
                <AssetImage
                  url={c.coverImageUrl}
                  alt={c.name}
                  className="aspect-square w-full rounded-xl border border-[hsl(var(--ax-border))] bg-white/[0.03] transition-colors group-hover:border-[hsl(var(--ax-accent))]"
                  fallbackSeed={c.id}
                />
                <div className="mt-1.5 truncate text-[12px] font-medium">{c.name}</div>
                <div className="truncate text-[11px] text-[hsl(var(--ax-faint))]">
                  {c.productCount} product{c.productCount === 1 ? "" : "s"}
                </div>
              </Link>
            )}
          />
        </DashCard>
      </div>

      {/* -------------------------------------------------------- the orders */}
      <RecentOrders
        entityId={entity.id}
        entityName={entity.name}
        query={ordersQ}
        cartUnits={cart.data?.units ?? 0}
      />
    </>
  );
}

/* --------------------------------------------------------------- the header */

function AthleteHeader({
  entity,
  cartUnits,
  menuOpen,
  onToggleMenu,
  onCreateMockup,
}: {
  entity: Entity & { counts: unknown };
  cartUnits: number;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCreateMockup: () => void;
}) {
  const parts = identityLine(entity);
  const since = sinceLabel(entity.createdAt);
  const isAthlete = entity.roles.includes("athlete");

  return (
    <div className="ax-card mb-6 overflow-hidden p-0" style={{ borderTop: "3px solid hsl(var(--sec, var(--ax-sec-clients)))" }}>
      <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
        <AssetImage
          url={entity.avatarUrl}
          alt={entity.name}
          className="h-[104px] w-[104px] shrink-0 rounded-xl"
          fallbackSeed={entity.id}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-[26px] font-semibold tracking-tight sm:text-[30px]">{entity.name}</h1>
            {entity.roles.length > 0 ? (
              entity.roles.map((r) => (
                <Chip key={r} tone="var(--ax-violet)">
                  {roleLabel(r)}
                </Chip>
              ))
            ) : (
              <Chip>{typeLabel(entity.entityType)}</Chip>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[hsl(var(--ax-secondary))]">
            {parts.map((part, i) => (
              <span key={part} className="flex items-center gap-2">
                {i > 0 && <span className="text-[hsl(var(--ax-faint))]">·</span>}
                {part}
              </span>
            ))}
            {parts.length > 0 && <span className="text-[hsl(var(--ax-faint))]">·</span>}
            <span
              className={
                entity.status === "active" ? "text-[hsl(var(--ax-accent))]" : "text-[hsl(var(--ax-faint))]"
              }
            >
              {entity.status === "active" ? "Active" : entity.status}
            </span>
          </div>

          {/*
            Provenance, quietly. `primary_contact` is null on every athlete in
            the database today, so the line renders only when it is actually
            set rather than inventing a "You".
          */}
          {(since || entity.primaryContact) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-[hsl(var(--ax-faint))]">
              {since && <span>AX since {since}</span>}
              {since && entity.primaryContact && <span>·</span>}
              {entity.primaryContact && <span>Primary contact: {entity.primaryContact}</span>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {cartUnits > 0 && (
            <Link
              to={entityCartHref(entity.id)}
              title="A draft order. Nothing has been submitted."
              className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-accent)/0.5)] px-3.5 py-2 text-[12px] font-semibold text-[hsl(var(--ax-accent))] hover:bg-[hsl(var(--ax-accent)/0.1)]"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Cart · {cartUnits}
            </Link>
          )}
          <V1Link
            to="/admin/designs/new"
            className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))]"
          >
            <Plus className="h-4 w-4" />
            Create Design
          </V1Link>
          <button
            type="button"
            onClick={onCreateMockup}
            className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))]"
          >
            <Plus className="h-4 w-4" />
            Create Mockup
          </button>
          {/*
            An order is assembled, not typed. "Create Order" opens this
            athlete's cart, which is where quantities are gathered and where
            submitting turns the draft into a real order.
          */}
          <Link
            to={entityCartHref(entity.id)}
            className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[13px] font-medium text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))]"
          >
            <Receipt className="h-3.5 w-3.5" />
            Create Order
          </Link>

          {/*
            Editing the client's record is an ADMIN action on AX's side and
            lives in V1's person editor. It is a different thing from looking
            at their portal, so it is a different, plainer button.
          */}
          <V1Link
            to={`/admin/athletes/${entity.id}`}
            title="Edit name, roles and organisation in the V1 person editor"
            className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[13px] font-medium text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))]"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit client
          </V1Link>

          <div className="relative">
            <button
              type="button"
              onClick={onToggleMenu}
              aria-label="More actions"
              aria-expanded={menuOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))]"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-1 shadow-xl">
                <MenuLink to={entityLibraryHref(entity.id)}>Open the full library</MenuLink>
                <MenuLink to={entityCartHref(entity.id)}>Cart &amp; draft order</MenuLink>
                {isAthlete && (
                  <a
                    href={`/a/${entity.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))] hover:bg-white/5 hover:text-[hsl(var(--ax-ink))]"
                  >
                    Fan profile <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                )}
                <MenuLink to={`/admin/athletes/${entity.id}`}>Open in V1</MenuLink>
              </div>
            )}
          </div>
        </div>
      </div>

      {/*
        VIEW PORTAL — the client's own portal, exactly as they see it.

        Same address and the same checks as always: /portal?as=<id> opens in a
        new tab, RequirePortal admits an admin, useCurrentAthlete honours `as`
        for admins only, and the database's portal_scope_athlete() decides what
        is readable. Portal writes refuse operators ("View as is read-only"), so
        this is a look, never an impersonated edit. It is the one control on
        the page that shows the client's side, so it gets its own row.
      */}
      <div className="flex flex-wrap items-center gap-3 border-t border-[hsl(var(--ax-line))] bg-[hsl(182_60%_96%)] px-4 py-3 sm:px-5">
        <a
          href={entityPortalHref(entity.id)}
          target="_blank"
          rel="noreferrer"
          title={`Open ${entity.name}'s portal exactly as they see it`}
          className="flex items-center gap-2 rounded-full bg-[hsl(var(--ax-sec-clients,182_88%_27%))] px-5 py-2.5 text-[14px] font-bold text-white shadow-sm transition-[filter] hover:brightness-110"
        >
          <Eye className="h-4 w-4" />
          View Portal
          <ArrowUpRight className="h-4 w-4" />
        </a>
        <p className="min-w-0 flex-1 text-[12px] text-[hsl(var(--ax-secondary))]">
          Opens {shortLabel(entity.name, entity.entityType)}’s portal in a new tab, <b className="font-semibold">read-only</b>{" "}
          — you see what they see and cannot change anything as them. Logins are managed in Client access below.
        </p>
      </div>
    </div>
  );
}

function DesignTile({ design, to }: { design: Design; to: string }) {
  return (
    <Link to={to} title={design.title} className="group min-w-0">
      <AssetImage
        bucket={design.fileBucket}
        path={design.filePath}
        alt={design.title}
        className="aspect-square w-full rounded-xl border border-[hsl(var(--ax-border))] bg-black/40 transition-colors group-hover:border-[hsl(var(--ax-accent))]"
        fit="contain"
        fallbackSeed={design.id}
      />
    </Link>
  );
}

function MenuLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="block px-3 py-2 text-[12px] text-[hsl(var(--ax-secondary))] hover:bg-white/5 hover:text-[hsl(var(--ax-ink))]"
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------ the dash cards */

function DashCard({
  title,
  to,
  count,
  empty,
  loading,
  error,
  what,
  action,
  children,
}: {
  title: string;
  to: string;
  count: number;
  empty: string;
  loading?: boolean;
  error?: unknown;
  what?: string;
  /** A visible control in the header, e.g. the file picker for a droppable card. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ax-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
        <Link
          to={to}
          className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[hsl(var(--ax-accent))] hover:underline"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} what={what ?? title.toLowerCase()} />
      ) : count === 0 ? (
        <p className="rounded-xl border border-dashed border-[hsl(var(--ax-border))] px-4 py-8 text-center text-[12px] text-[hsl(var(--ax-faint))]">
          {empty}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

/**
 * Three tiles and, when there is more, a fourth that says how much more.
 *
 * The counter is a link rather than a label: an operator who has just been told
 * there are thirty more will try to click it.
 */
function TileGrid<T>({
  items,
  remaining,
  to,
  render,
}: {
  items: T[];
  remaining: number;
  to: string;
  render: (item: T) => React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-4 gap-2.5">
      {items.map(render)}
      {remaining > 0 && (
        <Link
          to={to}
          className="flex aspect-square items-center justify-center self-start rounded-xl border border-[hsl(var(--ax-border))] bg-white/[0.02] text-[15px] font-semibold text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-ink))]"
        >
          +{remaining}
        </Link>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- the order table */

function RecentOrders({
  entityId,
  entityName,
  query,
  cartUnits,
}: {
  entityId: string;
  entityName: string;
  query: ReturnType<typeof useEntityOrders>;
  cartUnits: number;
}) {
  const orders = query.data?.orders ?? [];

  return (
    <section className="ax-card mt-6 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Recent Orders</h2>
          {/*
            Say which orders these are. The Shopify `orders` table cannot be
            attributed to an athlete who shares the AX organisation, so this
            list is bulk orders — the only stream that carries an athlete_id.
          */}
          <p className="mt-0.5 text-[11px] text-[hsl(var(--ax-faint))]">
            Bulk orders raised for {entityName}. Storefront sales are attributed in Commerce.
          </p>
        </div>
        <Link
          to="/admin-v2/orders"
          className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[hsl(var(--ax-accent))] hover:underline"
        >
          View all orders <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : query.isError ? (
        <ErrorState error={query.error} what="this athlete's orders" onRetry={() => void query.refetch()} />
      ) : orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[hsl(var(--ax-border))] px-4 py-8 text-center text-[12px] text-[hsl(var(--ax-faint))]">
          No orders yet.{" "}
          {cartUnits > 0 ? (
            <Link to={entityCartHref(entityId)} className="text-[hsl(var(--ax-accent))] hover:underline">
              There are {cartUnits} units in the cart waiting to be submitted.
            </Link>
          ) : (
            "Add quantities to a mockup and the cart becomes the first one."
          )}
        </p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[12px]">
            <thead>
              <tr className="text-left text-[11px] text-[hsl(var(--ax-faint))]">
                <th className="px-1 pb-2 font-medium">Order #</th>
                <th className="px-1 pb-2 font-medium">Status</th>
                <th className="px-1 pb-2 font-medium">Items</th>
                <th className="px-1 pb-2 font-medium">Total</th>
                <th className="px-1 pb-2 font-medium">Date</th>
                <th className="px-1 pb-2 font-medium">Payment</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <OrderRowCells key={o.id} order={o} entityId={entityId} entityName={entityName} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Phase 2: paid off-platform. Draft the invoice in AX's mail app from the real
 * order lines, then record where payment stands. The client sees the same
 * status in Brand HQ.
 */
function PaymentCell({ order, entityId, entityName }: { order: EntityOrder; entityId: string; entityName: string }) {
  const setStatus = useSetPaymentStatus(entityId);
  const [busy, setBusy] = useState(false);
  const status = (order.paymentStatus in PAYMENT_LABEL ? order.paymentStatus : "unpaid") as PaymentStatus;
  const covered = order.amountDue != null && order.amountDue <= 0.01;
  const mark = (next: PaymentStatus) =>
    setStatus.mutate({ orderId: order.id, status: next }, {
      onSuccess: () => toast.success(`#${order.orderNumber ?? ""} · ${PAYMENT_LABEL[next]}`),
      onError: (e) => toast.error(e.message),
    });
  async function emailInvoice() {
    setBusy(true);
    try {
      const { to, input } = await fetchInvoice(order.id, entityId, entityName);
      window.location.href = mailtoHref(to, invoiceEmail(input));
      if (status === "unpaid") mark("invoiced");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the invoice.");
    } finally {
      setBusy(false);
    }
  }
  const tone = status === "paid" || status === "waived" || covered ? "--ax-accent" : status === "invoiced" ? "--ax-amber" : "--ax-faint";
  const pill = "rounded-full border border-[hsl(var(--ax-border))] px-2 py-0.5 text-[10.5px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] disabled:opacity-50";
  return (
    <td className="px-1 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium" style={{ color: toneText(`var(${tone})`) }}>
          {covered && status === "unpaid" ? "Covered by credit" : PAYMENT_LABEL[status]}
        </span>
        {!covered && status !== "paid" && status !== "waived" && (
          <button type="button" className={pill} onClick={() => void emailInvoice()} disabled={busy}>
            {status === "invoiced" ? "Resend" : "Email invoice"}
          </button>
        )}
        {status !== "paid" && !covered && (
          <button type="button" className={pill} onClick={() => mark("paid")} disabled={setStatus.isPending}>
            Mark paid
          </button>
        )}
        {status === "paid" && (
          <button type="button" className={pill} onClick={() => mark("unpaid")} disabled={setStatus.isPending} title="Undo">
            Undo
          </button>
        )}
      </div>
    </td>
  );
}

function OrderRowCells({ order, entityId, entityName }: { order: EntityOrder; entityId: string; entityName: string }) {
  const label = STATUS_LABEL[order.status as BulkOrderStatus] ?? order.status;
  const tone = orderTone(order.status);

  return (
    <tr className="border-t border-[hsl(var(--ax-line))] transition-colors hover:bg-white/[0.03]">
      <td className="px-1 py-2.5">
        <V1Link to={`/admin/orders/${order.id}`} className="font-medium hover:text-[hsl(var(--ax-accent))]">
          #{order.orderNumber ?? order.id.slice(0, 8)}
        </V1Link>
      </td>
      <td className="px-1 py-2.5">
        <span
          className="inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-medium"
          style={{
            color: toneText(`var(${tone})`),
            borderColor: `hsl(var(${tone}) / 0.35)`,
            background: `hsl(var(${tone}) / 0.12)`,
          }}
        >
          {label}
        </span>
      </td>
      <td className="px-1 py-2.5 tabular-nums text-[hsl(var(--ax-secondary))]">
        {order.units} item{order.units === 1 ? "" : "s"}
      </td>
      {/*
        An em dash, not $0.00. Orders raised before the cart existed never had
        a subtotal written, and a confident zero is worse than an admission.
      */}
      <td className="px-1 py-2.5 tabular-nums text-[hsl(var(--ax-secondary))]">
        {order.total == null ? <span className="text-[hsl(var(--ax-faint))]">—</span> : fmtMoney(order.total)}
      </td>
      <td className="px-1 py-2.5 text-[hsl(var(--ax-faint))]">
        {order.createdAt ? new Date(order.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
      </td>
      <PaymentCell order={order} entityId={entityId} entityName={entityName} />
      <td className="px-1 py-2.5 text-right">
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-[hsl(var(--ax-faint))]" />
      </td>
    </tr>
  );
}

function StatIcon({ name }: { name: string }) {
  const cls = "h-4 w-4";
  if (name === "designs") return <Palette className={cls} />;
  if (name === "mockups") return <Layers className={cls} />;
  if (name === "products") return <ShoppingBag className={cls} />;
  if (name === "collections") return <Sparkles className={cls} />;
  if (name === "live") return <Store className={cls} />;
  return <Receipt className={cls} />;
}
