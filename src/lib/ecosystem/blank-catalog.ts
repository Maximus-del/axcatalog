// The blank catalogue: one record that knows what a blank is, what it looks
// like, what it costs, what we sell it for, and who is allowed to use it.
//
// Before this, four screens each held a piece — the blanks list, the photo
// importer, the pricing table, and availability — and none of them agreed
// about which was authoritative. There is only ever one blank row; everything
// else hangs off it.
//
// The one distinction worth defending: ACCESS and PRICE are separate axes.
// "Can an athlete use this hoodie?" is assortment membership. "What does an
// athlete pay for it?" is a pricing rule. A premium blank restricted to
// athletes and clients is still priced at every tier, and a blank in every
// assortment can still be priced differently per audience. Fold them together
// and one of those becomes impossible to say.
import { supabase } from "@/integrations/supabase/client";
import type { BlankAvailability } from "@/lib/blank-status";
import {
  DEFAULT_RULES, PRICE_FIELD, overrideFor, priceBlank, realisedMargin,
  type PriceTier, type PricingRule,
} from "@/lib/ecosystem/pricing";

export interface CatalogColor {
  id: string;
  color_name: string;
  hex_code: string | null;
  image_url: string | null;
  image_url_back: string | null;
  available: boolean;
  sort_order: number;
}

export interface Assortment {
  id: string;
  key: string;
  name: string;
  description: string | null;
  default_price_tier: PriceTier | null;
  sort_order: number;
  is_active: boolean;
}

export interface CatalogBlank {
  id: string;
  sku: string | null;
  style_number: string | null;
  name: string;
  brand: string | null;
  garment_type: string | null;
  fabric: string | null;
  fabric_specs: Record<string, unknown> | null;
  notes: string | null;
  url: string | null;
  availability_status: string | null;
  internal_only: boolean | null;
  sellable_as_blank: boolean | null;
  moq: number | null;
  blank_cost: number | string | null;
  decoration_cost: number | string | null;
  additional_cost: number | string | null;
  cost: number | string | null;
  /**
   * Hand-entered selling prices, the ones the old Pricing sheet writes.
   * These are OVERRIDES, not the source of truth: a blank with no override is
   * priced from cost and the tier's margin rule. Ignoring them would have made
   * the catalogue quietly disagree with numbers someone typed on purpose.
   */
  price_athlete: number | string | null;
  price_corporate: number | string | null;
  price_standard: number | string | null;
  colors: CatalogColor[];
  sizes: string[];
  /** Assortment keys this blank belongs to. */
  assortments: string[];
}

/** A blank with its money worked out — never stored, always derived. */
export interface PricedCatalogBlank extends CatalogBlank {
  trueCost: number | null;
  prices: Record<PriceTier, number | null>;
  margins: Record<PriceTier, number | null>;
  /** What the rule alone would charge, kept so an override can be compared to it. */
  computed: Record<PriceTier, number | null>;
  /** The hand-entered price per tier, or null where the rule is in charge. */
  overrides: Record<PriceTier, number | null>;
  hasOverride: boolean;
  /** Photography completeness, 0–100. */
  mediaPercent: number;
  mediaComplete: boolean;
  primaryImage: string | null;
}

// ---- Loading --------------------------------------------------------------

export async function loadAssortments(): Promise<Assortment[]> {
  const { data, error } = await supabase
    .from("blank_assortments" as never)
    .select("id, key, name, description, default_price_tier, sort_order, is_active")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as unknown as Assortment[];
}

