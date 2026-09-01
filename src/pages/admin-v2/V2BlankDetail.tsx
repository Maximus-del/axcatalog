import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowUpRight, FolderOpen, ImageOff } from "lucide-react";
import { useBlanks, useConcepts } from "@/lib/v2/data";
import { mockupCover } from "@/lib/v2/mockup-image";
import { entityLibraryHref } from "@/lib/v2/entity-nav";
import { AUDIENCES, fmtMoney, fmtPct, marginFor, priceFor } from "@/lib/v2/pricing";
import {
  ISSUE_LABEL,
  backCoverage,
  colorwayIssues,
  imageSourceOf,
  photoCoverage,
} from "@/lib/v2/blank-image";
import {
  blankHref,
  catalogHref,
  catalogTitle,
  defaultColorway,
  resolveColorway,
  sourcingName,
} from "@/lib/v2/catalog-nav";
import type { Blank, BlankColor } from "@/lib/v2/types";
import { AssetImage, Chip, EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";

// ONE BLANK, AT ONE COLOURWAY, AT A REAL ADDRESS.
//
// This replaces the catalog's side drawer. The drawer was fine to look at and
// impossible to refer to: no URL, no back button, gone on refresh. Everything a
// blank is — its photography, its colour range, what has been built on it — is
// a thing an operator needs to point at, so it lives at
// /admin-v2/commerce/blanks/:id?color=…
//
// Nothing here fetches on its own. useBlanks() is the same cached catalog query
// the grid uses, so arriving from a card is instant and arriving from a pasted
// link costs exactly one round trip.

export default function V2BlankDetail() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError, error, refetch } = useBlanks();

  const blank = useMemo(() => (data ?? []).find((b) => b.id === id) ?? null, [data, id]);

  const requested = resolveColorway(blank, params.get("color"));
  const selected = requested ?? defaultColorway(blank);
  const surface: "front" | "back" = params.get("surface") === "back" ? "back" : "front";

  const select = (color: BlankColor | null, nextSurface: "front" | "back" = surface) => {
    const next = new URLSearchParams(params);
    if (color) next.set("color", color.name);
    else next.delete("color");
    if (nextSurface === "back") next.set("surface", "back");
    else next.delete("surface");
    setParams(next);
  };

  if (isLoading) {
    return (
      <>
        <Skeleton className="mb-6 h-16 w-2/3" />
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-[420px]" />
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <PageHeader title="Blank catalog" />
        <ErrorState error={error} what="the blank catalog" onRetry={() => void refetch()} />
      </>
    );
  }

  if (!blank) {
    return (
      <>
        <PageHeader title="Blank not found" subtitle="It may have been removed from the Drive since this link was made." />
        <EmptyState>
          <Link to={catalogHref({ tab: "blanks" })} className="text-[hsl(var(--ax-accent))]">
            Back to the blank catalog
          </Link>
        </EmptyState>
      </>
    );
  }

  const sourcing = sourcingName(blank);
  const coverage = photoCoverage(blank);
  const backs = backCoverage(blank);

  return (
    <>
      <Link
        to={catalogHref({ tab: "blanks" })}
        className="mb-3 inline-block text-[11px] text-[hsl(var(--ax-faint))] transition-colors hover:text-[hsl(var(--ax-ink))]"
      >
        ← Blank catalog
      </Link>

      <PageHeader
        title={catalogTitle(blank)}
        subtitle={
          <>
            {[blank.brand, blank.styleNumber].filter(Boolean).join(" · ") || "No supplier recorded"}
            {sourcing && (
              <span className="text-[hsl(var(--ax-faint))]"> · manufacturer name “{sourcing}”</span>
            )}
          </>
        }
        actions={
          <>
            {blank.driveFolderUrl && (
              <a
                href={blank.driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))]"
              >
                <FolderOpen className="h-3.5 w-3.5" /> Drive folder
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )}
            <Chip tone={blank.shopifyProductId ? "var(--ax-accent)" : undefined}>
              {blank.shopifyProductId ? "Matched to Shopify" : "Not in Shopify"}
            </Chip>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Surfaces blank={blank} color={selected} surface={surface} onSurface={(s) => select(selected, s)} />
        <Facts blank={blank} color={selected} coverage={coverage} backs={backs} />
      </div>

      <Colourways blank={blank} selected={selected} pinned={Boolean(requested)} onClear={() => select(null)} />

      <Audit blank={blank} selected={selected} />

      <BuiltOnThis blank={blank} selected={selected} />
    </>
  );
}

