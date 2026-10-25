// The portal cart: what a client has picked, by product → colour → size.
//
// Quick Order (on each gear card), the product page's Order grid and the bulk
// sheet all write to the same cart. The cart checkout prices it on the server
// (portal_quote_order) and places it, then the owner picks Pay now or Net 30.
//
// Pure helpers only — the React state lives in OrderDraftContext.
import type { PortalProduct } from "@/hooks/usePortalProducts";
import type { OrderLineInput } from "@/lib/portal/api/orders";

/** productId → colorKey ("" when the product has no colour choice) → size ("" when none) → qty */
export type DraftMap = Record<string, Record<string, Record<string, number>>>;

export const STANDARD_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"] as const;
/** The server refuses more than 500 of one line. */
export const MAX_LINE_QTY = 500;

export interface GridColor {
  key: string;
  name: string;
  hex: string | null;
}

export interface OrderGrid {
  hasVariants: boolean;
  colors: GridColor[];
  /** Sizes to offer. A product with no size choice has one entry: "". */
  sizes: readonly string[];
  isAvailable: (color: string, size: string) => boolean;
}

type GridProduct = Pick<PortalProduct, "variants" | "colors" | "status">;

/**
 * Colours and sizes a product can be ordered in — the same rules the server
 * prices by. Real Shopify variants win; a product without them falls back to
 * its colours × S–3XL (made to order). A product whose variants carry no size
 * (a tumbler in three colours, a single stainless tumbler) has no size column.
 */
export function orderGrid(product: GridProduct): OrderGrid {
  const variants = product.variants ?? [];
  const hasVariants = variants.length > 0 && variants.some((v) => (v.color ?? "") !== "" || (v.size ?? "") !== "");

  let colors: GridColor[];
  if (hasVariants) {
    const seen = new Set<string>();
    colors = [];
    for (const v of variants) {
      const name = v.color ?? "";
      if (seen.has(name)) continue;
      seen.add(name);
      colors.push({ key: name, name: name ? titleCase(name) : "One color", hex: product.colors?.find((c) => c.name.toLowerCase() === name.toLowerCase())?.hex ?? null });
    }
  } else if (product.colors?.length) {
    colors = product.colors.map((c) => ({ key: c.name, name: c.name, hex: c.hex }));
  } else {
    colors = [{ key: "", name: "One color", hex: null }];
  }

  let sizes: readonly string[] = STANDARD_SIZES;
  if (hasVariants) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of variants) {
      const s = v.size ?? "";
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    sizes = out.length ? out : [""];
  } else if (variants.length > 0) {
    // Shopify "Default Title" only: one thing, no options.
    sizes = [""];
  }

  const byCell = new Map<string, (typeof variants)[number]>();
  if (hasVariants) for (const v of variants) byCell.set(`${v.color ?? ""}|${v.size ?? ""}`, v);

  const isAvailable = (color: string, size: string) => {
    if (!hasVariants) return true;
    const v = byCell.get(`${color}|${size}`);
    // Archived pieces are made again from the design file: stock doesn't apply.
    if (product.status === "archived") return !!v;
    return !!v && v.available === true;
  };

  return { hasVariants, colors, sizes, isAvailable };
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface QuickTarget {
  color: string;
  size: string;
  label: string;
  available: boolean;
}

/**
 * What the compact row offers: the sizes of one colour — or, for a piece with
 * no sizes (a tumbler), its colours. Pure; exported for tests.
 */
export function quickTargets(product: GridProduct, color: string): QuickTarget[] {
  const g = orderGrid(product);
  const sized = !(g.sizes.length === 1 && g.sizes[0] === "");
  if (sized) {
    return g.sizes.map((s) => ({ color, size: s, label: s, available: g.isAvailable(color, s) }));
  }
  return g.colors.map((c) => ({ color: c.key, size: "", label: c.key ? c.name : "Add", available: g.isAvailable(c.key, "") }));
}

