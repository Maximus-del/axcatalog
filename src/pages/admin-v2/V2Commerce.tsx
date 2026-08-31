import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useBlanks, useCollections, useProducts } from "@/lib/v2/data";
import { AUDIENCES, fmtMoney, hasAccess, priceFor } from "@/lib/v2/pricing";
import { colorwayIssues, photoCoverage } from "@/lib/v2/blank-image";
import {
  blankHref,
  catalogHref,
  catalogTitle,
  type AccessFilter,
  type CatalogTab,
} from "@/lib/v2/catalog-nav";
import type { AudienceKey, Blank } from "@/lib/v2/types";
import { AssetImage, Chip, EmptyState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";

// Commerce = Products, Collections, Blanks.
//
// One Blank Catalog, not three. Photography, pricing and availability are
// ATTRIBUTES of the same Blank record — the V1 split into separate photo /
// pricing / catalog areas is exactly what this replaces (§18).
//
// EVERY FILTER ON THIS PAGE LIVES IN THE URL. It used to live in useState,
// which meant walking into a blank and pressing back dropped you on a reset
// grid. The shelf you were standing on is part of where you were.

const TABS = ["blanks", "products", "collections"] as const;

export default function V2Commerce() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t === params.get("tab")) ?? "blanks") as CatalogTab;

  return (
    <>
      <PageHeader title="Commerce" subtitle="What AX sells, what it is built on, and how it is grouped." />
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <Chip
            key={t}
            active={tab === t}
            onClick={() => setParams(new URLSearchParams(catalogHref({ tab: t }).split("?")[1] ?? ""), { replace: true })}
          >
            {t === "blanks" ? "Blank catalog" : t === "products" ? "Products" : "Collections"}
          </Chip>
        ))}
      </div>

      {tab === "blanks" && <BlankCatalog />}
      {tab === "products" && <ProductGrid />}
      {tab === "collections" && <CollectionGrid />}
    </>
  );
}

/* ---------------------------------------------------------- blank catalog */

function BlankCatalog() {
  const { data, isLoading } = useBlanks();
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

  const inCatalog = (data ?? []).filter((b) => hasAccess(b, audience)).length;
  const outOfCatalog = (data ?? []).length - inCatalog;
  const missingCost = (data ?? []).filter((b) => b.missingCost).length;
  const missingAssort = (data ?? []).filter((b) => b.missingAssortment).length;
  const missingPhoto = (data ?? []).filter((b) => b.missingPhoto).length;

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
            Every blank {data?.length ?? 0}
          </Chip>
          <span className="mx-1 h-4 w-px bg-[hsl(var(--ax-border))]" />
          <Chip active={!dataFilter} onClick={() => patch({ filter: null })}>
            All {data?.length ?? 0}
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
          {missingAssort > 0 && (
            <Chip active={dataFilter === "missing_assortment"} onClick={() => patch({ filter: "missing_assortment" })}>
              No assortment {missingAssort}
            </Chip>
          )}
        </div>
        {/*
          Say what is actually true right now rather than describing a feature
          that is not wired. In V2 the Drive is the curation — 03_APPROVED holds
          exactly what AX sells — so every blank is in every audience and the
          access filter has nothing to separate. Pricing comes from Shopify,
          which is not connected.
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

      {!isLoading && rows.length === 0 && <EmptyState>No blank matches that filter.</EmptyState>}

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
        <AssetImage url={blank.imageUrl} alt={catalogTitle(blank)} className="aspect-square w-full bg-white/[0.03]" fit="contain" />
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

function ProductGrid() {
  const { data, isLoading } = useProducts();
  const [params] = useSearchParams();
  const filter = params.get("filter");

  const rows = useMemo(() => {
    let out = data ?? [];
    if (filter === "ready_for_shopify") {
      out = out.filter((p) => p.approvalState === "approved" && !p.shopifyProductId && p.status !== "archived");
    }
    return out;
  }, [data, filter]);

  if (isLoading) return <Skeleton className="h-64" />;
  if (rows.length === 0) return <EmptyState>No products match.</EmptyState>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {rows.map((p) => (
        <Link key={p.id} to={`/admin/products/${p.id}`} className="ax-card ax-card-hover overflow-hidden transition-all">
          <AssetImage url={p.imageUrl} alt={p.title} className="aspect-square w-full bg-white/[0.03]" fit="contain" />
          <div className="p-2.5">
            <div className="truncate text-[12px] font-medium">{p.title}</div>
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="tabular-nums text-[hsl(var(--ax-secondary))]">{fmtMoney(p.price)}</span>
              {p.shopifyProductId ? <Chip tone="var(--ax-accent)">Live</Chip> : <Chip>{p.status}</Chip>}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ collections */

function CollectionGrid() {
  const { data, isLoading } = useCollections();
  if (isLoading) return <Skeleton className="h-64" />;
  if ((data ?? []).length === 0) return <EmptyState>No collections yet.</EmptyState>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {(data ?? []).map((c) => (
        <Link key={c.id} to={`/admin/collections/${c.id}`} className="ax-card ax-card-hover p-4 transition-all">
          <div className="text-[14px] font-medium">{c.name}</div>
          <div className="mt-0.5 text-[11px] capitalize text-[hsl(var(--ax-faint))]">
            {c.collectionType} · {c.status}
          </div>
          <div className="mt-3 flex gap-3 text-[11px] tabular-nums text-[hsl(var(--ax-secondary))]">
            <span>{c.designCount} designs</span>
            <span>{c.conceptCount} concepts</span>
            <span>{c.productCount} products</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
