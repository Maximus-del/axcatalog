// Shared types for the ecosystem consumer (fan) layer.
// These map to the new public views (public_athletes, public_athlete_products)
// and the new tables (fan_profiles, athlete_follows, membership_plans,
// subscriptions). Kept in one place so every fan surface reads the same shapes.

export type FollowState = "following" | "subscriber" | "vip" | "former" | "blocked";
export type MembershipTier = "follow" | "access" | "vip";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "expired";

/** Row from the public_athletes view — safe, public-facing columns only. */
export interface PublicAthlete {
  id: string;
  slug: string;
  full_name: string | null;
  first_name: string;
  last_name: string;
  position: string | null;
  jersey_number: string | null;
  league: string | null;
  organization_id: string;
  org_name: string;
  org_slug: string;
  org_type: string;
  team_name: string | null;
  team_slug: string | null;
  image_url: string | null;
}

/** Row from the public_athlete_products view. */
export interface PublicAthleteProduct {
  id: string;
  title: string;
  slug: string | null;
  description: string | null;
  price: number | null;
  compare_at_price: number | null;
  shopify_handle: string | null;
  athlete_id: string;
  athlete_role: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
  image_bucket: string | null;
  image_path: string | null;
  access_date?: string | null;
  public_date?: string | null;
  drop_date?: string | null;
}

export interface FanProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AthleteFollowRow {
  id: string;
  fan_user_id: string;
  athlete_id: string;
  state: FollowState;
  created_at: string;
  updated_at: string;
}

export interface MembershipPlan {
  id: string;
  organization_id: string;
  athlete_id: string | null;
  tier: MembershipTier;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  benefits: unknown;
  is_active: boolean;
  sort_order: number;
}

/** Display name for an athlete, falling back to first + last. */
export function athleteName(a: Pick<PublicAthlete, "full_name" | "first_name" | "last_name">): string {
  return (a.full_name && a.full_name.trim()) || `${a.first_name} ${a.last_name}`.trim();
}

/** Initials for avatar placeholders. */
export function athleteInitials(a: Pick<PublicAthlete, "full_name" | "first_name" | "last_name">): string {
  const name = athleteName(a);
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "AX";
}
