// AX OS V2 — the mockup cart.
//
// THE CART IS A `draft` BULK ORDER. There is no cart table.
//
// bulk_order_requests + bulk_order_items already hold the line-item model AX
// needs — one row per (mockup, colour, size) — already carry the
// wholesale/retail/savings columns, and already have a trigger that keeps
// total_units correct. A parallel cart table would have duplicated all of that
// and then had to be reconciled with it at submit time. So the cart is the
// same record the order will be, sitting at the status before the first one:
// `draft`.
//
// A draft is an OPERATOR'S WORKING CART. It is not an order and must never be
// counted as one — see order-draft-isolation.test.ts, which enforces that
// across V1.

export interface CartLine {
  /** bulk_order_items.id — the handle for editing one size's quantity. */
  id: string;
  mockupId: string | null;
  blankId: string | null;
  title: string;
  colorName: string | null;
  size: string;
  quantity: number;
  /**
   * The audience price this line was added at, per unit, BEFORE any volume
   * discount. The discount depends on the whole cart's unit count, so it is
   * derived at render and written only when the cart is submitted — otherwise
   * every stored line total goes stale the moment the next line is added.
   */
  unitRetail: number;
  imageUrl: string | null;
}

/** One mockup in one colourway, with its sizes gathered up. */
export interface CartGroup {
  key: string;
  mockupId: string | null;
  blankId: string | null;
  title: string;
  colorName: string | null;
  imageUrl: string | null;
  unitRetail: number;
  units: number;
  /** Retail before discount. What the group costs is a whole-cart question. */
  retail: number;
  lines: CartLine[];
}

/**
 * The identity of a cart row.
 *
 * (mockup, colour, size) — the same shirt in the same colour in a Large is one
 * line whose quantity goes up, not a second line. A cart that lists "Large ×2"
 * twice is a cart nobody can check.
 */
export function lineKey(mockupId: string | null, colorName: string | null, size: string): string {
  return [mockupId ?? "no-mockup", colorName ?? "no-colour", size].join("||");
}

/** The identity of a card in the cart: one mockup, one colourway. */
export function groupKey(mockupId: string | null, colorName: string | null): string {
  return [mockupId ?? "no-mockup", colorName ?? "no-colour"].join("||");
}

/**
 * Apparel order, not alphabetical order.
 *
 * A size list that reads 2XL, L, M, S, XL is unreadable at a glance, and
 * glancing is the whole job of a cart. Sizes AX does not know about keep their
 * relative order at the end rather than being dropped or guessed at.
 */
const SIZE_ORDER = [
  "XXS", "XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL", "5XL",
  "OSFA", "ONE SIZE",
];

export function sizeRank(size: string): number {
  const i = SIZE_ORDER.indexOf(size.trim().toUpperCase());
  return i === -1 ? SIZE_ORDER.length : i;
}

export function sortSizes<T>(items: T[], sizeOf: (item: T) => string): T[] {
  return [...items].sort((a, b) => {
    const ra = sizeRank(sizeOf(a));
    const rb = sizeRank(sizeOf(b));
    if (ra !== rb) return ra - rb;
    return sizeOf(a).localeCompare(sizeOf(b));
  });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Gather flat line rows into the cards the cart actually shows.
 *
 * Order is the order the mockups were added, so a cart does not reshuffle
 * itself while an operator is typing quantities into it.
 */
export function groupCartLines(lines: CartLine[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();

  for (const line of lines) {
    const key = groupKey(line.mockupId, line.colorName);
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.units += line.quantity;
      existing.retail = round2(existing.retail + line.unitRetail * line.quantity);
      // A group's unit price is whatever its lines agree on; if they ever
      // disagree, the first one added is the one that was quoted.
      if (!existing.imageUrl && line.imageUrl) existing.imageUrl = line.imageUrl;
      continue;
    }
    groups.set(key, {
      key,
      mockupId: line.mockupId,
      blankId: line.blankId,
      title: line.title,
      colorName: line.colorName,
      imageUrl: line.imageUrl,
      unitRetail: line.unitRetail,
      units: line.quantity,
      retail: round2(line.unitRetail * line.quantity),
      lines: [line],
    });
  }

  return [...groups.values()].map((g) => ({ ...g, lines: sortSizes(g.lines, (l) => l.size) }));
}

export function cartUnits(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + Math.max(0, Math.trunc(l.quantity)), 0);
}

/**
 * What to write when a mockup is added to the cart.
 *
 * Sizes at zero are dropped rather than stored: `bulk_order_items` has a
 * `quantity > 0` check, so a zero row is not an empty line, it is a rejected
 * insert that takes the whole add down with it.
 */
export interface AddToCartLine {
  size: string;
  quantity: number;
}

export function addableLines(lines: AddToCartLine[]): AddToCartLine[] {
  return lines
    .map((l) => ({ size: l.size.trim(), quantity: Math.max(0, Math.trunc(l.quantity)) }))
    .filter((l) => l.size.length > 0 && l.quantity > 0);
}

/**
 * Adding what is already in the cart.
 *
 * Returns the inserts and the increments separately, because they are two
 * different writes: a size already in the cart has its quantity raised, a new
 * size becomes a new row. Merging in the client rather than relying on an
 * upsert keeps this true without a unique constraint on a table V1 shares.
 */
export function planAdd(
  existing: CartLine[],
  incoming: { mockupId: string | null; colorName: string | null; lines: AddToCartLine[] },
): {
  inserts: AddToCartLine[];
  increments: Array<{ id: string; quantity: number }>;
} {
  const byKey = new Map(existing.map((l) => [lineKey(l.mockupId, l.colorName, l.size), l]));
  const inserts: AddToCartLine[] = [];
  const increments: Array<{ id: string; quantity: number }> = [];

  for (const line of addableLines(incoming.lines)) {
    const match = byKey.get(lineKey(incoming.mockupId, incoming.colorName, line.size));
    if (match) increments.push({ id: match.id, quantity: match.quantity + line.quantity });
    else inserts.push(line);
  }

  return { inserts, increments };
}

/* ----------------------------------------------- the builder's quantity grid */

/**
 * How many of each size, per colourway, while a run is being built.
 *
 * Keyed on the variant's index in the run rather than on its ids, because a
 * run can legitimately contain the same garment twice — the same blank in two
 * colours is two variants — and the index is what the create call comes back
 * aligned to.
 */
export type QuantityGrid = Record<number, Record<string, number>>;

const sumSizes = (sizes: Record<string, number> | undefined): number =>
  Object.values(sizes ?? {}).reduce<number>((n, q) => n + (q > 0 ? Math.trunc(q) : 0), 0);

export function gridUnits(grid: QuantityGrid): number {
  return Object.keys(grid).reduce<number>((n, k) => n + sumSizes(grid[Number(k)]), 0);
}

export function rowUnits(grid: QuantityGrid, variantIndex: number): number {
  return sumSizes(grid[variantIndex]);
}

/**
 * The sizes a run can be ordered in: the union of what its garments offer.
 *
 * A union rather than an intersection — a run of a hoodie and a tee should not
 * silently lose 3XL because one of them stops at 2XL. A size a garment does not
 * offer is simply left at zero.
 */
export function sizesForRun(
  variants: Array<{ blankId: string }>,
  sizesOf: (blankId: string) => string[],
): string[] {
  const all = new Set<string>();
  for (const v of variants) for (const size of sizesOf(v.blankId)) all.add(size);
  return sortSizes([...all], (s) => s);
}
