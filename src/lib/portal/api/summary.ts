// GET /summary — the Locker Room and Brand HQ numbers.
//
// Four sources, each authoritative for its own number:
//   credit      athlete_credit_wallets (existing credit rules; never derived from revenue)
//   revenue     portal_revenue_summary() — aggregates of Shopify order lines
//               attributed to the athlete's organisation, scoped server-side
//   products    product_athletes × products.status = 'published'
//   community   athlete_access_summary()
// A source that fails returns null for its fields, not zero: null means
// unknown, zero means known to be zero.

import { supabase } from "@/integrations/supabase/client";
import type { Money, PortalScope, Summary } from "./contract";
import { money, isMissingFunction, toApiError } from "./money";
import { lastMonths, monthKeys, type Period } from "./period";

export interface RevenueMonth {
  month: string;
  gross: Money | null;
  refundFlagged: Money | null;
}

export interface RevenueReport {
  attributable: boolean;
  currency: string | null;
  asOf: string | null;
  basisNote: string | null;
  lifetime: { gross: Money | null; refundFlagged: Money | null; orders: number | null; units: number | null } | null;
  period: { gross: Money | null; refundFlagged: Money | null; orders: number | null } | null;
  /** Every month in the period, zero months included, oldest first. */
  monthly: RevenueMonth[];
  topProducts: { title: string; units: number; gross: Money | null }[];
}

type Json = Record<string, unknown>;
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Pure: the RPC's JSON → typed report. Exported for tests. */
export function parseRevenue(raw: unknown, period: Period | null): RevenueReport {
  const r = (raw ?? {}) as Json;
  if (r.attributable !== true) {
    return { attributable: false, currency: null, asOf: null, basisNote: null, lifetime: null, period: null, monthly: [], topProducts: [] };
  }
  const currency = typeof r.currency === "string" ? r.currency : null; // null when mixed currencies
  const m = (v: unknown) => (currency ? money(v, currency) : null);
  const life = (r.lifetime ?? {}) as Json;
  const per = r.period as Json | null;
  const byMonth = new Map<string, Json>();
  for (const row of (Array.isArray(r.monthly) ? r.monthly : []) as Json[]) {
    if (typeof row.month === "string") byMonth.set(row.month, row);
  }
  const keys = period ? monthKeys(period) : [...byMonth.keys()].sort();
  return {
    attributable: true,
    currency,
    asOf: typeof r.as_of === "string" ? r.as_of : null,
    basisNote: typeof r.basis_note === "string" ? r.basis_note : null,
    lifetime: { gross: m(life.gross), refundFlagged: m(life.refund_flagged), orders: num(life.orders), units: num(life.units) },
    period: per ? { gross: m(per.gross), refundFlagged: m(per.refund_flagged), orders: num(per.orders) } : null,
    monthly: keys.map((k) => ({
      month: k,
      gross: m(byMonth.get(k)?.gross ?? 0),
      refundFlagged: m(byMonth.get(k)?.refund_flagged ?? 0),
    })),
    topProducts: ((Array.isArray(r.top_products) ? r.top_products : []) as Json[]).map((t) => ({
      title: String(t.title ?? ""),
      units: num(t.units) ?? 0,
      gross: m(t.gross),
    })),
  };
}

/**
 * Revenue for a scope and period. Returns null (not zero) when the server
 * function is not deployed yet, so the UI shows "unavailable" rather than $0.
 */
export async function fetchRevenue(scope: PortalScope, period: Period | null): Promise<RevenueReport | null> {
  const { data, error } = await supabase.rpc("portal_revenue_summary" as never, {
    _athlete_id: scope.athleteId,
    _from: period?.from ?? null,
    _to: period?.to ?? null,
    _time_zone: period?.timeZone ?? "UTC",
  } as never);
  if (error) {
    if (isMissingFunction(error)) return null;
    throw toApiError(error);
  }
  return parseRevenue(data, period);
}

async function fetchCredit(scope: PortalScope): Promise<Money | null> {
  const { data, error } = await supabase
    .from("athlete_credit_wallets")
    .select("balance")
    .eq("athlete_id", scope.athleteId)
    .maybeSingle();
  if (error || !data) return null;
  return money((data as { balance: unknown }).balance, "USD");
}

async function fetchLiveProducts(scope: PortalScope): Promise<number | null> {
  const { count, error } = await supabase
    .from("product_athletes")
    .select("product_id, products!inner(status)", { count: "exact", head: true })
    .eq("athlete_id", scope.athleteId)
    .eq("products.status", "published");
  return error ? null : (count ?? 0);
}

async function fetchCommunity(scope: PortalScope): Promise<{ followers: number | null; access: number | null; vip: number | null }> {
  const { data, error } = await supabase.rpc("athlete_access_summary" as never, { _athlete_id: scope.athleteId } as never);
  if (error || !data) return { followers: null, access: null, vip: null };
  const row = (Array.isArray(data) ? data[0] : data) as Json | undefined;
  return { followers: num(row?.followers), access: num(row?.access), vip: num(row?.vip) };
}

/** Default reporting window: the last 12 calendar months in the viewer's zone. */
export function defaultSummaryPeriod(timeZone: string, now = new Date()): Period {
  return lastMonths(12, timeZone, now);
}

export async function fetchSummary(scope: PortalScope, period: Period): Promise<Summary> {
  const [revenue, credit, live, community] = await Promise.all([
    fetchRevenue(scope, period).catch(() => null),
    fetchCredit(scope),
    fetchLiveProducts(scope),
    fetchCommunity(scope),
  ]);
  return summaryFrom({ revenue, credit, live, community, period });
}

/** Pure assembly, exported for tests. */
export function summaryFrom(input: {
  revenue: RevenueReport | null;
  credit: Money | null;
  live: number | null;
  community: { followers: number | null; access: number | null; vip: number | null };
  period: Period;
  now?: Date;
}): Summary {
  const { revenue, credit, live, community, period } = input;
  const attributable = revenue?.attributable ?? false;
  return {
    creditBalance: credit,
    lifetimeRevenue: attributable ? (revenue?.lifetime?.gross ?? null) : null,
    ordersCount: attributable ? (revenue?.lifetime?.orders ?? null) : null,
    liveProductsCount: live,
    attributedRevenue: attributable ? (revenue?.period?.gross ?? null) : null,
    period: { from: period.from, to: period.to, timeZone: period.timeZone },
    asOf: revenue?.asOf ?? (input.now ?? new Date()).toISOString(),
    revenueBasis: "gross",
    refundFlaggedRevenue: attributable ? (revenue?.lifetime?.refundFlagged ?? null) : null,
    revenueAttributable: attributable,
    followers: community.followers,
    accessMembers: community.access,
    vipMembers: community.vip,
  };
}
