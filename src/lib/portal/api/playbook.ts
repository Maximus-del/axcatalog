// Brand HQ playbook — the live numbers behind the client one-pagers.
//
// One RPC (portal_brand_playbook) returns every figure a one-pager quotes, all
// derived from the data that drives ordering, so a page can never promise a
// different number than the order sheet charges. Everything below the fetch is
// pure and tested; the pages themselves only lay these results out.
//
// Nothing here is client-specific: every client on the world shell gets the
// same pages filled with their own numbers. Terms that AX has not agreed with a
// client yet (their revenue share) are null and the page says so, never guesses.

import { supabase } from "@/integrations/supabase/client";
import { ATHLETE_TIERS, getTierProgress, type TierProgress } from "@/lib/portal-config";
import type { PortalScope } from "./contract";
import { toApiError } from "./money";

type Json = Record<string, unknown>;

export interface VolumeBreak {
  minUnits: number;
  percent: number;
}

export interface BulkSample {
  kind: "tee" | "hoodie";
  productId: string;
  title: string;
  /** Store price a fan pays. */
  retail: number | null;
  /** What the client pays per unit on a bulk order (before volume discount). */
  athleteUnit: number;
  /** The standard bulk price it is compared against. */
  compareUnit: number;
}

export interface Playbook {
  terms: {
    revenueSharePercent: number | null;
    payoutSchedule: string | null;
    note: string | null;
    /** What the share is taken from: the gross sale (default) or profit after cost. */
    splitBasis: "gross" | "profit";
    /** How the client pays for orders (Zelle / invoice), shown on order confirmations. */
    paymentInstructions: string | null;
  } | null;
  volumeBreaks: VolumeBreak[];
  rushSurcharge: number;
  bulkSamples: BulkSample[];
  credit: { balance: number; monthly: number; max: number } | null;
  /** The client's own referral code. `live` = approved by AX and redeemable. */
  code: { code: string; live: boolean; fanDiscountPercent: number | null; commissionPercent: number | null } | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Pure: RPC JSON → Playbook. Exported for tests. */
export function parsePlaybook(raw: unknown): Playbook {
  const r = (raw ?? {}) as Json;
  const terms = r.terms as Json | null | undefined;
  const credit = r.credit as Json | null | undefined;
  const code = r.code as Json | null | undefined;
  return {
    terms: terms
      ? {
          revenueSharePercent: num(terms.revenueSharePercent),
          payoutSchedule: typeof terms.payoutSchedule === "string" && terms.payoutSchedule.trim() ? terms.payoutSchedule : null,
          note: typeof terms.note === "string" && terms.note.trim() ? terms.note : null,
          splitBasis: terms.splitBasis === "profit" ? "profit" : "gross",
          paymentInstructions:
            typeof terms.paymentInstructions === "string" && terms.paymentInstructions.trim() ? terms.paymentInstructions : null,
        }
      : null,
    volumeBreaks: ((Array.isArray(r.volumeBreaks) ? r.volumeBreaks : []) as Json[])
      .map((b) => ({ minUnits: num(b.minUnits) ?? 0, percent: num(b.percent) ?? 0 }))
      .filter((b) => b.minUnits > 0 && b.percent > 0)
      .sort((a, b) => a.minUnits - b.minUnits),
    rushSurcharge: num(r.rushSurcharge) ?? 0,
    bulkSamples: ((Array.isArray(r.bulkSamples) ? r.bulkSamples : []) as Json[])
      .filter((s) => s.kind === "tee" || s.kind === "hoodie")
      .map((s) => ({
        kind: s.kind as "tee" | "hoodie",
        productId: String(s.productId),
        title: String(s.title ?? ""),
        retail: num(s.retail),
        athleteUnit: num(s.athleteUnit) ?? 0,
        compareUnit: num(s.compareUnit) ?? 0,
      }))
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "tee" ? -1 : 1)),
    credit: credit
      ? { balance: num(credit.balance) ?? 0, monthly: num(credit.monthly) ?? 0, max: num(credit.max) ?? 0 }
      : null,
    code: code && typeof code.code === "string"
      ? {
          code: code.code,
          live: code.live === true,
          fanDiscountPercent: num(code.fanDiscountPercent),
          commissionPercent: num(code.commissionPercent),
        }
      : null,
  };
}

