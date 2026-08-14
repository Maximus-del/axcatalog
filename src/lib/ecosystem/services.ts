// ─────────────────────────────────────────────────────────────────────────
// FAN DATA SERVICE LAYER
// This is the ONLY module that reads fan-facing data from Supabase. Every hook
// and page goes through these functions. To move to a real API / server-side
// ranking / pagination later, change ONLY this file — the UI never changes.
//
// BACKEND: today these read the public_athletes / public_athlete_products
// views (safe column allow-lists). `limit` params exist so pagination and
// server-side discovery ranking can drop in without touching components.
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";
import type { PublicAthlete, PublicAthleteProduct } from "./types";

const ATHLETE_COLS =
  "id, slug, full_name, first_name, last_name, position, jersey_number, league, organization_id, org_name, org_slug, org_type, team_name, team_slug, image_url";
const PRODUCT_COLS =
  "id, title, slug, description, price, compare_at_price, shopify_handle, athlete_id, athlete_role, organization_id, created_at, updated_at, image_bucket, image_path";

export async function fetchAthletes(limit = 500): Promise<PublicAthlete[]> {
  const { data, error } = await supabase
    .from("public_athletes" as never)
    .select(ATHLETE_COLS)
    .order("full_name", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PublicAthlete[];
}

export async function fetchAthleteBySlug(slug: string): Promise<PublicAthlete | null> {
  const { data, error } = await supabase
    .from("public_athletes" as never)
    .select(ATHLETE_COLS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PublicAthlete | null) ?? null;
}

export async function fetchAthleteProducts(athleteId: string): Promise<PublicAthleteProduct[]> {
  const { data, error } = await supabase
    .from("public_athlete_products" as never)
    .select(PRODUCT_COLS)
    .eq("athlete_id", athleteId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PublicAthleteProduct[];
}

export async function fetchProductsByAthletes(athleteIds: string[]): Promise<PublicAthleteProduct[]> {
  if (athleteIds.length === 0) return [];
  const { data, error } = await supabase
    .from("public_athlete_products" as never)
    .select(PRODUCT_COLS)
    .in("athlete_id", athleteIds)
    .order("updated_at", { ascending: false })
    .limit(120);
  if (error) throw error;
  return (data ?? []) as unknown as PublicAthleteProduct[];
}

export async function fetchAllProducts(limit = 48): Promise<PublicAthleteProduct[]> {
  const { data, error } = await supabase
    .from("public_athlete_products" as never)
    .select(PRODUCT_COLS)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PublicAthleteProduct[];
}

export async function fetchProductById(id: string): Promise<PublicAthleteProduct | null> {
  const { data, error } = await supabase
    .from("public_athlete_products" as never)
    .select(PRODUCT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as PublicAthleteProduct | null) ?? null;
}
