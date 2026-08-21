// The two ways to look at the same blanks.
//
// Grid is merchandising — photography first, enough numbers to compare.
// Table is operations — cost, margin and SKU in columns you can scan down.
// Both render the SAME PricedCatalogBlank records; nothing is recomputed or
// re-fetched per view, so the two can never disagree.
import { Check, ImageOff, CheckSquare, Square, ExternalLink } from "lucide-react";
import {
  isActive,
  prettyCategory,
  type Assortment,
  type PricedCatalogBlank,
} from "@/lib/ecosystem/blank-catalog";
import { formatMoney, formatPercent, type PriceTier } from "@/lib/ecosystem/pricing";
import { cn } from "@/lib/utils";

function AssortmentChips({ keys, assortments }: { keys: string[]; assortments: Assortment[] }) {
  if (keys.length === 0) {
    return <span className="text-[10px] uppercase tracking-wider text-amber-600">No catalog</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {assortments
        .filter((a) => keys.includes(a.key))
        .map((a) => (
          <span
            key={a.key}
            title={a.name}
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--ax-accent)/0.14)] text-[hsl(var(--ax-accent))]"
          >
            {a.key}
          </span>
        ))}
    </span>
  );
}

function MediaChip({ b }: { b: PricedCatalogBlank }) {
  if (b.mediaComplete) {
    return (
      <span className="text-[10px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-0.5">
        <Check className="h-3 w-3" /> Photos complete
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold text-amber-600">
      {b.mediaPercent}% photos
    </span>
  );
}

/**
 * A price cell that says where the number came from. A dot means someone typed
 * it; without the marker a hand-set price and a computed one look identical,
 * and you can't tell which blanks would move if a cost changed.
 */
function Price({ b, tier, bold }: { b: PricedCatalogBlank; tier: PriceTier; bold?: boolean }) {
  const pinned = b.overrides[tier] != null;
  return (
    <td className={cn("p-2 text-right tabular-nums whitespace-nowrap", bold && "font-semibold")}>
      {pinned && (
        <span
          title={`Set by hand — the rule would charge ${formatMoney(b.computed[tier])}`}
          className="inline-block h-1.5 w-1.5 rounded-full bg-[hsl(var(--ax-accent))] mr-1 align-middle"
        />
      )}
      {formatMoney(b.prices[tier])}
    </td>
  );
}

function sizeRange(sizes: string[]): string {
  if (sizes.length === 0) return "—";
  if (sizes.length === 1) return sizes[0];
  return `${sizes[0]}–${sizes[sizes.length - 1]}`;
}

export function BlankGrid({
  blanks, assortments, selected, onToggle, onOpen,
}: {
  blanks: PricedCatalogBlank[];
  assortments: Assortment[];
  selected: string[];
  onToggle: (id: string) => void;
  onOpen: (b: PricedCatalogBlank) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {blanks.map((b) => {
        const on = selected.includes(b.id);
        return (
          <div
            key={b.id}
            className={cn(
              "ax-card p-3 relative transition-colors",
              on && "ring-2 ring-[hsl(var(--ax-accent))]",
              !isActive(b) && "opacity-60",
            )}
          >
            <button
              onClick={() => onToggle(b.id)}
              className="absolute top-4 left-4 z-10 text-white drop-shadow"
              aria-label={on ? "Deselect" : "Select"}
            >
              {on
                ? <CheckSquare className="h-5 w-5 text-[hsl(var(--ax-accent))]" />
                : <Square className="h-5 w-5 opacity-70" />}
            </button>

            <button onClick={() => onOpen(b)} className="block w-full text-left">
              <span className="block aspect-square rounded-lg overflow-hidden bg-[hsl(var(--ax-line))]">
                {b.primaryImage
                  ? <img src={b.primaryImage} alt={b.name} loading="lazy" className="h-full w-full object-cover" />
                  : <span className="h-full w-full flex items-center justify-center"><ImageOff className="h-5 w-5 text-[hsl(var(--ax-faint))]" /></span>}
              </span>

              <div className="mt-2.5 font-bold text-[14px] leading-tight truncate">{b.name}</div>
              <div className="text-[11px] font-mono text-muted-foreground">{b.style_number ?? b.sku ?? "—"}</div>
              <div className="text-[11px] text-[hsl(var(--ax-faint))]">
                {prettyCategory(b.garment_type)}{b.brand ? ` · ${b.brand}` : ""}
              </div>

              <dl className="mt-2 space-y-0.5 text-[11px] tabular-nums">
                <div className="flex justify-between">
                  <dt className="text-[hsl(var(--ax-faint))]">True cost</dt>
                  <dd className="font-semibold">{formatMoney(b.trueCost)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[hsl(var(--ax-faint))]">Athlete</dt>
                  <dd>{formatMoney(b.prices.athlete)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[hsl(var(--ax-faint))]">Client</dt>
                  <dd>{formatMoney(b.prices.corporate)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[hsl(var(--ax-faint))]">Standard</dt>
                  <dd className="font-semibold text-[hsl(var(--ax-accent))]">{formatMoney(b.prices.standard)}</dd>
                </div>
                <div className="flex justify-between pt-0.5 border-t border-[hsl(var(--ax-border))]">
                  <dt className="text-[hsl(var(--ax-faint))]">Margin</dt>
                  <dd>{formatPercent(b.margins.standard)}</dd>
                </div>
              </dl>
            </button>

            <div className="mt-2 pt-2 border-t border-[hsl(var(--ax-border))] space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>{b.colors.filter((c) => c.available).length} colors</span>
                <span>{sizeRange(b.sizes)}</span>
                <MediaChip b={b} />
              </div>
              <AssortmentChips keys={b.assortments} assortments={assortments} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function BlankTable({
  blanks, assortments, selected, onToggle, onOpen, onToggleAll, tier,
}: {
  blanks: PricedCatalogBlank[];
  assortments: Assortment[];
  selected: string[];
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (b: PricedCatalogBlank) => void;
  tier: PriceTier;
}) {
  const allOn = blanks.length > 0 && blanks.every((b) => selected.includes(b.id));

  return (
    <div className="ax-card p-0 overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))] border-b border-[hsl(var(--ax-border))]">
            <th className="p-2 w-8">
              <button onClick={onToggleAll} aria-label="Select all">
                {allOn
                  ? <CheckSquare className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
                  : <Square className="h-4 w-4" />}
              </button>
            </th>
            <th className="p-2 w-12" />
            <th className="p-2 text-left">Blank</th>
            <th className="p-2 text-left">Style</th>
            <th className="p-2 text-left">Category</th>
            <th className="p-2 text-right">Cost</th>
            <th className="p-2 text-right">Athlete</th>
            <th className="p-2 text-right">Client</th>
            <th className="p-2 text-right">Standard</th>
            <th className="p-2 text-right">Margin</th>
            <th className="p-2 text-right">Colors</th>
            <th className="p-2 text-right">Photos</th>
            <th className="p-2 text-left">Catalogs</th>
          </tr>
        </thead>
        <tbody>
          {blanks.map((b) => {
            const on = selected.includes(b.id);
            return (
              <tr
                key={b.id}
                className={cn(
                  "border-b border-[hsl(var(--ax-border))] last:border-0 hover:bg-[hsl(var(--ax-line)/0.5)]",
                  on && "bg-[hsl(var(--ax-accent)/0.08)]",
                  !isActive(b) && "opacity-60",
                )}
              >
                <td className="p-2">
                  <button onClick={() => onToggle(b.id)} aria-label={on ? "Deselect" : "Select"}>
                    {on
                      ? <CheckSquare className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
                      : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </td>
                <td className="p-2">
                  {/* A thumbnail in the operational view too, so pricing stops
                      being an abstract spreadsheet of names. */}
                  <button onClick={() => onOpen(b)} className="block h-9 w-9 rounded overflow-hidden bg-[hsl(var(--ax-line))]">
                    {b.primaryImage && <img src={b.primaryImage} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </button>
                </td>
                <td className="p-2">
                  <button onClick={() => onOpen(b)} className="font-semibold text-left hover:text-[hsl(var(--ax-accent))]">
                    {b.name}
                  </button>
                  <div className="text-[10px] text-[hsl(var(--ax-faint))] font-mono">{b.sku ?? "—"}</div>
                </td>
                <td className="p-2 font-mono text-muted-foreground">{b.style_number ?? "—"}</td>
                <td className="p-2 text-muted-foreground">{prettyCategory(b.garment_type)}</td>
                <td className="p-2 text-right tabular-nums">{formatMoney(b.trueCost)}</td>
                <Price b={b} tier="athlete" />
                <Price b={b} tier="corporate" />
                <Price b={b} tier="standard" bold />
                <td className="p-2 text-right tabular-nums">{formatPercent(b.margins[tier])}</td>
                <td className="p-2 text-right tabular-nums">{b.colors.filter((c) => c.available).length}</td>
                <td className={cn("p-2 text-right tabular-nums", b.mediaComplete ? "text-[hsl(var(--ax-accent))]" : "text-amber-600")}>
                  {b.mediaPercent}%
                </td>
                <td className="p-2"><AssortmentChips keys={b.assortments} assortments={assortments} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {blanks.length === 0 && (
        <p className="p-8 text-center text-[13px] text-muted-foreground">Nothing matches those filters.</p>
      )}
    </div>
  );
}

export { sizeRange };
export function VendorLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[12px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1"
    >
      <ExternalLink className="h-3.5 w-3.5" /> Vendor page
    </a>
  );
}
