import { useMemo } from "react";
import { fmtMoney } from "@/lib/v2/pricing";
import { gridUnits, rowUnits, type QuantityGrid } from "@/lib/v2/cart";
import type { VariantTarget } from "@/lib/v2/variants";

// CREATE MOCKUP — "and how many of them".
//
// The cart is a `draft` bulk order and its lines are (mockup, colour, size).
// This is where those quantities get typed, on the screen where the operator
// can still see what they are ordering.
//
// FILLING THIS IN IS OPTIONAL. Leaving it empty is the ordinary case: most
// mockups are made to look at, not to order. So the grid is quiet until a
// number goes in it, and the two cart buttons stay disabled until then —
// "Add to cart" with nothing in the cart is a button that lies.

export function OrderQuantities({
  variants,
  sizes,
  grid,
  priceOf,
  onChange,
  onClear,
}: {
  variants: VariantTarget[];
  sizes: string[];
  grid: QuantityGrid;
  /** Audience price per unit for a variant's garment, or null when unpriced. */
  priceOf: (variantIndex: number) => number | null;
  onChange: (variantIndex: number, size: string, quantity: number) => void;
  onClear: () => void;
}) {
  const units = useMemo(() => gridUnits(grid), [grid]);
  const unpricedRows = variants.filter((_, i) => rowUnits(grid, i) > 0 && priceOf(i) == null).length;

  if (sizes.length === 0) {
    return (
      <section className="rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.02] p-3">
        <h4 className="text-[12px] font-semibold text-[hsl(var(--ax-ink))]">Order quantities</h4>
        <p className="mt-1 text-[11px] text-[hsl(var(--ax-amber))]">
          None of these garments list their sizes, so there is nothing to order against yet. The mockups still save.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.02] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-semibold text-[hsl(var(--ax-ink))]">
          Order quantities <span className="font-normal text-[hsl(var(--ax-faint))]">— optional</span>
        </h4>
        {units > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[10.5px] text-[hsl(var(--ax-faint))] underline-offset-2 hover:underline"
          >
            Clear {units} unit{units === 1 ? "" : "s"}
          </button>
        ) : (
          <p className="text-[10.5px] text-[hsl(var(--ax-faint))]">
            Only needed if you are ordering these now. Leave it blank to just save the mockups.
          </p>
        )}
      </div>

      <div className="max-h-[260px] overflow-auto rounded-xl border border-[hsl(var(--ax-line))]">
        <table className="w-full border-collapse text-[11px]">
          <thead className="sticky top-0 z-10 bg-[hsl(var(--ax-card))]">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-[hsl(var(--ax-faint))]">Colourway</th>
              {sizes.map((s) => (
                <th key={s} className="w-[54px] px-1 py-1.5 text-center font-medium text-[hsl(var(--ax-faint))]">
                  {s}
                </th>
              ))}
              <th className="w-[64px] px-2 py-1.5 text-right font-medium text-[hsl(var(--ax-faint))]">Units</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v, i) => {
              const rowTotal = rowUnits(grid, i);
              const price = priceOf(i);
              return (
                <tr key={`${v.blankId}-${v.colorName ?? "none"}`} className="border-t border-[hsl(var(--ax-line))]">
                  <td className="max-w-[180px] px-2 py-1">
                    <div className="truncate text-[hsl(var(--ax-ink))]">{v.colorName ?? "No colour"}</div>
                    <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
                      {v.blankName}
                      {price != null ? ` · ${fmtMoney(price)}` : " · unpriced"}
                    </div>
                  </td>
                  {sizes.map((s) => (
                    <td key={s} className="px-1 py-1">
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        aria-label={`${v.colorName ?? "No colour"} ${v.blankName} size ${s}`}
                        value={grid[i]?.[s] || ""}
                        onChange={(e) => onChange(i, s, Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                        className="w-full rounded-md border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-1 py-1 text-center tabular-nums outline-none focus:border-[hsl(var(--ax-accent))]"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right tabular-nums text-[hsl(var(--ax-secondary))]">
                    {rowTotal || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {unpricedRows > 0 && (
        <p className="mt-1.5 text-[11px] text-[hsl(var(--ax-amber))]">
          {unpricedRows} of these garments has no {""}
          price for this audience. They can still go in the cart — the line reads as unpriced rather than as free.
        </p>
      )}
    </section>
  );
}