/* --------------------------------------------------------------- surfaces */

/**
 * Front and back, adjacent, at a size you can actually judge.
 *
 * Side by side rather than one-at-a-time because the failure this catches — a
 * front and a back that are not the same garment — is invisible when you have
 * to click between them. Each shot says where it came from underneath, for the
 * same reason.
 */
function Surfaces({
  blank,
  color,
  surface,
  onSurface,
}: {
  blank: Blank;
  color: BlankColor | null;
  surface: "front" | "back";
  onSurface: (s: "front" | "back") => void;
}) {
  const shots: Array<{ key: "front" | "back"; url: string | null }> = [
    { key: "front", url: color ? color.imageUrl : blank.imageUrl },
    { key: "back", url: color ? color.imageUrlBack : null },
  ];

  return (
    <section className="ax-card p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[13px] font-semibold">{color ? color.name : "Catalogue shot"}</h2>
        {color && !color.available && <Chip tone="var(--ax-amber)">Discontinued</Chip>}
        {!color && blank.colors.length > 0 && (
          <span className="text-[11px] text-[hsl(var(--ax-faint))]">no colourway chosen</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {shots.map(({ key, url }) => {
          const source = imageSourceOf(url);
          const active = surface === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSurface(key)}
              className={`rounded-xl border p-2 text-left transition-colors ${
                active ? "border-[hsl(var(--ax-accent)/0.55)]" : "border-[hsl(var(--ax-border))] hover:border-white/25"
              }`}
            >
              {url ? (
                <AssetImage
                  url={url}
                  alt={`${color?.name ?? blank.name} ${key}`}
                  className="aspect-square w-full rounded-lg bg-white/[0.03]"
                  fit="contain"
                />
              ) : (
                <div className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-[hsl(var(--ax-border))] text-[11px] text-[hsl(var(--ax-faint))]">
                  <ImageOff className="h-4 w-4" />
                  No {key} photo
                </div>
              )}
              <div className="mt-1.5 flex items-baseline justify-between text-[10px] text-[hsl(var(--ax-faint))]">
                <span className="capitalize">{key}</span>
                <span>{source === "none" ? "—" : source}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ facts */

function Facts({
  blank,
  color,
  coverage,
  backs,
}: {
  blank: Blank;
  color: BlankColor | null;
  coverage: { withPhoto: number; total: number };
  backs: { withBack: number; total: number };
}) {
  return (
    <section className="ax-card p-4">
      <h2 className="mb-3 text-[13px] font-semibold">What we know</h2>

      <div className="grid grid-cols-2 gap-2">
        {AUDIENCES.map((a) => (
          <div key={a.key} className="rounded-lg border border-[hsl(var(--ax-border))] px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">{a.label}</div>
            <div className="text-[15px] font-semibold tabular-nums">{fmtMoney(priceFor(blank, a.key))}</div>
            <div className="text-[10px] text-[hsl(var(--ax-faint))]">
              {marginFor(blank, a.key) == null ? "no margin yet" : `margin ${fmtPct(marginFor(blank, a.key))}`}
            </div>
          </div>
        ))}
      </div>
      {/*
        Say why the numbers are dashes. An operator seeing four em dashes with no
        explanation reasonably assumes the page is broken; the truth is that
        Shopify owns price in V2 and is not connected yet.
      */}
      <p className="mt-2 text-[10px] text-[hsl(var(--ax-faint))]">
        Shopify owns price, cost and quantity in V2 and is not connected yet, so these read “—”. A missing price is
        honest; a stale one from V1 would not be.
      </p>

      <Row label="Cost" value={fmtMoney(blank.cost)} />
      <Row label="Garment" value={blank.garmentType.replace(/_/g, " ")} />
      <Row label="Supplier" value={blank.brand ?? "not recorded"} />
      <Row label="Style code" value={blank.styleNumber ?? "not recorded"} />
      <Row label="Colourways" value={`${blank.colors.length} · ${coverage.withPhoto} of ${coverage.total} photographed`} />
      <Row label="Back photos" value={`${backs.withBack} of ${backs.total}`} />
      <Row label="Sizes" value={blank.sizes.length ? blank.sizes.join(" · ") : "Shopify variant concern — not held in V2"} />
      <Row label="Audiences" value={blank.assortments.join(", ") || "none"} />
      {color && <Row label="Selected hex" value={color.hex ?? "not recorded"} />}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2.5 flex gap-3 text-[12px]">
      <span className="w-28 shrink-0 text-[hsl(var(--ax-faint))]">{label}</span>
      <span className="min-w-0 flex-1">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------- colourways */

/**
 * Every colourway, and every one of them is a link.
 *
 * This is the grid that used to be a row of decorative 12px dots. A colourway
 * is the unit an operator actually works in — it is what a mockup is built on
 * and what a client picks — so it gets a tile, a name, and an address.
 */
function Colourways({
  blank,
  selected,
  pinned,
  onClear,
}: {
  blank: Blank;
  selected: BlankColor | null;
  pinned: boolean;
  onClear: () => void;
}) {
  if (blank.colors.length === 0) {
    return (
      <section className="mt-6">
        <h2 className="mb-3 text-[13px] font-semibold">Colourways</h2>
        <EmptyState>No colourways have synced from the Drive for this blank.</EmptyState>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-[13px] font-semibold">Colourways</h2>
        <span className="text-[13px] tabular-nums text-[hsl(var(--ax-faint))]">{blank.colors.length}</span>
        {pinned && (
          <button type="button" onClick={onClear} className="ml-auto text-[11px] text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]">
            Clear selection
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-8">
        {blank.colors.map((c) => {
          const issues = colorwayIssues(c);
          const active = selected?.id === c.id;
          return (
            <Link
              key={c.id}
              to={blankHref(blank.id, c.name)}
              title={issues.length ? issues.map((i) => ISSUE_LABEL[i]).join(" · ") : c.name}
              className={`rounded-xl border p-1.5 transition-all ${
                active
                  ? "border-[hsl(var(--ax-accent)/0.6)] bg-[hsl(var(--ax-accent)/0.06)]"
                  : "border-[hsl(var(--ax-border))] hover:border-white/25"
              } ${c.available ? "" : "opacity-45"}`}
            >
              {c.imageUrl ? (
                <AssetImage url={c.imageUrl} alt={c.name} className="aspect-square w-full rounded-lg bg-white/[0.03]" fit="contain" />
              ) : (
                <div className="aspect-square w-full rounded-lg" style={{ background: c.hex ?? "#3a3a3a" }} />
              )}
              <div className="mt-1 flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-[10px]">{c.name}</span>
                {issues.length > 0 && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--ax-amber))]" aria-label="photography issue" />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ audit */

/** Only the colourways with something wrong. A clean blank says so in one line. */
function Audit({ blank, selected }: { blank: Blank; selected: BlankColor | null }) {
  const rows = blank.colors.filter((c) => c.available).map((c) => ({ color: c, issues: colorwayIssues(c) }));
  const flagged = rows.filter((r) => r.issues.length > 0);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-[13px] font-semibold">Photography audit</h2>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            background: flagged.length ? "hsl(var(--ax-amber) / 0.16)" : "hsl(var(--ax-accent) / 0.16)",
            color: flagged.length ? "hsl(var(--ax-amber))" : "hsl(var(--ax-accent))",
          }}
        >
          {flagged.length ? `${flagged.length} to check` : "All matched"}
        </span>
      </div>

      {flagged.length === 0 ? (
        <EmptyState>Every available colourway has a front and a back from the same system.</EmptyState>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {flagged.map(({ color, issues }) => (
            <Link
              key={color.id}
              to={blankHref(blank.id, color.name)}
              className={`rounded-xl border p-2.5 transition-colors ${
                selected?.id === color.id
                  ? "border-[hsl(var(--ax-accent)/0.55)]"
                  : "border-[hsl(var(--ax-amber)/0.45)] bg-[hsl(var(--ax-amber)/0.05)] hover:border-[hsl(var(--ax-amber))]"
              }`}
            >
              <div className="mb-1.5 text-[12px] font-medium">{color.name}</div>
              <div className="grid grid-cols-2 gap-2">
                {(["front", "back"] as const).map((side) => {
                  const url = side === "front" ? color.imageUrl : color.imageUrlBack;
                  return (
                    <div key={side}>
                      {url ? (
                        <AssetImage url={url} alt={`${color.name} ${side}`} className="aspect-square w-full rounded-md bg-white/[0.03]" fit="contain" />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-[hsl(var(--ax-border))] text-[10px] text-[hsl(var(--ax-faint))]">
                          none
                        </div>
                      )}
                      <div className="mt-0.5 flex items-baseline justify-between text-[9px] text-[hsl(var(--ax-faint))]">
                        <span className="capitalize">{side}</span>
                        <span>{imageSourceOf(url) === "none" ? "—" : imageSourceOf(url)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {issues.map((i) => (
                <p key={i} className="mt-1 text-[10px] text-[hsl(var(--ax-amber))]">
                  {ISSUE_LABEL[i]}
                </p>
              ))}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------- built on this */

/**
 * Mockups already built on this blank.
 *
 * The catalog is otherwise a dead end — you look at a garment and there is
 * nowhere to go. This is the edge back into the creative work, and it is the
 * fastest answer to "have we already put something on this?".
 */
function BuiltOnThis({ blank, selected }: { blank: Blank; selected: BlankColor | null }) {
  const { data } = useConcepts();
  const all = useMemo(() => (data ?? []).filter((c) => c.blankId === blank.id), [data, blank.id]);
  if (all.length === 0) return null;

  const onThisColour = selected ? all.filter((c) => c.colorName === selected.name) : [];
  const rest = all.filter((c) => !onThisColour.includes(c));

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-[13px] font-semibold">Built on this blank</h2>
        <span className="text-[13px] tabular-nums text-[hsl(var(--ax-faint))]">{all.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
        {[...onThisColour, ...rest].map((c) => {
          const body = (
            <>
              <AssetImage
                {...mockupCover(c)}
                alt={c.title}
                className="aspect-square w-full bg-black/30"
                fit="contain"
              />
              <div className="p-2">
                <div className="truncate text-[11px]">{c.title || "Untitled mockup"}</div>
                <div className="truncate text-[9px] text-[hsl(var(--ax-faint))]">{c.colorName ?? "no colour recorded"}</div>
              </div>
            </>
          );
          const matched = selected != null && c.colorName === selected.name;
          const className = `ax-card overflow-hidden ${matched ? "ring-1 ring-[hsl(var(--ax-accent)/0.5)]" : ""}`;
          return c.entityId ? (
            <Link key={c.id} to={entityLibraryHref(c.entityId ?? "", { mockup: c.id })} className={`${className} ax-card-hover transition-all`}>
              {body}
            </Link>
          ) : (
            <div key={c.id} className={className} title="This mockup has no owner, so it has no workspace to open in">
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
