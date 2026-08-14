// ─────────────────────────────────────────────────────────────────────────
// CONTENT + EVENTS + MEMBERSHIP domain. One place for reads (fan-facing public
// views) and operator writes (content_assets / events / membership_plans /
// subscriptions). Components/hooks call these — never Supabase directly.
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";
import type { Visibility } from "./access";
import type { MembershipPlan } from "./types";

export interface PublicContent {
  id: string;
  athlete_id: string | null;
  athlete_slug: string | null;
  athlete_name: string | null;
  athlete_image: string | null;
  type: string;
  title: string;
  body: string | null;
  hero_url: string | null;
  media: string[] | unknown;
  category: string | null;
  visibility: Visibility;
  product_id: string | null;
  event_id: string | null;
  publish_at: string | null;
  created_at: string;
}

export interface PublicEvent {
  id: string;
  athlete_id: string | null;
  athlete_slug: string | null;
  athlete_name: string | null;
  athlete_image: string | null;
  type: string;
  name: string;
  city: string | null;
  location: string | null;
  description: string | null;
  image_url: string | null;
  registration_url: string | null;
  event_date: string | null;
  access_date: string | null;
  public_date: string | null;
  status: string;
}

const CONTENT_COLS =
  "id, athlete_id, athlete_slug, athlete_name, athlete_image, type, title, body, hero_url, media, category, visibility, product_id, event_id, publish_at, created_at";
const EVENT_COLS =
  "id, athlete_id, athlete_slug, athlete_name, athlete_image, type, name, city, location, description, image_url, registration_url, event_date, access_date, public_date, status";

// ---- Fan-facing reads (public views) ----
export async function fetchPublicContentByAthletes(ids: string[], limit = 60): Promise<PublicContent[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("public_content" as never).select(CONTENT_COLS)
    .in("athlete_id", ids).order("publish_at", { ascending: false, nullsFirst: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PublicContent[];
}
export async function fetchAthleteContent(athleteId: string): Promise<PublicContent[]> {
  const { data, error } = await supabase
    .from("public_content" as never).select(CONTENT_COLS)
    .eq("athlete_id", athleteId).order("publish_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as PublicContent[];
}
export async function fetchAthleteEvents(athleteId: string): Promise<PublicEvent[]> {
  const { data, error } = await supabase
    .from("public_events" as never).select(EVENT_COLS)
    .eq("athlete_id", athleteId).order("event_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as PublicEvent[];
}
export async function fetchEventsByAthletes(ids: string[], limit = 40): Promise<PublicEvent[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("public_events" as never).select(EVENT_COLS)
    .in("athlete_id", ids).order("event_date", { ascending: true, nullsFirst: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as PublicEvent[];
}

// ---- Operator reads/writes (RLS restricts to org members) ----
export interface OperatorContentRow {
  id: string; organization_id: string; athlete_id: string | null; type: string; title: string;
  body: string | null; hero_url: string | null; visibility: string; product_id: string | null;
  event_id: string | null; status: string; publish_at: string | null; category: string | null;
  notify: Record<string, boolean>; created_at: string;
}

export async function listAthleteContent(athleteId: string): Promise<OperatorContentRow[]> {
  const { data, error } = await supabase
    .from("content_assets" as never).select("*").eq("athlete_id", athleteId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as OperatorContentRow[];
}
export async function listOrgContent(limit = 100): Promise<OperatorContentRow[]> {
  const { data, error } = await supabase
    .from("content_assets" as never).select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as OperatorContentRow[];
}

export interface ContentInput {
  organization_id: string;
  athlete_id: string | null;
  type: string;
  title: string;
  body?: string | null;
  hero_url?: string | null;
  category?: string | null;
  visibility: string;
  product_id?: string | null;
  event_id?: string | null;
  status: string;
  publish_at?: string | null;
  notify?: Record<string, boolean>;
  created_by?: string | null;
}
export async function createContent(input: ContentInput): Promise<void> {
  const { error } = await supabase.from("content_assets" as never).insert(input as never);
  if (error) throw error;
}
export async function updateContentStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from("content_assets" as never).update({ status } as never).eq("id", id);
  if (error) throw error;
}

export interface OperatorEventRow {
  id: string; organization_id: string; athlete_id: string | null; type: string; name: string;
  city: string | null; location: string | null; description: string | null; image_url: string | null;
  registration_url: string | null; event_date: string | null; access_date: string | null;
  public_date: string | null; status: string; created_at: string;
}
export async function listAthleteOrgEvents(athleteId: string): Promise<OperatorEventRow[]> {
  const { data, error } = await supabase
    .from("events" as never).select("*").eq("athlete_id", athleteId).order("event_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as unknown as OperatorEventRow[];
}
export async function listOrgEvents(limit = 100): Promise<OperatorEventRow[]> {
  const { data, error } = await supabase
    .from("events" as never).select("*").order("event_date", { ascending: true, nullsFirst: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as OperatorEventRow[];
}
export interface EventInput {
  organization_id: string; athlete_id: string | null; type: string; name: string;
  city?: string | null; location?: string | null; description?: string | null; image_url?: string | null;
  registration_url?: string | null; event_date?: string | null; access_date?: string | null;
  public_date?: string | null; status: string; created_by?: string | null;
}
export async function createEvent(input: EventInput): Promise<void> {
  const { error } = await supabase.from("events" as never).insert(input as never);
  if (error) throw error;
}

// ---- Membership plans (operator config) ----
export async function listAthletePlans(athleteId: string): Promise<MembershipPlan[]> {
  const { data, error } = await supabase
    .from("membership_plans" as never).select("*").eq("athlete_id", athleteId).order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MembershipPlan[];
}
export interface PlanInput {
  id?: string; organization_id: string; athlete_id: string; tier: string; name: string;
  description?: string | null; price_cents: number; benefits: string[]; is_active: boolean; sort_order: number;
}
export async function upsertPlan(plan: PlanInput): Promise<void> {
  const { error } = await supabase.from("membership_plans" as never).upsert(plan as never);
  if (error) throw error;
}
export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabase.from("membership_plans" as never).delete().eq("id", id);
  if (error) throw error;
}

// ---- Subscribers (operator view) — privacy-conscious columns only ----
export interface SubscriberRow {
  id: string; fan_user_id: string; athlete_id: string; state: string; created_at: string;
}
export async function listAthleteSubscribers(athleteId: string): Promise<SubscriberRow[]> {
  const { data, error } = await supabase
    .from("athlete_follows" as never).select("id, fan_user_id, athlete_id, state, created_at")
    .eq("athlete_id", athleteId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as SubscriberRow[];
}

// ---- Fan mock subscribe (no billing). Sets follow state; records subscription. ----
export async function subscribeMock(fanUserId: string, athleteId: string, tier: "access" | "vip", planId: string | null): Promise<void> {
  const state = tier === "vip" ? "vip" : "subscriber";
  const up = await supabase.from("athlete_follows" as never)
    .upsert({ fan_user_id: fanUserId, athlete_id: athleteId, state } as never, { onConflict: "fan_user_id,athlete_id" });
  if (up.error) throw up.error;
  const sub = await supabase.from("subscriptions" as never)
    .insert({ fan_user_id: fanUserId, athlete_id: athleteId, plan_id: planId, status: "active" } as never);
  if (sub.error) throw sub.error;
}