export async function fetchPlaybook(scope: PortalScope): Promise<Playbook> {
  const { data, error } = await supabase.rpc("portal_brand_playbook" as never, { _athlete_id: scope.athleteId } as never);
  if (error) throw toApiError(error);
  return parsePlaybook(data);
}

// ------------------------------------------------------------- the maths

const cents = (n: number) => Math.round(n * 100) / 100;

/** The volume discount for a unit count — the same ladder portal_quote_order applies. */
export function discountFor(units: number, breaks: VolumeBreak[]): number {
  let pct = 0;
  for (const b of breaks) if (units >= b.minUnits && b.percent > pct) pct = b.percent;
  return pct;
}

/** What `units` of one product cost on a bulk order, and what that saves. */
export function bulkCost(sample: Pick<BulkSample, "athleteUnit" | "compareUnit">, units: number, breaks: VolumeBreak[]) {
  const percent = discountFor(units, breaks);
  const total = cents(sample.athleteUnit * units * (1 - percent / 100));
  const standard = cents(sample.compareUnit * units);
  return { units, percent, total, perUnit: units > 0 ? cents(total / units) : 0, standard, saved: cents(standard - total) };
}

/**
 * Selling bulk gear yourself (events, camps, your own table): buy at your bulk
 * price, sell at the store price, keep the difference. Null when the product
 * has no store price.
 */
export function resaleExample(sample: BulkSample, units: number, breaks: VolumeBreak[]) {
  if (sample.retail == null) return null;
  const cost = bulkCost(sample, units, breaks);
  const revenue = cents(sample.retail * units);
  return { ...cost, retail: sample.retail, revenue, profit: cents(revenue - cost.total) };
}

/** What a client earns from store sales at their agreed share. Null until AX sets the share. */
/**
 * What a client earns from store sales. Gross: their share of retail. Profit:
 * their share of (retail − their own cost per unit), which they can see — it is
 * their bulk price, not AX's private cost. Null until AX sets the share.
 */
export function storeShareExample(
  retail: number | null,
  sharePercent: number | null,
  units = 100,
  opts: { basis?: "gross" | "profit"; clientCost?: number | null } = {},
) {
  if (retail == null || sharePercent == null) return null;
  if (opts.basis === "profit") {
    if (opts.clientCost == null) return null;
    const profit = cents(retail - opts.clientCost);
    const perUnit = cents(Math.max(0, profit) * (sharePercent / 100));
    return { units, gross: cents(retail * units), profitPerUnit: profit, perUnit, earned: cents(perUnit * units) };
  }
  const gross = cents(retail * units);
  return { units, gross, profitPerUnit: null as number | null, earned: cents(gross * (sharePercent / 100)), perUnit: cents(retail * (sharePercent / 100)) };
}

/** What fans save and the client earns when fans spend `fanSpend` with the code. */
export function codeExample(code: Playbook["code"], fanSpend = 1000) {
  if (!code || code.commissionPercent == null) return null;
  return {
    fanSpend,
    fanSaves: code.fanDiscountPercent == null ? null : cents(fanSpend * (code.fanDiscountPercent / 100)),
    earned: cents(fanSpend * (code.commissionPercent / 100)),
  };
}

/** Months until the credit wallet is full, at the monthly rate. Null when it never fills or already is. */
export function monthsToFullCredit(credit: Playbook["credit"]): number | null {
  if (!credit || credit.monthly <= 0 || credit.balance >= credit.max) return null;
  return Math.ceil((credit.max - credit.balance) / credit.monthly);
}

/** The tier ladder with this client's position on it. */
export function levelLadder(lifetimeRevenue: number | null): { progress: TierProgress | null; tiers: typeof ATHLETE_TIERS } {
  return { progress: lifetimeRevenue == null ? null : getTierProgress(lifetimeRevenue), tiers: ATHLETE_TIERS };
}

export const usd = (n: number | null | undefined, opts: { cents?: boolean } = {}) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: opts.cents ?? n % 1 !== 0 ? 2 : 0,
        maximumFractionDigits: opts.cents ?? n % 1 !== 0 ? 2 : 0,
      }).format(n);