export async function loadCatalog(): Promise<CatalogBlank[]> {
  const [blanksRes, itemsRes] = await Promise.all([
    supabase
      .from("blanks")
      .select(
        `id, sku, style_number, name, brand, vendor, supplier, garment_type, fabric, fabric_specs,
         notes, url, availability_status, internal_only, sellable_as_blank, moq,
         blank_cost, decoration_cost, additional_cost, cost,
         price_athlete, price_corporate, price_standard,
         blank_colors(id, color_name, hex_code, image_url, image_url_back, available, sort_order),
         blank_sizes(size, available, sort_order)`,
      )
      .order("sku", { nullsFirst: false }),
    supabase
      .from("blank_assortment_items" as never)
      .select("blank_id, assortment:blank_assortments(key)"),
  ]);
  if (blanksRes.error) throw blanksRes.error;

  // blank_id → assortment keys, built once rather than per row.
  const byBlank = new Map<string, string[]>();
  for (const row of (itemsRes.data ?? []) as unknown as {
    blank_id: string; assortment: { key: string } | { key: string }[] | null;
  }[]) {
    const a = Array.isArray(row.assortment) ? row.assortment[0] : row.assortment;
    if (!a?.key) continue;
    const list = byBlank.get(row.blank_id) ?? [];
    list.push(a.key);
    byBlank.set(row.blank_id, list);
  }

  return ((blanksRes.data ?? []) as unknown as (CatalogBlank & {
    vendor: string | null; supplier: string | null;
    blank_colors: CatalogColor[];
    blank_sizes: { size: string; available: boolean; sort_order: number }[];
  })[]).map((b) => ({
    ...b,
    brand: b.brand ?? b.vendor ?? b.supplier ?? null,
    colors: (b.blank_colors ?? []).slice().sort((x, y) => x.sort_order - y.sort_order),
    sizes: (b.blank_sizes ?? [])
      .filter((s) => s.available)
      .sort((x, y) => x.sort_order - y.sort_order)
      .map((s) => s.size),
    assortments: byBlank.get(b.id) ?? [],
  }));
}

// ---- Derivation -----------------------------------------------------------

const TIERS: PriceTier[] = ["standard", "athlete", "corporate"];

/** Photography is complete when every AVAILABLE colourway has front and back. */
export function mediaPercentOf(colors: CatalogColor[]): number {
  const live = colors.filter((c) => c.available);
  if (live.length === 0) return 0;
  const have = live.reduce((n, c) => n + (c.image_url ? 1 : 0) + (c.image_url_back ? 1 : 0), 0);
  return Math.round((have / (live.length * 2)) * 100);
}

export function primaryImageOf(colors: CatalogColor[]): string | null {
  return colors.find((c) => c.available && c.image_url)?.image_url
    ?? colors.find((c) => c.image_url)?.image_url
    ?? null;
}

export function priceCatalogBlank(
  b: CatalogBlank,
  rules: Record<PriceTier, PricingRule>,
): PricedCatalogBlank {
  const prices = {} as Record<PriceTier, number | null>;
  const margins = {} as Record<PriceTier, number | null>;
  const computed = {} as Record<PriceTier, number | null>;
  const overrides = {} as Record<PriceTier, number | null>;
  let trueCost: number | null = null;
  let hasOverride = false;

  for (const tier of TIERS) {
    const priced = priceBlank(b, rules[tier] ?? DEFAULT_RULES[tier]);
    trueCost = priced.cost;
    computed[tier] = priced.price;

    // A typed-in price wins over the rule, and the margin shown is the one that
    // price actually achieves — not the margin the rule was aiming for.
    const override = overrideFor(b, tier);
    overrides[tier] = override;
    if (override !== null) hasOverride = true;

    prices[tier] = override ?? priced.price;
    margins[tier] = override !== null ? realisedMargin(override, priced.cost) : priced.margin;
  }

  const mediaPercent = mediaPercentOf(b.colors);
  return {
    ...b,
    trueCost,
    prices,
    margins,
    computed,
    overrides,
    hasOverride,
    mediaPercent,
    mediaComplete: mediaPercent === 100,
    primaryImage: primaryImageOf(b.colors),
  };
}

// ---- Filtering ------------------------------------------------------------

export interface CatalogFilters {
  search?: string;
  /** garment_type values. */
  categories?: string[];
  /** Assortment keys — a blank matches if it is in ANY of them. */
  assortments?: string[];
  brands?: string[];
  /** "complete" | "missing" */
  media?: "complete" | "missing" | null;
  status?: "active" | "inactive" | null;
  /** Which side of the hidden line to show. Undefined shows both. */
  visibility?: "visible" | "hidden";
  /** Selling price at this tier must fall in the range. */
  priceTier?: PriceTier;
  maxPrice?: number | null;
  minPrice?: number | null;
  minMargin?: number | null;
}

export const EMPTY_FILTERS: CatalogFilters = {};

