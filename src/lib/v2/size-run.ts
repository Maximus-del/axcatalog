// AX OS V2 — how many of each size.
//
// A bulk order is not a number, it is a distribution. Somebody typing 25 into
// six boxes by hand gets it wrong, gets bored, or orders 25 Larges — so the
// quantity comes in as one number and lands as a run.
//
// THE SPLIT IS CHASE'S, AND IT IS THE HOUSE FORMULA:
//
//     S 5% · M 15% · L 25% · XL 30% · 2XL 20% · 3XL 5%
//
// It is a real bell curve shifted large, which is what actually sells to a
// team. It is data rather than arithmetic so it can be edited later without a
// deploy; nothing here assumes those six numbers.

export const SIZE_RUN = ["S", "M", "L", "XL", "2XL", "3XL"] as const;
export type RunSize = (typeof SIZE_RUN)[number];

export interface SizeSplit {
  size: string;
  /** Percentage of the run. The set should total 100. */
  percent: number;
}

/** The house split. */
export const DEFAULT_SPLIT: SizeSplit[] = [
  { size: "S", percent: 5 },
  { size: "M", percent: 15 },
  { size: "L", percent: 25 },
  { size: "XL", percent: 30 },
  { size: "2XL", percent: 20 },
  { size: "3XL", percent: 5 },
];

/** Quick-fill amounts offered above the grid. */
export const RUN_PRESETS = [10, 25, 50] as const;

export function splitTotal(split: SizeSplit[]): number {
  return split.reduce((n, s) => n + s.percent, 0);
}

/**
 * Turn one number into a run.
 *
 * LARGEST REMAINDER, not rounding. Rounding each size independently loses or
 * gains units — 25 split six ways by naive rounding comes to 24 — and an
 * operator who asks for 25 and is quoted 24 has to go and find the missing one.
 * The whole units go out first, then the leftovers go to the sizes with the
 * biggest fractional claim, so the total is EXACTLY what was asked for.
 *
 * Ties break towards the larger share, so a rounding crumb lands on XL rather
 * than on 3XL.
 */
export function distribute(total: number, split: SizeSplit[] = DEFAULT_SPLIT): Record<string, number> {
  const units = Math.max(0, Math.trunc(total));
  const out: Record<string, number> = {};
  for (const s of split) out[s.size] = 0;
  if (units === 0 || split.length === 0) return out;

  const sum = splitTotal(split);
  if (sum <= 0) return out;

  const exact = split.map((s) => ({ size: s.size, share: (units * s.percent) / sum, percent: s.percent }));
  let assigned = 0;
  for (const e of exact) {
    const whole = Math.floor(e.share);
    out[e.size] = whole;
    assigned += whole;
  }

  const remaining = units - assigned;
  if (remaining > 0) {
    const byRemainder = [...exact].sort((a, b) => {
      const ra = a.share - Math.floor(a.share);
      const rb = b.share - Math.floor(b.share);
      if (rb !== ra) return rb - ra;
      return b.percent - a.percent;
    });
    for (let i = 0; i < remaining; i += 1) out[byRemainder[i % byRemainder.length].size] += 1;
  }

  return out;
}

/**
 * The sizes a garment can be ordered in.
 *
 * V2 has no size table — sizes are a Shopify variant concern and that
 * integration is not connected — so a blank that lists none falls back to the
 * standard run rather than offering nothing. Falling back is safe here in a way
 * it would not be for price: a size that turns out not to exist is a
 * conversation with the supplier, whereas a wrong price is an invoice.
 */
export function sizesFor(blankSizes: string[] | undefined | null): string[] {
  const listed = (blankSizes ?? []).map((s) => s.trim()).filter(Boolean);
  return listed.length > 0 ? listed : [...SIZE_RUN];
}

export function runTotal(quantities: Record<string, number>): number {
  return Object.values(quantities).reduce((n, q) => n + (q > 0 ? Math.trunc(q) : 0), 0);
}
