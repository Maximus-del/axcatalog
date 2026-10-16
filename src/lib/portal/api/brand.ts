// Content & Drops and Brand HQ.
//
//   GET   /assets?kind=&collection=   portal_list_assets
//   POST  /assets/:id/download        public media → its URL (no expiry); private → portal-files sign
//   GET   /drops                      portal_list_drops
//   POST  /drops                      portal_create_drop   (draft only; idempotent)
//   PATCH /drops/:id                  portal_update_drop   (own drafts; send for review; stale → 409)
//   GET   /analytics                  portal_revenue_summary + order requests + destinations
//   GET   /profile                    portal_get_profile
//   PATCH /profile                    portal_update_profile (bio, website, notification defaults only)
//
// Scheduling a drop and taking it live stay with AX in V2: the browser can
// plan and submit, never publish.

import { supabase } from "@/integrations/supabase/client";
import { getTierProgress } from "@/lib/portal-config";
import type { Destination, Drop, MediaAsset, Money, Order, Page, PortalScope } from "./contract";
import { toApiError } from "./money";
import { fetchRevenue, type RevenueReport } from "./summary";
import { fetchOrders } from "./orders";
import { fetchDestinations } from "./destinations";
import type { Period } from "./period";

type Json = Record<string, unknown>;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw toApiError(error);
  return data as T;
}

// ---------------------------------------------------------------- content
const PUBLIC_BUCKETS = new Set(["product-images", "product-social-assets", "content-media", "blanks"]);

/** Bucket/path or a full URL → a usable URL, or null when it would need signing. Exported for tests. */
export function assetUrl(bucket: string | null, path: string | null, url: string | null): string | null {
  if (url && /^https:\/\//i.test(url)) return url;
  if (!path) return null;
  if (/^https:\/\//i.test(path)) return path; // 'external' rows store the URL as the path
  if (bucket === "external") return null;
  if (bucket && PUBLIC_BUCKETS.has(bucket)) return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  return null;
}

export function toMediaAsset(r: Json): MediaAsset {
  const url = assetUrl((r.bucket as string) ?? null, (r.path as string) ?? null, (r.url as string) ?? null);
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    kind: (r.kind as MediaAsset["kind"]) ?? "photo",
    thumbnailUrl: url,
    downloadUrl: url,
    productId: (r.product_id as string | null) ?? null,
    caption: (r.caption as string | null) ?? null,
    approved: r.approved !== false,
  };
}

export async function listAssets(
  scope: PortalScope,
  opts: { kind?: MediaAsset["kind"] | null; collection?: string | null; cursor?: string | null; limit?: number } = {},
): Promise<Page<MediaAsset>> {
  const r = await rpc<{ items: Json[]; nextCursor: string | null }>("portal_list_assets", {
    _athlete_id: scope.athleteId,
    _kind: opts.kind ?? null,
    _collection: opts.collection ?? null,
    _cursor: opts.cursor ?? null,
    _limit: opts.limit ?? 24,
  });
  return { items: (r.items ?? []).map(toMediaAsset), nextCursor: r.nextCursor ?? null };
}

/**
 * POST /assets/:id/download. Every asset in the library today is in a public
 * bucket, so its URL is the download (expiresAt null). Anything private comes
 * back without a URL from the list and must go through portal-files.
 */
export function assetDownload(asset: MediaAsset): { url: string; expiresAt: string | null } | null {
  return asset.downloadUrl ? { url: asset.downloadUrl, expiresAt: null } : null;
}

// ---------------------------------------------------------------- drops
export interface DropDetail extends Drop {
  accessAt: string | null;
  /** Pass back as expectedVersion when editing. */
  version: string;
  editable: boolean;
}

export function toDrop(r: Json): DropDetail {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    status: (r.status as Drop["status"]) ?? "draft",
    scheduledAt: (r.scheduledAt as string | null) ?? null,
    accessAt: (r.accessAt as string | null) ?? null,
    timeZone: String(r.timeZone ?? "UTC"),
    destinationId: (r.destinationId as string | null) ?? null,
    version: String(r.version ?? ""),
    editable: r.editable === true,
  };
}

export async function listDrops(scope: PortalScope, opts: { status?: Drop["status"]; cursor?: string | null } = {}): Promise<Page<DropDetail>> {
  const r = await rpc<{ items: Json[]; nextCursor: string | null }>("portal_list_drops", {
    _athlete_id: scope.athleteId,
    _status: opts.status ?? null,
    _cursor: opts.cursor ?? null,
    _limit: 24,
  });
  return { items: (r.items ?? []).map(toDrop), nextCursor: r.nextCursor ?? null };
}

/**
 * `scheduledLocal` is the wall-clock time the person picked, e.g.
 * "2026-11-01T18:00", interpreted in `timeZone` ON THE SERVER — so a drop set
 * for 6pm in Los Angeles stays 6pm there across daylight saving.
 */
export async function createDrop(
  scope: PortalScope,
  input: { idempotencyKey: string; title: string; destinationId?: string | null; scheduledLocal?: string | null; timeZone: string },
): Promise<DropDetail> {
  return toDrop(
    await rpc<Json>("portal_create_drop", {
      _athlete_id: scope.athleteId,
      _idempotency_key: input.idempotencyKey,
      _title: input.title,
      _destination_id: input.destinationId ?? null,
      _scheduled_local: input.scheduledLocal ?? null,
      _time_zone: input.timeZone,
    }),
  );
}