/** The grid colour that matches the colourway the card is showing. */
export function matchColor(product: GridProduct, lookLabel: string | null | undefined): string {
  const g = orderGrid(product);
  const want = (lookLabel ?? "").trim().toLowerCase();
  return (want && g.colors.find((c) => c.key.toLowerCase() === want || c.name.toLowerCase() === want)?.key) || g.colors[0]?.key || "";
}

/** Change one cell, dropping empty branches. Pure. */
export function setDraftQty(prev: DraftMap, productId: string, size: string, qty: number, color = ""): DraftMap {
  const q = Math.max(0, Math.min(MAX_LINE_QTY, Math.floor(qty || 0)));
  const next = { ...prev };
  const byColor = { ...(next[productId] ?? {}) };
  const sizes = { ...(byColor[color] ?? {}) };
  if (q <= 0) delete sizes[size];
  else sizes[size] = q;
  if (Object.keys(sizes).length === 0) delete byColor[color];
  else byColor[color] = sizes;
  if (Object.keys(byColor).length === 0) delete next[productId];
  else next[productId] = byColor;
  return next;
}

export function draftQty(draft: DraftMap, productId: string, size: string, color = ""): number {
  return draft[productId]?.[color]?.[size] ?? 0;
}

/** Units of one product in the cart (all colours and sizes). */
export function productUnits(draft: DraftMap, productId: string): number {
  let n = 0;
  for (const sizes of Object.values(draft[productId] ?? {})) for (const q of Object.values(sizes)) n += q > 0 ? q : 0;
  return n;
}

/** Cart → server order lines. Lines for products no longer in the locker are left out. */
export function draftToLines(draft: DraftMap, known?: Set<string>): OrderLineInput[] {
  const out: OrderLineInput[] = [];
  for (const [productId, byColor] of Object.entries(draft)) {
    if (known && !known.has(productId)) continue;
    for (const [color, sizes] of Object.entries(byColor)) {
      for (const [size, quantity] of Object.entries(sizes)) {
        if (quantity > 0) out.push({ productId, color: color || null, size: size || null, quantity });
      }
    }
  }
  return out;
}

/** Read a stored cart defensively: anything malformed is dropped. */
export function parseStoredDraft(raw: string | null): DraftMap {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    let out: DraftMap = {};
    for (const [pid, byColor] of Object.entries(v as Record<string, unknown>)) {
      if (!byColor || typeof byColor !== "object") continue;
      for (const [color, sizes] of Object.entries(byColor as Record<string, unknown>)) {
        if (!sizes || typeof sizes !== "object") continue;
        for (const [size, qty] of Object.entries(sizes as Record<string, unknown>)) {
          if (typeof qty === "number" && qty > 0) out = setDraftQty(out, pid, size, qty, color);
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

export const cartStorageKey = (athleteId: string) => `ax.portal.cart.${athleteId}`;

export interface ShipTo {
  name: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  country?: string;
  phone?: string;
}

/** Fields a net 30 order can't go without. Empty list = good to go. */
export function missingShipTo(s: Partial<ShipTo> | null | undefined): string[] {
  const need: Array<[keyof ShipTo, string]> = [["name", "Name"], ["address1", "Street"], ["city", "City"], ["province", "State"], ["zip", "ZIP"]];
  return need.filter(([k]) => !String(s?.[k] ?? "").trim()).map(([, label]) => label);
}

/** 5% off what's due, to the cent — the same sum the server makes. */
export function payNowPrice(amountDue: number, pct = 5): { discount: number; total: number } {
  const discount = Math.round(amountDue * pct) / 100;
  return { discount, total: Math.round((amountDue - discount) * 100) / 100 };
}

/** "Due Nov 24" style label for a net 30 date (YYYY-MM-DD). */
export function dueLabel(isoDate: string | null | undefined): string | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return null;
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `Due ${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}
