import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Camera, DollarSign, Package, Search, ShoppingBag } from "lucide-react";
import { useBlanks, useCollections, useConcepts, useProducts } from "@/lib/v2/data";
import { AUDIENCES, fmtMoney, hasAccess, priceFor } from "@/lib/v2/pricing";
import { auditColorways, colorwayIssues, photoCoverage } from "@/lib/v2/blank-image";
import {
  blankHref,
  catalogHref,
  catalogTitle,
  type AccessFilter,
  type CatalogTab,
} from "@/lib/v2/catalog-nav";
import type { AudienceKey, Blank, Product } from "@/lib/v2/types";
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
} from "@/components/admin-v2/primitives";

// Commerce = what AX sells, what it is built on, and how it is grouped.
//
// One Blank Catalog, not three. Photography, pricing and availability are
// ATTRIBUTES of the same Blank record — the V1 split into separate photo /
// pricing / catalog areas is exactly what this replaces (§18).
//
// EVERY FILTER ON THIS PAGE LIVES IN THE URL. It used to live in useState,
// which meant walking into a blank and pressing back dropped you on a reset
// grid. The shelf you were standing on is part of where you were.

const TABS = ["overview", "blanks", "products", "collections"] as const;

const TAB_LABEL: Record<CatalogTab, string> = {
  overview: "Overview",
  blanks: "Blank catalog",
  products: "Products",
  collections: "Collections",
};

export default function V2Commerce() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  // /admin-v2/commerce/blanks is a real address that predates the Overview tab
  // and is still linked from Action Required. It means the blanks shelf.
  const fallback: CatalogTab = location.pathname.endsWith("/blanks") ? "blanks" : "overview";
  const tab = (TABS.find((t) => t === params.get("tab")) ?? fallback) as CatalogTab;

  const goTab = (next: CatalogTab) =>
    setParams(new URLSearchParams(catalogHref({ tab: next }).split("?")[1] ?? ""), { replace: true });

  return (
    <>
      <PageHeader title="Commerce" subtitle="What AX sells, what it is built on, and how it is grouped." />

      <TabBar tabs={TABS} active={tab} onSelect={goTab} label={(t) => TAB_LABEL[t]} />

      {tab === "overview" && <CommerceOverview />}
      {tab === "blanks" && <BlankCatalog />}
      {tab === "products" && <ProductGrid />}
      {tab === "collections" && <CollectionGrid />}
    </>
  );
}

/* ------------------------------------------------------------- overview */

/**
 * What is wrong with the catalog, and what has moved lately.
 *
 * Not a sales dashboard — orders answer that question and have their own page.
 * This is the maintenance view: an operator opens it to find the blanks that
 * cannot be quoted, the garments nobody has photographed, and the products
 * sitting one field short of being sellable.
 */