export async function updateDrop(
  scope: PortalScope,
  input: {
    dropId: string;
    expectedVersion: string;
    change: { title?: string; destinationId?: string | null; scheduledLocal?: string | null; timeZone?: string; submitForReview?: boolean };
  },
): Promise<DropDetail> {
  return toDrop(
    await rpc<Json>("portal_update_drop", {
      _athlete_id: scope.athleteId,
      _drop_id: input.dropId,
      _expected_version: input.expectedVersion,
      _change: input.change,
    }),
  );
}

// ---------------------------------------------------------------- analytics
export interface Analytics {
  period: Period;
  revenueBasis: "gross";
  asOf: string | null;
  attributable: boolean;
  attributedRevenue: Money | null;
  monthly: { month: string; value: Money | null }[];
  /**
   * Per destination. ALWAYS null today: imported Shopify lines carry no
   * product or collection link, so city revenue cannot be known. Show
   * "Revenue not attributed" — never split a total across eras.
   */
  byDestination: { destinationId: string; value: Money | null }[];
  /**
   * productId / imageUrl: the client's own product with the same title, when
   * one exists (sales lines carry only a title). null when there is no match —
   * show a neutral placeholder, never another product's photo.
   */
  topProducts: { title: string; units: number; gross: Money | null; productId: string | null; imageUrl: string | null }[];
  recentOrders: Order[];
}

/** Titles as people type them: case, curly quotes and spacing don't matter. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Attach the client's own product (id + image) to each top seller by title.
 * Only an exact title match counts; ambiguous titles (two products, same
 * name) get no picture rather than a guess.
 */
export function matchTopProducts<T extends { title: string }>(
  top: T[],
  products: { id: string; title: string; image: string | null }[],
): (T & { productId: string | null; imageUrl: string | null })[] {
  const byTitle = new Map<string, { id: string; image: string | null } | null>();
  for (const p of products) {
    const k = titleKey(p.title);
    byTitle.set(k, byTitle.has(k) ? null : { id: p.id, image: p.image });
  }
  return top.map((t) => {
    const hit = byTitle.get(titleKey(t.title)) ?? null;
    return { ...t, productId: hit?.id ?? null, imageUrl: hit?.image ?? null };
  });
}

export function analyticsFrom(report: RevenueReport | null, destinations: Destination[], orders: Order[], period: Period): Analytics {
  const ok = report?.attributable ?? false;
  return {
    period,
    revenueBasis: "gross",
    asOf: report?.asOf ?? null,
    attributable: ok,
    attributedRevenue: ok ? (report?.period?.gross ?? null) : null,
    monthly: ok ? (report?.monthly ?? []).map((m) => ({ month: m.month, value: m.gross })) : [],
    byDestination: destinations.map((d) => ({ destinationId: d.id, value: null })),
    topProducts: ok ? (report?.topProducts ?? []).map((t) => ({ ...t, productId: null, imageUrl: null })) : [],
    recentOrders: orders,
  };
}

export async function fetchAnalytics(scope: PortalScope, period: Period): Promise<Analytics> {
  const [report, destinations, orders] = await Promise.all([
    fetchRevenue(scope, period).catch(() => null),
    fetchDestinations(scope).catch(() => [] as Destination[]),
    fetchOrders(scope, null, 5).then((p) => p.items).catch(() => [] as Order[]),
  ]);
  return analyticsFrom(report, destinations, orders, period);
}

// ---------------------------------------------------------------- profile
export interface Profile {
  id: string;
  name: string;
  position: string | null;
  jerseyNumber: string | null;
  league: string | null;
  team: string | null;
  entityType: string | null;
  avatarUrl: string | null;
  bio: string | null;
  website: string | null;
  notificationDefaults: Record<string, unknown> | null;
  /** Only when AX has approved a referral code for this login. No URL until checkout can redeem one. */
  referral: { code: string; buyerDiscountPercent: number | null; url: string | null } | null;
  /** Tier from lifetime revenue (existing ladder), when lifetime is known. */
  progression: ReturnType<typeof getTierProgress> | null;
}

export function toProfile(r: Json, lifetimeRevenueDollars: number | null): Profile {
  const ref = r.referral as Json | null;
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    position: (r.position as string | null) ?? null,
    jerseyNumber: (r.jerseyNumber as string | null) ?? null,
    league: (r.league as string | null) ?? null,
    team: (r.team as string | null) ?? null,
    entityType: (r.entityType as string | null) ?? null,
    avatarUrl: (r.avatarUrl as string | null) ?? null,
    bio: (r.bio as string | null) ?? null,
    website: (r.website as string | null) ?? null,
    notificationDefaults: (r.notificationDefaults as Record<string, unknown> | null) ?? null,
    referral: ref
      ? { code: String(ref.code), buyerDiscountPercent: ref.buyerDiscountPercent == null ? null : Number(ref.buyerDiscountPercent), url: (ref.url as string | null) ?? null }
      : null,
    progression: lifetimeRevenueDollars == null ? null : getTierProgress(lifetimeRevenueDollars),
  };
}

export async function getProfile(scope: PortalScope, lifetimeRevenueDollars: number | null): Promise<Profile> {
  return toProfile(await rpc<Json>("portal_get_profile", { _athlete_id: scope.athleteId }), lifetimeRevenueDollars);
}

export async function updateProfile(
  scope: PortalScope,
  patch: { bio?: string | null; website?: string | null; notificationDefaults?: Record<string, unknown> | null },
  expectedVersion: string | null = null,
): Promise<Profile> {
  return toProfile(
    await rpc<Json>("portal_update_profile", { _athlete_id: scope.athleteId, _expected_version: expectedVersion, _patch: patch }),
    null,
  );
}
