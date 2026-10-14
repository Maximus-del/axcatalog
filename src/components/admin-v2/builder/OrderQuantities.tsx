import { useMemo } from "react";
import { Minus, Plus } from "lucide-react";
import { fmtMoney } from "@/lib/v2/pricing";
import { rowUnits, type QuantityGrid } from "@/lib/v2/cart";
import { DEFAULT_SPLIT, RUN_PRESETS, distribute, sizesFor } from "@/lib/v2/size-run";
import { quoteCart, type DiscountBreak } from "@/lib/v2/bulk-pricing";
import type { VariantTarget } from "@/lib/v2/variants";

// ORDER QUANTITIES — a run, not a number.
//
// This used to refuse to render at all: V2 has no size table, so every garment
// "listed no sizes" and the section said so and stopped. But sizes are a
// Shopify variant concern and that integration is not connected, which is a
// reason to fall back to the standard S–3XL run, not a reason to block an
// order. A size that turns out not to exist is a conversation with the
// supplier; a wrong price would be an invoice.
//
// The quick-fill buttons are the point. Nobody types 25 into six boxes six
// times — they order 25 Larges, or they give up. One click lays the house
// split across the sizes and the operator adjusts from there.

export function OrderQuantities({
  variants,
  sizesOf,
  grid,
  priceOf,
  breaks,
  onChange,
  onFillVariant,
  onClear,
}: {
  variants: VariantTarget[];
  /** The garment's own sizes; empty falls back to the standard run. */
  sizesOf: (blankId: string) => string[];
  grid: QuantityGrid;
  /** Audience price per unit for a variant's garment, or null when unpriced. */
  priceOf: (variantIndex: number) => number | null;
  breaks: DiscountBreak[];
  onChange: (variantIndex: number, size: string, quantity: number) => void;
  /** Lay a whole run across one colourway's sizes. */
  onFillVariant: (variantIndex: number, quantities: Record<string, number>) => void;
  onClear: () => void;
}) {
  /** One column set for the whole grid: the union of what the run offers. */
  const sizes = useMemo(() => {
    const all = new Set<string>();
    for (const v of variants) for (const s of sizesFor(sizesOf(v.blankId))) all.add(s);
    // Keep the house order where we know it, then anything unusual after.
    const known = DEFAULT_SPLIT.map((s) => s.size).filter((s) => all.has(s));
    const extra = [...all].filter((s) => !known.includes(s));
    return [...known, ...extra];
  }, [variants, sizesOf]);

  const quote = useMemo(() => {
    const lines = variants.flatMap((_, i) => {
      const price = priceOf(i) ?? 0;
      return Object.values(grid[i] ?? {}).map((q) => ({ quantity: q, unitPrice: price }));
    });
    return quoteCart(lines, breaks);
  }, [variants, grid, priceOf, breaks]);

  const unpriced = variants.filter((_, i) => rowUnits(grid, i) > 0 && priceOf(i) == null).length;

  return (
    <section className="rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.02] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-ink))]">
          Order quantities <span className="font-normal normal-case tracking-normal text-[hsl(var(--ax-faint))]">— optional</span>
        </h4>
        {quote.units > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10.5px] text-[hsl(var(--ax-faint))] underline-offset-2 hover:underline"
          >
            Clear {quote.units} unit{quote.units === 1 ? "" : "s"}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[hsl(var(--ax-line))]">
        <table className="w-full min-w-[560px] border-collapse text-[11px]">
          <thead className="bg-[hsl(var(--ax-card))]">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-[hsl(var(--ax-faint))]">Colourway</th>
              {sizes.map((s) => (
                <th key={s} className="w-[76px] px-1 py-1.5 text-center font-medium text-[hsl(var(--ax-faint))]">
                  {s}
                </th>
              ))}
              <th className="w-[112px] px-2 py-1.5 text-right font-medium text-[hsl(var(--ax-faint))]">Fill</th>
              <th className="w-[64px] px-2 py-1.5 text-right font-medium text-[hsl(var(--ax-faint))]">Units</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => {
              const rowTotal = rowUnits(grid, i);
              const price = priceOf(i);
              const rowSizes = sizesFor(sizesOf(v.blankId));
              return (
                <tr key={`${v.blankId}-${v.colorName ?? "none"}`} className="border-t border-[hsl(var(--ax-line))]">
                  <td className="max-w-[190px] px-2 py-1.5">
                    <div className="truncate text-[hsl(var(--ax-ink))]">{v.colorName ?? "No colour"}</div>
                    <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
                      {v.blankName}
                      {price != null ? ` · ${fmtMoney(price)}` : " · unpriced"}
                    </div>
                  </td>

                  {sizes.map((size) => {
                    const offered = rowSizes.includes(size);
                    const value = grid[i]?.[size] ?? 0;
                    return (
                      <td key={size} className="px-1 py-1.5">
                        {offered ? (
                          <div className="flex items-center justify-center gap-0.5">
                            <Stepper
                              label={`one fewer ${size}`}
                              onClick={() => onChange(i, size, Math.max(0, value - 1))}
                              disabled={value <= 0}
                            >
                              <Minus className="h-2.5 w-2.5" />
                            </Stepper>
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              aria-label={`${v.colorName ?? "No colour"} ${v.blankName} size ${size}`}
                              value={value || ""}
                              onChange={(e) =>
                                onChange(i, size, Math.max(0, Math.trunc(Number(e.target.value) || 0)))
                              }
                              className="w-[34px] rounded-md border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-1 py-1 text-center tabular-nums outline-none focus:border-[hsl(var(--ax-accent))]"
                            />
                            <Stepper label={`one more ${size}`} onClick={() => onChange(i, size, value + 1)}>
                              <Plus className="h-2.5 w-2.5" />
                            </Stepper>
                          </div>
                        ) : (
                          <div
                            className="text-center text-[hsl(var(--ax-faint))]"
                            title={`${v.blankName} does not list ${size}`}
                          >
                            —
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/*
                    ONE CLICK LAYS THE WHOLE RUN.
                    S5 · M15 · L25 · XL30 · 2XL20 · 3XL5, by largest remainder
                    so the total is exactly the number on the button.
                  */}
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      {RUN_PRESETS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => onFillVariant(i, distribute(n))}
                          title={`Lay ${n} across the sizes — S5 M15 L25 XL30 2XL20 3XL5`}
                          className="rounded-md border border-[hsl(var(--ax-border))] px-1.5 py-1 text-[10.5px] text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-ink))]"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </td>

                  <td className="px-2 py-1.5 text-right tabular-nums text-[hsl(var(--ax-secondary))]">
                    {rowTotal || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {quote.units > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-black/25 px-3 py-2 text-[12px]">
          <span className="tabular-nums text-[hsl(var(--ax-secondary))]">
            {quote.units} unit{quote.units === 1 ? "" : "s"}
          </span>
          {quote.discountPct > 0 ? (
            <span className="text-[hsl(var(--ax-accent))]">
              {quote.appliedBreak?.minQty}+ · −{quote.discountPct}%
            </span>
          ) : (
            quote.nextBreak && (
              <span className="text-[hsl(var(--ax-amber))]">
                {quote.nextBreak.unitsAway} more reaches {quote.nextBreak.discountPct}% off
              </span>
            )
          )}
          <span className="ml-auto font-semibold tabular-nums">{fmtMoney(quote.subtotal)}</span>
        </div>
      )}

      {unpriced > 0 && (
        <p className="mt-1.5 text-[11px] text-[hsl(var(--ax-amber))]">
          {unpriced} of these garments has no price for this audience yet, so it adds units but no money.
        </p>
      )}
    </section>
  );
}

function Stepper({
  children,
  onClick,
  label,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[hsl(var(--ax-border))] text-[hsl(var(--ax-faint))] transition-colors hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-ink))] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
