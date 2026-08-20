// Cost + margin pricing.
//
// A price is computed, not typed in. The catalogue stores what a garment
// actually costs and one margin rule per tier; every shelf price falls out of
// that. The point is that when a supplier raises a blank by $1.40 you change
// one number, not forty-eight — and nothing silently keeps selling at last
// season's margin.
//
// Defaults live in code so an org with no rules still prices correctly, the
// same arrangement used for system prompts.
import { supabase } from "@/integrations/supabase/client";

export type PriceTier = "standard" | "athlete" | "corporate";

export const PRICE_TIERS: { tier: PriceTier; label: string; blurb: string }[] = [
  { tier: "standard", label: "Standard", blurb: "Public storefront price." },
  { tier: "athlete", label: "Athlete", blurb: "What an athlete's own store pays." },
  { tier: "corporate", label: "Corporate", blurb: "Bulk and team orders." },
];

export interface PricingRule {
  tier: PriceTier;
  /** Gross margin ON THE SELLING PRICE, not a markup on cost. */
  margin: number;
  /** Round the computed price up to this increment. */
  round_to: number;
  /** Subtracted after rounding — 0.01 turns 45.00 into 44.99. */
  charm_offset: number;
  min_price: number | null;
}

/**
 * Margin, not markup. 55% margin on a $18 blank is $40, whereas a 55% markup
 * would be $27.90 — confusing the two is the classic way to price a catalogue
 * into losing money, so the field name says which one it is.
 */
export const DEFAULT_RULES: Record<PriceTier, PricingRule> = {
  standard: { tier: "standard", margin: 0.6, round_to: 1, charm_offset: 0, min_price: 20 },
  athlete: { tier: "athlete", margin: 0.5, round_to: 1, charm_offset: 0, min_price: 15 },
  corporate: { tier: "corporate", margin: 0.42, round_to: 0.5, charm_offset: 0, min_price: 12 },
};

export interface CostInput {
  blank_cost?: number | string | null;
  decoration_cost?: number | string | null;
  additional_cost?: number | string | null;
  /** Legacy single-field cost, used only when the itemised ones are absent. */
  cost?: number | string | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * What one unit actually costs to put in a box.
 *
 * The itemised fields win when any of them is set; `cost` is the older single
 * field and is only a fallback, so importing a vendor sheet into blank_cost
 * doesn't silently double-count.
 */
export function trueCostOf(b: CostInput): number | null {
  const parts = [num(b.blank_cost), num(b.decoration_cost), num(b.additional_cost)];
  if (parts.some((p) => p !== null)) {
    return parts.reduce<number>((sum, p) => sum + (p ?? 0), 0);
  }
  return num(b.cost);
}

/** Round up to the rule's increment, then apply the charm ending. */
export function roundPrice(value: number, rule: Pick<PricingRule, "round_to" | "charm_offset">): number {
  const step = rule.round_to > 0 ? rule.round_to : 1;
  // 18 / (1 - 0.55) is 40.00000000000001 in binary floating point, and a naive
  // ceil turns that into 41 — a whole dollar of phantom margin on every price
  // that lands exactly on the increment. Absorb the error before rounding.
  const rounded = Math.ceil(value / step - 1e-9) * step;
  const withCharm = rounded - (rule.charm_offset ?? 0);
  // Two decimals, and never let a charm offset push a price below zero.
  return Math.max(0, Math.round(withCharm * 100) / 100);
}

/**
 * Selling price for a cost at a given rule. Returns null when cost is unknown
 * rather than inventing a number — a blank with no cost should look unpriced,
 * not free.
 */
export function priceFrom(cost: number | null, rule: PricingRule): number | null {
  if (cost === null || !Number.isFinite(cost)) return null;
  if (rule.margin >= 1) return null;
  const raw = cost / (1 - rule.margin);
  const priced = roundPrice(raw, rule);
  if (rule.min_price !== null && priced < rule.min_price) {
    return roundPrice(rule.min_price, { round_to: 0.01, charm_offset: 0 });
  }
  return priced;
}

/** The margin actually achieved once rounding and the floor have had their say. */
export function realisedMargin(price: number | null, cost: number | null): number | null {
  if (price === null || cost === null || price <= 0) return null;
  return (price - cost) / price;
}

export function profitOf(price: number | null, cost: number | null): number | null {
  if (price === null || cost === null) return null;
  return Math.round((price - cost) * 100) / 100;
}

export interface PricedBlank {
  cost: number | null;
  price: number | null;
  profit: number | null;
  margin: number | null;
}

export function priceBlank(b: CostInput, rule: PricingRule): PricedBlank {
  const cost = trueCostOf(b);
  const price = priceFrom(cost, rule);
  return { cost, price, profit: profitOf(price, cost), margin: realisedMargin(price, cost) };
}

export function formatMoney(v: number | null): string {
  return v === null ? "—" : `$${v.toFixed(2)}`;
}

export function formatPercent(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)}%`;
}

// ---- Rules storage --------------------------------------------------------

let cache: Promise<Record<PriceTier, PricingRule>> | null = null;

export function invalidatePricingRules(): void {
  cache = null;
}

export async function loadPricingRules(organizationId: string): Promise<Record<PriceTier, PricingRule>> {
  if (cache) return cache;
  cache = (async () => {
    const { data, error } = await supabase
      .from("pricing_rules" as never)
      .select("tier, margin, round_to, charm_offset, min_price")
      .eq("organization_id", organizationId);
    // A rules read failing must not make the catalogue look unpriced.
    if (error || !data) return { ...DEFAULT_RULES };

    const merged = { ...DEFAULT_RULES };
    for (const row of data as unknown as PricingRule[]) {
      if (!merged[row.tier]) continue;
      merged[row.tier] = {
        tier: row.tier,
        margin: Number(row.margin),
        round_to: Number(row.round_to),
        charm_offset: Number(row.charm_offset),
        min_price: row.min_price === null ? null : Number(row.min_price),
      };
    }
    return merged;
  })();
  return cache;
}

export async function savePricingRule(organizationId: string, rule: PricingRule): Promise<void> {
  const { error } = await supabase.from("pricing_rules" as never).upsert(
    {
      organization_id: organizationId,
      tier: rule.tier,
      margin: rule.margin,
      round_to: rule.round_to,
      charm_offset: rule.charm_offset,
      min_price: rule.min_price,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "organization_id,tier" },
  );
  if (error) throw error;
  invalidatePricingRules();
}