function CommerceOverview() {
  const blanksQ = useBlanks();
  const productsQ = useProducts();
  const conceptsQ = useConcepts();
  const loading = blanksQ.isLoading || productsQ.isLoading;

  // Memoised so the `?? []` does not hand every dependent useMemo a new array
  // on each render.
  const blanks = useMemo(() => blanksQ.data ?? [], [blanksQ.data]);
  const products = useMemo(() => productsQ.data ?? [], [productsQ.data]);

  const stats = useMemo(() => {
    let colourways = 0;
    let photographed = 0;
    let flagged = 0;
    for (const b of blanks) {
      const coverage = photoCoverage(b);
      colourways += coverage.total;
      photographed += coverage.withPhoto;
      flagged += auditColorways(b).length;
    }
    const live = products.filter((p) => p.shopifyProductId && p.status === "published");
    return {
      colourways,
      photographed,
      flagged,
      noPhoto: blanks.filter((b) => b.missingPhoto).length,
      noCost: blanks.filter((b) => b.missingCost).length,
      noPrice: products.filter((p) => p.price == null && p.status !== "archived").length,
      readyForShopify: products.filter(
        (p) => p.approvalState === "approved" && !p.shopifyProductId && p.status !== "archived",
      ).length,
      live: live.length,
    };
  }, [blanks, products]);

  /**
   * Blanks the creative work is actually landing on.
   *
   * The catalog sorts alphabetically, which tells you nothing about what is in
   * use. Mockups do: the garments being built on this month are the ones whose
   * photography and pricing gaps matter first.
   */
  const recentlyUsed = useMemo(() => {
    const byId = new Map(blanks.map((b) => [b.id, b]));
    const seen: Blank[] = [];
    for (const c of conceptsQ.data ?? []) {
      if (!c.blankId) continue;
      const blank = byId.get(c.blankId);
      if (!blank || seen.some((b) => b.id === blank.id)) continue;
      seen.push(blank);
      if (seen.length === 6) break;
    }
    return seen;
  }, [conceptsQ.data, blanks]);

  const recentProducts = products.slice(0, 6);

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Blanks" value={blanks.length} loading={loading} icon={<Package />} href={catalogHref({ tab: "blanks" })} />
        <Metric
          label="Colourways shot"
          value={loading ? "—" : `${stats.photographed}/${stats.colourways}`}
          loading={loading}
          icon={<Camera />}
          href={catalogHref({ tab: "blanks", filter: "missing_photo" })}
        />
        <Metric label="Products" value={products.length} loading={loading} icon={<ShoppingBag />} href={catalogHref({ tab: "products" })} />
        <Metric
          label="Live on Shopify"
          value={stats.live}
          loading={loading}
          icon={<DollarSign />}
          href={catalogHref({ tab: "products", filter: "live" })}
        />
      </section>

      <section>
        <Heading
          eyebrow="Maintenance"
          title="Needs attention"
          detail="Gaps that stop a blank being quoted or a product being sold."
        />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <ActionCard
            count={stats.noPhoto}
            title="Blanks with no photo"
            detail="Nothing to show a client, and nothing to build a mockup on."
            href={catalogHref({ tab: "blanks", filter: "missing_photo" })}
          />
          <ActionCard
            count={stats.noCost}
            title="Blanks with no cost"
            detail="Margin cannot be computed until cost is known."
            href={catalogHref({ tab: "blanks", filter: "missing_cost" })}
          />
          <ActionCard
            count={stats.flagged}
            title="Colourways to check"
            detail="Missing a side, or front and back from different systems."
            href={catalogHref({ tab: "blanks", filter: "photo_issues" })}
          />
          <ActionCard
            count={stats.readyForShopify}
            title="Approved, never pushed"
            detail="Signed off but not yet in the store."
            href={catalogHref({ tab: "products", filter: "ready_for_shopify" })}
          />
        </div>
        {stats.noPrice > 0 && (
          <p className="mt-3 text-[11px] text-[hsl(var(--ax-faint))]">
            {stats.noPrice} {stats.noPrice === 1 ? "product has" : "products have"} no price recorded.{" "}
            <Link to={catalogHref({ tab: "products", filter: "no_price" })} className="text-[hsl(var(--ax-accent))]">
              Show them
            </Link>
            .
          </p>
        )}
      </section>

      <section>
        <Heading
          eyebrow="In use"
          title="Blanks the work is landing on"
          detail="Ordered by the mockups being built, not alphabetically."
        />
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[190px]" />
            ))}
          </div>
        ) : recentlyUsed.length === 0 ? (
          <EmptyState>No mockups reference a blank in the V2 catalog yet.</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recentlyUsed.map((b) => {
              const coverage = photoCoverage(b);
              return (
                <Link key={b.id} to={blankHref(b.id)} className="ax-card ax-card-hover overflow-hidden p-0 transition-all">
                  <AssetImage
                    url={b.imageUrl}
                    alt={catalogTitle(b)}
                    className="aspect-square w-full bg-white/[0.03]"
                    fit="contain"
                  />
                  <div className="p-2.5">
                    <div className="truncate text-[12px] font-medium">{catalogTitle(b)}</div>
                    <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
                      {coverage.total > 0 ? `${coverage.withPhoto}/${coverage.total} shot` : "no colourways"}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <Heading eyebrow="Newest" title="Recent products" detail="The last six configured for sale." />
        {loading ? (
          <Skeleton className="h-40" />
        ) : recentProducts.length === 0 ? (
          <EmptyState>No products yet.</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {recentProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------- blank catalog */

function BlankCatalog() {
  const { data, isLoading, isError, error, refetch } = useBlanks();
  const [params, setParams] = useSearchParams();

  const audience = (AUDIENCES.find((a) => a.key === params.get("audience"))?.key ?? "athlete") as AudienceKey;
  // What the audience switch means for the LIST, not just for the price shown.
  // "in" is this audience's actual catalog; "out" is everything else AX stocks,
  // which is the list you shop from when deciding what to give them next.
  const access = ((["in", "out", "all"] as const).find((a) => a === params.get("access")) ?? "in") as AccessFilter;
  const search = params.get("q") ?? "";
  const dataFilter = params.get("filter");

  /** One writer for the whole toolbar, so no control can forget the others. */
  const patch = (changes: Partial<{ audience: string; access: AccessFilter; filter: string | null; q: string }>) => {
    setParams(
      new URLSearchParams(
        catalogHref({
          tab: "blanks",
          audience: changes.audience ?? audience,
          access: changes.access ?? access,
          filter: changes.filter === undefined ? dataFilter : changes.filter,
          q: changes.q === undefined ? search : changes.q,
        }).split("?")[1] ?? "",
      ),
      { replace: true },
    );
  };

  const rows = useMemo(() => {
    let out = data ?? [];
    if (access === "in") out = out.filter((b) => hasAccess(b, audience));
    if (access === "out") out = out.filter((b) => !hasAccess(b, audience));
    if (dataFilter === "missing_cost") out = out.filter((b) => b.missingCost);
    if (dataFilter === "missing_assortment") out = out.filter((b) => b.missingAssortment);
    if (dataFilter === "missing_photo") out = out.filter((b) => b.missingPhoto);
    if (dataFilter === "photo_issues") out = out.filter((b) => auditColorways(b).length > 0);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((b) =>
        [b.name, b.displayName, b.brand, b.styleNumber, b.sku, b.garmentType]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return [...out].sort((a, b) => catalogTitle(a).localeCompare(catalogTitle(b)));
  }, [data, search, dataFilter, access, audience]);

  const all = data ?? [];
  const inCatalog = all.filter((b) => hasAccess(b, audience)).length;
  const outOfCatalog = all.length - inCatalog;
  const missingCost = all.filter((b) => b.missingCost).length;
  const missingAssort = all.filter((b) => b.missingAssortment).length;
  const missingPhoto = all.filter((b) => b.missingPhoto).length;
  const withIssues = all.filter((b) => auditColorways(b).length > 0).length;

  return (
    <>
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
          <input
            value={search}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Search blanks by name, brand, style or SKU…"
            className="w-full rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-2.5 pl-10 pr-4 text-[14px] outline-none placeholder:text-[hsl(var(--ax-faint))] focus:border-[hsl(var(--ax-accent))]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">Audience</span>
          {AUDIENCES.map((a) => (
            <Chip key={a.key} active={audience === a.key} onClick={() => patch({ audience: a.key })}>
              {a.label}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-[hsl(var(--ax-border))]" />
          <Chip active={access === "in"} onClick={() => patch({ access: "in" })}>
            In this catalog {inCatalog}
          </Chip>
          <Chip active={access === "out"} onClick={() => patch({ access: "out" })}>
            Not yet {outOfCatalog}
          </Chip>
          <Chip active={access === "all"} onClick={() => patch({ access: "all" })}>
            Every blank {all.length}
          </Chip>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">Gaps</span>
          <Chip active={!dataFilter} onClick={() => patch({ filter: null })}>
            None {all.length}
          </Chip>
          {missingCost > 0 && (
            <Chip active={dataFilter === "missing_cost"} onClick={() => patch({ filter: "missing_cost" })}>
              No cost {missingCost}
            </Chip>
          )}
          {missingPhoto > 0 && (
            <Chip active={dataFilter === "missing_photo"} onClick={() => patch({ filter: "missing_photo" })}>
              No photo {missingPhoto}
            </Chip>
          )}
          {withIssues > 0 && (
            <Chip active={dataFilter === "photo_issues"} onClick={() => patch({ filter: "photo_issues" })}>
              Colourways to check {withIssues}
            </Chip>
          )}
          {missingAssort > 0 && (
            <Chip active={dataFilter === "missing_assortment"} onClick={() => patch({ filter: "missing_assortment" })}>
              No assortment {missingAssort}
            </Chip>
          )}
          <span className="ml-auto text-[11px] tabular-nums text-[hsl(var(--ax-faint))]">{rows.length} shown</span>
        </div>
        {/*
          Say what is actually true right now rather than describing a feature
          that is not wired. In V2 the Drive is the curation — 03_APPROVED holds
          exactly what AX sells — so every blank is in every audience. Pricing
          comes from Shopify, which is not connected.
        */}
        <p className="text-[11px] text-[hsl(var(--ax-faint))]">
          Access and price are separate questions. Every blank in the V2 catalog is available to every audience —
          curation happens in the Drive, so nothing is dimmed yet. Pricing comes from Shopify, which is not connected,
          so prices read “—”. Click a garment, or any single colour, to open it.
        </p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-[260px]" />
          ))}
        </div>
      )}

      {isError && <ErrorState error={error} what="the blank catalog" onRetry={() => void refetch()} />}
      {!isLoading && !isError && rows.length === 0 && <EmptyState>No blank matches that filter.</EmptyState>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((b) => (
          <BlankCard key={b.id} blank={b} audience={audience} />
        ))}
      </div>
    </>
  );
}

/**
 * A blank, and every colour it comes in, each one its own destination.
 *
 * Structured as a plain container holding sibling links rather than one big
 * clickable card, because the colour swatches have to be links in their own
 * right — a link inside a link is invalid HTML and a button inside a button
 * does not fire. That constraint is also the better interaction: the swatch row
 * stopped being decoration the moment it became the fastest way to open the
 * exact garment you have in mind.
 */
function BlankCard({ blank, audience }: { blank: Blank; audience: AudienceKey }) {
  const eligible = hasAccess(blank, audience);
  const coverage = photoCoverage(blank);
  const flagged = blank.colors.filter((c) => c.available && colorwayIssues(c).length > 0).length;
  const shown = blank.colors.slice(0, 7);

  return (
    <div className={`ax-card ax-card-hover overflow-hidden p-0 transition-all ${eligible ? "" : "opacity-45"}`}>
      <Link to={blankHref(blank.id)} className="block" title={`Open ${catalogTitle(blank)}`}>
        <AssetImage
          url={blank.imageUrl}
          alt={catalogTitle(blank)}
          className="aspect-square w-full bg-white/[0.03]"
          fit="contain"
        />
        <div className="px-2.5 pt-2.5">
          <div className="truncate text-[12px] font-medium">{catalogTitle(blank)}</div>
          <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
            {[blank.brand, blank.styleNumber].filter(Boolean).join(" · ") || "No brand recorded"}
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className="font-medium tabular-nums text-[hsl(var(--ax-accent))]">
              {fmtMoney(priceFor(blank, audience))}
            </span>
            <span className="tabular-nums text-[hsl(var(--ax-faint))]">
              {blank.cost != null ? `cost ${fmtMoney(blank.cost)}` : "no cost"}
            </span>
          </div>
        </div>
      </Link>

      <div className="flex flex-wrap items-center gap-1 px-2.5 pt-2">
        {shown.map((c) => (
          <Link
            key={c.id}
            to={blankHref(blank.id, c.name)}
            title={c.name}
            aria-label={`${catalogTitle(blank)} in ${c.name}`}
            className="h-3.5 w-3.5 rounded-full border border-white/20 transition-transform hover:scale-125 hover:border-white/60"
            style={{ background: c.hex ?? "#555" }}
          />
        ))}
        {blank.colors.length > shown.length && (
          <Link
            to={blankHref(blank.id)}
            className="text-[10px] text-[hsl(var(--ax-faint))] transition-colors hover:text-[hsl(var(--ax-ink))]"
          >
            +{blank.colors.length - shown.length}
          </Link>
        )}
        {blank.colors.length === 0 && <span className="text-[10px] text-[hsl(var(--ax-faint))]">no colours</span>}
      </div>

      <Link to={blankHref(blank.id)} className="block px-2.5 pb-2.5 pt-1.5">
        <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
          {coverage.total > 0 ? `${coverage.withPhoto}/${coverage.total} photographed` : "no colourways synced"}
          {flagged > 0 && <span className="text-[hsl(var(--ax-amber))]"> · {flagged} to check</span>}
        </div>
        {!eligible && <div className="mt-1 text-[10px] text-[hsl(var(--ax-red))]">not in this catalog</div>}
      </Link>
    </div>
  );
}

/* --------------------------------------------------------------- products */

const PRODUCT_FILTERS = [
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "ready_for_shopify", label: "Approved, not pushed" },
  { key: "no_price", label: "No price" },
  { key: "draft", label: "Draft" },
] as const;

function ProductGrid() {
  const { data, isLoading, isError, error, refetch } = useProducts();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") ?? "all";
  const search = params.get("q") ?? "";

  const patch = (changes: { filter?: string; q?: string }) => {
    setParams(
      new URLSearchParams(
        catalogHref({
          tab: "products",
          filter: (changes.filter ?? filter) === "all" ? null : (changes.filter ?? filter),
          q: changes.q ?? search,
        }).split("?")[1] ?? "",
      ),
      { replace: true },
    );
  };

  const all = useMemo(() => data ?? [], [data]);
  const counts = useMemo(
    () => ({
      all: all.length,
      live: all.filter((p) => p.shopifyProductId && p.status === "published").length,
      ready_for_shopify: all.filter(
        (p) => p.approvalState === "approved" && !p.shopifyProductId && p.status !== "archived",
      ).length,
      no_price: all.filter((p) => p.price == null && p.status !== "archived").length,
      draft: all.filter((p) => p.status === "draft").length,
    }),
    [all],
  );

  const rows = useMemo(() => {
    let out = all;
    if (filter === "live") out = out.filter((p) => p.shopifyProductId && p.status === "published");
    if (filter === "ready_for_shopify")
      out = out.filter((p) => p.approvalState === "approved" && !p.shopifyProductId && p.status !== "archived");
    if (filter === "no_price") out = out.filter((p) => p.price == null && p.status !== "archived");
    if (filter === "draft") out = out.filter((p) => p.status === "draft");
    const q = search.trim().toLowerCase();
    if (q) out = out.filter((p) => [p.title, p.sku].filter(Boolean).join(" ").toLowerCase().includes(q));
    return out;
  }, [all, filter, search]);

  return (
    <>
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
          <input
            value={search}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Search products by title or SKU…"
            className="w-full rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-2.5 pl-10 pr-4 text-[14px] outline-none placeholder:text-[hsl(var(--ax-faint))] focus:border-[hsl(var(--ax-accent))]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRODUCT_FILTERS.map((f) => (
            <Chip key={f.key} active={filter === f.key} onClick={() => patch({ filter: f.key })}>
              {f.label} {counts[f.key]}
            </Chip>
          ))}
          <span className="ml-auto text-[11px] tabular-nums text-[hsl(var(--ax-faint))]">{rows.length} shown</span>
        </div>
      </div>

      {isError && <ErrorState error={error} what="your products" onRetry={() => void refetch()} />}
      {isLoading && <Skeleton className="h-64" />}
      {!isLoading && !isError && rows.length === 0 && <EmptyState>No products match.</EmptyState>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {rows.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </>
  );
}

function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/admin/products/${product.id}`} className="ax-card ax-card-hover overflow-hidden transition-all">
      <AssetImage
        url={product.imageUrl}
        alt={product.title}
        className="aspect-square w-full bg-white/[0.03]"
        fit="contain"
      />
      <div className="p-2.5">
        <div className="truncate text-[12px] font-medium">{product.title}</div>
        <div className="mt-1 flex items-center justify-between text-[11px]">
          <span
            className={`tabular-nums ${product.price == null ? "text-[hsl(var(--ax-amber))]" : "text-[hsl(var(--ax-secondary))]"}`}
          >
            {product.price == null ? "no price" : fmtMoney(product.price)}
          </span>
          {product.shopifyProductId ? <Chip tone="var(--ax-accent)">Live</Chip> : <Chip>{product.status}</Chip>}
        </div>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------ collections */

function CollectionGrid() {
  const { data, isLoading, isError, error, refetch } = useCollections();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = data ?? [];
    return q ? all.filter((c) => `${c.name} ${c.collectionType}`.toLowerCase().includes(q)) : all;
  }, [data, search]);

  return (
    <>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
        <input
          value={search}
          onChange={(e) =>
            setParams(
              new URLSearchParams(catalogHref({ tab: "collections", q: e.target.value }).split("?")[1] ?? ""),
              { replace: true },
            )
          }
          placeholder="Search collections…"
          className="w-full rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-2.5 pl-10 pr-4 text-[14px] outline-none placeholder:text-[hsl(var(--ax-faint))] focus:border-[hsl(var(--ax-accent))]"
        />
      </div>

      {isError && <ErrorState error={error} what="your collections" onRetry={() => void refetch()} />}
      {isLoading && <Skeleton className="h-64" />}
      {!isLoading && !isError && rows.length === 0 && (
        <EmptyState>
          {search.trim()
            ? "No collection matches that search."
            : "No collections yet. A collection is a permanent home for creative work — it does not need Shopify products to exist."}
        </EmptyState>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((c) => (
          <Link key={c.id} to={`/admin/collections/${c.id}`} className="ax-card ax-card-hover p-4 transition-all">
            <div className="text-[14px] font-medium">{c.name}</div>
            <div className="mt-0.5 text-[11px] capitalize text-[hsl(var(--ax-faint))]">
              {c.collectionType} · {c.status}
            </div>
            <div className="mt-3 flex gap-3 text-[11px] tabular-nums text-[hsl(var(--ax-secondary))]">
              <span>{c.designCount} designs</span>
              <span>{c.conceptCount} mockups</span>
              <span>{c.productCount} products</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
