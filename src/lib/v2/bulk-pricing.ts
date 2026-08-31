// AX OS V2 — bulk order pricing.
//
// The discount ladder lives in `volume_discount_breaks`, which is populated and
// live: 25+ → 5%, 50+ → 10%, 100+ → 15%, 250+ → 20%. This module does the
// arithmetic on top of it and nothing else — the breaks are data, not constants,
// so changing the business terms is a row edit rather than a deploy.
//
// Everything here is pure and exact about rounding, because these numbers get
// quoted to a client and then invoiced.

export interface DiscountBreak {
  minQty: number;
  discountPct: number;
}

export interface BulkLine {
  size: string;
  quantity: number;
}

export interface BulkQuote {
  units: number;
  /** The break that applied, or null when the order is under the first one. */
  appliedBreak: DiscountBreak | null;
  discountPct: number;
  unitPrice: number;
  /** Price per unit after the volume discount. */
  discountedUnitPrice: number;
  retailEquivalent: number;
  subtotal: number;
  savings: number;
  /** The next break, and how many more units would reach it. */
  nextBreak: { minQty: number; discountPct: number; unitsAway: number } | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The best break an order qualifies for.
 *
 * Highest qualifying minimum wins, so the ladder does not depend on the rows
 * arriving in any particular order.
 */
export function breakFor(units: number, breaks: DiscountBreak[]): DiscountBreak | null {
  return breaks
    .filter((b) => units >= b.minQty)
    .reduce<DiscountBreak | null>((best, b) => (!best || b.minQty > best.minQty ? b : best), null);
}

/** The next break up, and the gap to it — the number an operator will want to quote. */
export function nextBreakFor(units: number, breaks: DiscountBreak[]) {
  const above = breaks.filter((b) => b.minQty > units).sort((a, b) => a.minQty - b.minQty)[0];
  return above ? { minQty: above.minQty, discountPct: above.discountPct, unitsAway: above.minQty - units } : null;
}

export function totalUnits(lines: BulkLine[]): number {
  return lines.reduce((n, l) => n + (Number.isFinite(l.quantity) ? Math.max(0, Math.trunc(l.quantity)) : 0), 0);
}

/**
 * Quote a bulk order.
 *
 * The unit price is discounted first and then multiplied, rather than
 * discounting the line total. On a 250-unit order the two differ by cents, but
 * the per-unit number is the one that appears on the quote, so it has to be the
 * one the total is built from — otherwise the arithmetic on the page does not
 * add up and nobody trusts the rest of it.
 */
export function quoteBulkOrder(lines: BulkLine[], unitPrice: number, breaks: DiscountBreak[]): BulkQuote {
  const units = totalUnits(lines);
  const price = Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
  const applied = breakFor(units, breaks);
  const discountPct = applied?.discountPct ?? 0;

  const discountedUnitPrice = round2(price * (1 - discountPct / 100));
  const retailEquivalent = round2(price * units);
  const subtotal = round2(discountedUnitPrice * units);

  return {
    units,
    appliedBreak: applied,
    discountPct,
    unitPrice: round2(price),
    discountedUnitPrice,
    retailEquivalent,
    subtotal,
    savings: round2(retailEquivalent - subtotal),
    nextBreak: nextBreakFor(units, breaks),
  };
}

/** Standard apparel run. Editable per order; this is only the starting grid. */
export const DEFAULT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

/* --------------------------------------------------------------------- cart */

export interface CartQuoteLine {
  quantity: number;
  /** Audience price per unit, before the volume discount. */
  unitPrice: number;
}

export interface QuotedCartLine extends CartQuoteLine {
  discountedUnitPrice: number;
  lineRetail: number;
  lineSubtotal: number;
}

export interface CartQuote {
  units: number;
  appliedBreak: DiscountBreak | null;
  discountPct: number;
  retailEquivalent: number;
  subtotal: number;
  savings: number;
  nextBreak: { minQty: number; discountPct: number; unitsAway: number } | null;
  lines: QuotedCartLine[];
}

/**
 * Quote a cart of mixed garments.
 *
 * The volume break is a property of the WHOLE cart, not of one mockup: twenty
 * tees and thirty hoodies is a fifty-unit order and gets the fifty-unit rate.
 * That is also why nothing here is stored — add one more hoodie and every
 * line's discounted price changes. The cart derives these numbers on every
 * render and writes them exactly once, at submit.
 *
 * Per-line rounding matches quoteBulkOrder: discount the unit price, round to
 * the cent, then multiply. The per-unit number is the one that gets quoted, so
 * it has to be the one the total is built from.
 */
export function quoteCart(lines: CartQuoteLine[], breaks: DiscountBreak[]): CartQuote {
  const clean = lines.map((l) => ({
    quantity: Number.isFinite(l.quantity) ? Math.max(0, Math.trunc(l.quantity)) : 0,
    unitPrice: Number.isFinite(l.unitPrice) && l.unitPrice > 0 ? l.unitPrice : 0,
  }));

  const units = clean.reduce((n, l) => n + l.quantity, 0);
  const applied = breakFor(units, breaks);
  const discountPct = applied?.discountPct ?? 0;

  const quoted: QuotedCartLine[] = clean.map((l) => {
    const discountedUnitPrice = round2(l.unitPrice * (1 - discountPct / 100));
    return {
      ...l,
      discountedUnitPrice,
      lineRetail: round2(l.unitPrice * l.quantity),
      lineSubtotal: round2(discountedUnitPrice * l.quantity),
    };
  });

  const retailEquivalent = round2(quoted.reduce((n, l) => n + l.lineRetail, 0));
  const subtotal = round2(quoted.reduce((n, l) => n + l.lineSubtotal, 0));

  return {
    units,
    appliedBreak: applied,
    discountPct,
    retailEquivalent,
    subtotal,
    savings: round2(retailEquivalent - subtotal),
    nextBreak: nextBreakFor(units, breaks),
    lines: quoted,
  };
}