function haystack(b: CatalogBlank): string {
  return [b.name, b.sku, b.style_number, b.brand, b.garment_type, b.fabric]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Is this blank still on offer? `availability_status` is a vendor/stock fact,
 * completely separate from which assortments it sits in — a discontinued blank
 * can still be a member of the Athlete catalogue until someone removes it, and
 * that inconsistency is worth being able to SEE rather than hiding.
 */
export function isActive(b: CatalogBlank): boolean {
  const s = (b.availability_status ?? "").toLowerCase();
  // The real enum is in_stock | low_stock | out_of_stock | discontinued |
  // preorder. Only the last two mean "you cannot put this on a garment today":
  // low stock still ships and a preorder is a thing you can still sell.
  if (s === "") return true;
  return s !== "out_of_stock" && s !== "discontinued";
}

/**
 * Is this blank withheld from everything customer-facing?
 *
 * `internal_only` already meant exactly this and was already enforced in the
 * three places that matter — the public_catalog view, the public_catalog_colors
 * view, and the decoratable-blanks query behind design application. Hiding is
 * therefore a flag flip, not a new concept: the blank keeps its SKU, prices,
 * colourways, photos and assortment membership, and simply stops being offered.
 *
 * Deliberately NOT the same as assortment membership. Membership answers "which
 * audience gets this blank"; hidden answers "is this blank on offer at all". A
 * blank can sit in the athlete assortment and still be hidden, and un-hiding it
 * puts it straight back where it was rather than losing the curation.
 */
export function isHidden(b: CatalogBlank): boolean {
  return b.internal_only === true;
}

export function matchesFilters(b: PricedCatalogBlank, f: CatalogFilters): boolean {
  // Visibility is a tab, not a filter: undefined means "don't care", so every
  // existing caller keeps its behaviour.
  if (f.visibility === "visible" && isHidden(b)) return false;
  if (f.visibility === "hidden" && !isHidden(b)) return false;

  if (f.search?.trim()) {
    const q = f.search.trim().toLowerCase();
    if (!haystack(b).includes(q)) return false;
  }
  if (f.categories?.length && !f.categories.includes(b.garment_type ?? "")) return false;
  if (f.brands?.length && !f.brands.includes(b.brand ?? "")) return false;

  if (f.assortments?.length) {
    if (!f.assortments.some((k) => b.assortments.includes(k))) return false;
  }

  if (f.media === "complete" && !b.mediaComplete) return false;
  if (f.media === "missing" && b.mediaComplete) return false;

  if (f.status === "active" && !isActive(b)) return false;
  if (f.status === "inactive" && isActive(b)) return false;

  const tier = f.priceTier ?? "standard";
  const price = b.prices[tier];
  // An unpriced blank is excluded by a price filter rather than treated as
  // free — "under $30" should not surface things we don't know the cost of.
  if (f.minPrice != null && (price == null || price < f.minPrice)) return false;
  if (f.maxPrice != null && (price == null || price > f.maxPrice)) return false;

  if (f.minMargin != null) {
    const m = b.margins[tier];
    if (m == null || m < f.minMargin) return false;
  }

  return true;
}

export function activeFilterCount(f: CatalogFilters): number {
  let n = 0;
  if (f.search?.trim()) n += 1;
  if (f.categories?.length) n += 1;
  if (f.assortments?.length) n += 1;
  if (f.brands?.length) n += 1;
  if (f.media) n += 1;
  if (f.status) n += 1;
  if (f.minPrice != null || f.maxPrice != null) n += 1;
  if (f.minMargin != null) n += 1;
  return n;
}

/** Distinct values present in the catalogue, for building filter controls. */
export function facetsOf(blanks: CatalogBlank[]): {
  categories: string[];
  brands: string[];
} {
  const categories = new Set<string>();
  const brands = new Set<string>();
  for (const b of blanks) {
    if (b.garment_type) categories.add(b.garment_type);
    if (b.brand) brands.add(b.brand);
  }
  return {
    categories: [...categories].sort(),
    brands: [...brands].sort(),
  };
}

export function prettyCategory(value: string | null): string {
  if (!value) return "Other";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Group blanks by category for the assortment detail sections. */
export function groupByCategory<T extends CatalogBlank>(blanks: T[]): { category: string; blanks: T[] }[] {
  const map = new Map<string, T[]>();
  for (const b of blanks) {
    const key = b.garment_type ?? "other";
    const list = map.get(key) ?? [];
    list.push(b);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([category, list]) => ({ category, blanks: list }))
    .sort((a, z) => a.category.localeCompare(z.category));
}

// ---- Assortment membership ------------------------------------------------

export async function addToAssortment(assortmentId: string, blankIds: string[]): Promise<void> {
  if (blankIds.length === 0) return;
  const { error } = await supabase.from("blank_assortment_items" as never).upsert(
    blankIds.map((blank_id, i) => ({ assortment_id: assortmentId, blank_id, sort_order: i })) as never,
    { onConflict: "assortment_id,blank_id" },
  );
  if (error) throw error;
}

export async function removeFromAssortment(assortmentId: string, blankIds: string[]): Promise<void> {
  if (blankIds.length === 0) return;
  const { error } = await supabase
    .from("blank_assortment_items" as never)
    .delete()
    .eq("assortment_id", assortmentId)
    .in("blank_id", blankIds);
  if (error) throw error;
}

export async function createAssortment(input: {
  organization_id: string;
  name: string;
  key?: string;
  description?: string | null;
  default_price_tier?: PriceTier | null;
}): Promise<string> {
  const key = (input.key ?? input.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const { data, error } = await supabase
    .from("blank_assortments" as never)
    .insert({
      organization_id: input.organization_id,
      key,
      name: input.name.trim(),
      description: input.description ?? null,
      default_price_tier: input.default_price_tier ?? null,
      sort_order: 99,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

/**
 * availability_status is a Postgres enum, so an invented value is rejected by
 * the database rather than stored. Callers must pass a BlankAvailability —
 * "active" is not one of them, however natural it reads.
 */
export async function setAvailability(blankIds: string[], status: BlankAvailability): Promise<void> {
  if (blankIds.length === 0) return;
  const { error } = await supabase
    .from("blanks" as never)
    .update({ availability_status: status } as never)
    .in("id", blankIds);
  if (error) throw error;
}

/**
 * Take blanks off offer, or put them back.
 *
 * Nothing else is touched — prices, colourways, photography and assortment
 * membership all survive, so un-hiding restores exactly what was there rather
 * than leaving you to rebuild it. This is why hiding is a separate flag from
 * emptying an assortment.
 */
export async function setHidden(blankIds: string[], hidden: boolean): Promise<void> {
  if (blankIds.length === 0) return;
  const { error } = await supabase
    .from("blanks" as never)
    .update({ internal_only: hidden } as never)
    .in("id", blankIds);
  if (error) throw error;
}

/**
 * Set or clear one hand-entered price. Passing null hands the tier back to the
 * margin rule rather than pricing the blank at zero.
 */
export async function setPriceOverride(
  blankId: string,
  tier: PriceTier,
  value: number | null,
): Promise<void> {
  const { error } = await supabase
    .from("blanks" as never)
    .update({ [PRICE_FIELD[tier]]: value } as never)
    .eq("id", blankId);
  if (error) throw error;
}

/**
 * Bulk pricing from the selection. Two honest operations only:
 *
 *   "computed" — drop the overrides so these blanks follow the margin rule,
 *   "fixed"    — pin every selected blank to one price at one tier.
 *
 * Deliberately not offered: a bulk margin edit. Margin lives on the rule, and a
 * per-blank copy of it would be a second source of truth for the same number.
 */
export async function bulkPrice(
  blanks: PricedCatalogBlank[],
  tiers: PriceTier[],
  mode: "computed" | "fixed",
  fixed?: number | null,
): Promise<number> {
  if (blanks.length === 0 || tiers.length === 0) return 0;
  const patch: Record<string, number | null> = {};
  for (const tier of tiers) {
    patch[PRICE_FIELD[tier]] = mode === "computed" ? null : (fixed ?? null);
  }
  const { error } = await supabase
    .from("blanks" as never)
    .update(patch as never)
    .in("id", blanks.map((b) => b.id));
  if (error) throw error;
  return blanks.length;
}

// ---- Preview As -----------------------------------------------------------

export interface AudiencePreview {
  assortment: Assortment;
  tier: PriceTier;
  blanks: PricedCatalogBlank[];
}

/**
 * Exactly what one audience can choose from, and what they'd pay.
 *
 * Reads membership for the "can", and the assortment's default tier for the
 * "how much" — the two axes meeting only at the point of display, which is the
 * only place they should meet.
 */
export function previewFor(
  assortment: Assortment,
  blanks: PricedCatalogBlank[],
): AudiencePreview {
  const tier = assortment.default_price_tier ?? "standard";
  return {
    assortment,
    tier,
    blanks: blanks.filter((b) => b.assortments.includes(assortment.key) && isActive(b)),
  };
}
