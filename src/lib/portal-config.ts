// Reusable, athlete-agnostic configuration + models for the Player Portal.
//
// IMPORTANT: nothing here is hard-coded to a specific athlete. Tier
// thresholds, package definitions, dynamic cards, and quick actions are
// placeholder config that AX can later drive from the backend. Integration
// points are marked with `BACKEND:` comments.

export type PortalActionKey =
  | "shop"
  | "order_gear"
  | "get_code"
  | "start_design"
  | "game_day_builder"
  | "camp_builder"
  | "vip_order"
  | "view_credit"
  | "build_camp";

/* ------------------------------------------------------------------ */
/* Athlete tiers                                                       */
/* ------------------------------------------------------------------ */

export interface AthleteTier {
  level: number;
  name: string;
  /** Lifetime revenue (USD) at which this tier begins. */
  minRevenue: number;
  /** Short list of unlocks — display only for now. */
  perks: string[];
}

// BACKEND: replace with tiers configured per-org in Supabase.
export const ATHLETE_TIERS: AthleteTier[] = [
  { level: 1, name: "Rookie", minRevenue: 0, perks: ["Standard pricing", "$1 credit / $10 spent"] },
  { level: 2, name: "All-Pro", minRevenue: 5000, perks: ["Better pricing", "Priority samples"] },
  { level: 3, name: "All-Star", minRevenue: 15000, perks: ["Faster turnaround", "Exclusive blanks"] },
  { level: 4, name: "Franchise", minRevenue: 40000, perks: ["Best bulk pricing", "Dedicated support"] },
  { level: 5, name: "Legend", minRevenue: 100000, perks: ["Top pricing", "Custom drops"] },
];

export interface TierProgress {
  current: AthleteTier;
  next: AthleteTier | null;
  /** 0–100 progress toward the next tier. */
  progressPct: number;
  /** Dollars remaining until the next tier (0 at max). */
  untilNext: number;
  /** e.g. "Level 2 — All-Pro". */
  label: string;
}

export function getTierProgress(lifetimeRevenue: number): TierProgress {
  const rev = Math.max(0, lifetimeRevenue);
  const sorted = [...ATHLETE_TIERS].sort((a, b) => a.minRevenue - b.minRevenue);
  let current = sorted[0];
  for (const t of sorted) if (rev >= t.minRevenue) current = t;
  const next = sorted.find((t) => t.minRevenue > current.minRevenue) ?? null;

  let progressPct = 100;
  let untilNext = 0;
  if (next) {
    const span = next.minRevenue - current.minRevenue;
    progressPct = span > 0 ? Math.min(100, Math.max(0, ((rev - current.minRevenue) / span) * 100)) : 0;
    untilNext = Math.max(0, next.minRevenue - rev);
  }
  return {
    current,
    next,
    progressPct,
    untilNext,
    label: `Level ${current.level} — ${current.name}`,
  };
}

/* ------------------------------------------------------------------ */
/* Packages                                                            */
/* ------------------------------------------------------------------ */

export interface PortalPackage {
  key: "game_day" | "camp" | "vip";
  name: string;
  tagline: string;
  description: string;
  cta: string;
  action: PortalActionKey;
}

// BACKEND: could later be per-org / per-athlete package templates.
export const PORTAL_PACKAGES: PortalPackage[] = [
  {
    key: "game_day",
    name: "Game Day",
    tagline: "Your number. Your name.",
    description: "Personalized gear with your number and name.",
    cta: "Order",
    action: "game_day_builder",
  },
  {
    key: "camp",
    name: "Camp",
    tagline: "Bulk pricing for events.",
    description: "Bulk merchandise for football camps & events.",
    cta: "Build",
    action: "camp_builder",
  },
  {
    key: "vip",
    name: "VIP",
    tagline: "For your circle.",
    description: "Gear for family, friends, agents & guests.",
    cta: "Order",
    action: "vip_order",
  },
];

/* ------------------------------------------------------------------ */
/* Dynamic action card                                                */
/* ------------------------------------------------------------------ */

export interface DynamicActionCard {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  action: PortalActionKey;
}

// BACKEND: the active card should eventually be selected server-side
// (game this week, new products, samples arrived, holiday gifting, etc.).
export const DEFAULT_ACTION_CARD: DynamicActionCard = {
  id: "camp-season",
  eyebrow: "Camp Season",
  title: "Planning a football camp?",
  body: "Unlock athlete bulk pricing when ordering 50+ pieces.",
  ctaLabel: "Build Camp Package",
  action: "build_camp",
};

/* ------------------------------------------------------------------ */
/* Quick actions                                                       */
/* ------------------------------------------------------------------ */

export interface QuickAction {
  key: "shop" | "order_gear" | "get_code" | "start_design";
  label: string;
  action: PortalActionKey;
}

export const QUICK_ACTIONS: QuickAction[] = [
  { key: "shop", label: "Shop", action: "shop" },
  { key: "order_gear", label: "Order Gear", action: "order_gear" },
  { key: "get_code", label: "Get Code", action: "get_code" },
  { key: "start_design", label: "Start Design", action: "start_design" },
];

export function fmtUsd(n: number, opts: { cents?: boolean } = {}): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
}
