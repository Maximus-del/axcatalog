// INVITE LINKS, ACCESS REQUESTS, ONBOARDING, AND THE PUBLIC LOCKER.
//
// The flow, end to end:
//   1. An operator copies an Owner or Team link for an entity (V2 overview).
//   2. The person opens /invite/<token>, creates an account (or signs in) and
//      files an access request. The link carries the role; nothing is granted
//      until an operator approves.
//   3. While they wait they answer a short questionnaire. The answers sit on
//      their request, so the operator sees them when deciding.
//   4. Approve → they land in the portal. Owner sees everything; Team sees
//      their gear, never money (enforced in the database, not only here).
//
// The public locker (/l/<slug>) is separate: no login, retail only, buy
// through Shopify checkout (Apple Pay / Shop Pay live there).
//
// Pure helpers first (tested), hooks after.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PortalRole = "owner" | "team";

// ── addresses ───────────────────────────────────────────────────────────

/** Where invite links point. The dashboard app serves /invite. */
export const INVITE_ORIGIN = "https://chase-dashboard-phi.vercel.app";

/**
 * Where public lockers live. lockers.athletexclusive.com is the custom domain
 * pointed at this same app; until its DNS is live the dashboard origin serves
 * the identical page at /l/<slug>.
 */
export const LOCKER_ORIGIN = "https://lockers.athletexclusive.com";
export const LOCKER_FALLBACK_ORIGIN = INVITE_ORIGIN;

/** Public storage host (same project the client is generated against). */
export const SUPABASE_PUBLIC_URL = "https://cuidofxidstqpgypxcop.supabase.co";

/** Shopify's own domain — the cart permalink and checkout run here. */
export const SHOP_ORIGIN = "https://shop.athletexclusive.com";

export function inviteUrl(token: string, origin: string = INVITE_ORIGIN): string {
  return `${origin.replace(/\/$/, "")}/invite/${encodeURIComponent(token)}`;
}

/** lockers.athletexclusive.com/proactive — the domain is the locker room, so no /l/ prefix there. */
export function lockerUrl(slug: string, origin: string = LOCKER_ORIGIN): string {
  const base = origin.replace(/\/$/, "");
  return base === LOCKER_ORIGIN ? `${base}/${encodeURIComponent(slug)}` : `${base}/l/${encodeURIComponent(slug)}`;
}

/** Is this page being served from the lockers domain (where `/<slug>` is a locker)? */
export function isLockerHost(hostname: string): boolean {
  return /^lockers\./i.test(hostname);
}

/** Lower-case, a–z 0–9 and dashes, 2–40 long. null when it can't be made valid. */
export function cleanLockerSlug(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.length >= 2 && s.length <= 40 ? s : null;
}

// ── checkout ────────────────────────────────────────────────────────────

export interface CartLine {
  variantId: string;
  quantity: number;
}

/** "gid://shopify/ProductVariant/123" or "123" → "123". null when it isn't a variant id. */
export function numericVariantId(id: string | null | undefined): string | null {
  if (!id) return null;
  const m = String(id).match(/(\d{6,})$/);
  return m ? m[1] : null;
}

/**
 * Shopify cart permalink: /cart/<variant>:<qty>,… opens checkout with those
 * lines already in the cart. Apple Pay and Shop Pay show on that page by
 * themselves on any device that supports them. Lines for the same variant are
 * merged; anything that isn't a real variant id is dropped.
 */
export function cartPermalink(lines: CartLine[], origin: string = SHOP_ORIGIN): string | null {
  const merged = new Map<string, number>();
  for (const l of lines) {
    const id = numericVariantId(l.variantId);
    const q = Math.floor(l.quantity);
    if (!id || !Number.isFinite(q) || q <= 0) continue;
    merged.set(id, Math.min(99, (merged.get(id) ?? 0) + q));
  }
  if (merged.size === 0) return null;
  const path = Array.from(merged, ([id, q]) => `${id}:${q}`).join(",");
  return `${origin.replace(/\/$/, "")}/cart/${path}`;
}

/** Product page on the Shopify domain — the fallback when a product has no synced variants. */
export function shopProductUrl(handle: string | null | undefined, origin: string = SHOP_ORIGIN): string | null {
  return handle ? `${origin.replace(/\/$/, "")}/products/${encodeURIComponent(handle)}` : null;
}

// ── onboarding questionnaire ────────────────────────────────────────────

export const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
export type Size = (typeof SIZES)[number];

export type Position = "owner" | "coach" | "athlete" | "other";
export type Want = "order_gear" | "see_sales" | "create_designs" | "sell_to_community";

export const POSITIONS: { value: Position; label: string }[] = [
  { value: "owner", label: "Owner / leadership" },
  { value: "coach", label: "Coach / staff" },
  { value: "athlete", label: "Athlete / member" },
  { value: "other", label: "Something else" },
];

export const WANTS: { value: Want; label: string }[] = [
  { value: "order_gear", label: "Order team gear" },
  { value: "see_sales", label: "See sales & earnings" },
  { value: "create_designs", label: "Create new designs" },
  { value: "sell_to_community", label: "Sell to our community" },
];

export interface OnboardingAnswers {
  position: Position;
  topSize: Size | null;
  bottomSize: Size | null;
  wants: Want[];
  notes: string;
}

export const EMPTY_ONBOARDING: OnboardingAnswers = { position: "coach", topSize: null, bottomSize: null, wants: [], notes: "" };

const isSize = (v: unknown): v is Size => typeof v === "string" && (SIZES as readonly string[]).includes(v);

/** Untrusted JSON → answers. Unknown or malformed fields fall back to empty. */
export function parseOnboarding(raw: unknown): OnboardingAnswers | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const position = POSITIONS.some((p) => p.value === r.position) ? (r.position as Position) : "other";
  const wants = Array.isArray(r.wants) ? (r.wants.filter((w) => WANTS.some((x) => x.value === w)) as Want[]) : [];
  return {
    position,
    topSize: isSize(r.topSize) ? r.topSize : null,
    bottomSize: isSize(r.bottomSize) ? r.bottomSize : null,
    wants: Array.from(new Set(wants)),
    notes: typeof r.notes === "string" ? r.notes.slice(0, 500) : "",
  };
}

/**
 * What role the answers point to. The link already carries a role; this is
 * the operator's second opinion ("came in on the Team link but says Owner").
 */
export function suggestedRole(a: OnboardingAnswers | null, linkRole: PortalRole): PortalRole {
  if (!a) return linkRole;
  if (a.position === "owner" || a.wants.includes("see_sales")) return "owner";
  return linkRole;
}

/** One line for the approval card: "Coach / staff · Tee L · wants Order team gear". */
export function onboardingSummary(a: OnboardingAnswers | null): string {
  if (!a) return "Hasn't answered the questions yet";
  const parts = [POSITIONS.find((p) => p.value === a.position)?.label ?? ""];
  if (a.topSize) parts.push(`Top ${a.topSize}`);
  if (a.bottomSize) parts.push(`Bottom ${a.bottomSize}`);
  if (a.wants.length) parts.push(`wants ${a.wants.map((w) => WANTS.find((x) => x.value === w)?.label ?? w).join(", ")}`);
  return parts.filter(Boolean).join(" · ");
}

// ── public locker data ──────────────────────────────────────────────────

export interface LockerVariant {
  id: string;
  size: string | null;
  color: string | null;
  available: boolean;
  price: number;
}

export interface LockerProduct {
  id: string;
  title: string;
  description: string | null;
  price: number;
  compareAt: number | null;
  handle: string | null;
  images: { url: string; color: string | null; view: string | null }[];
  variants: LockerVariant[];
}

export interface LockerCollection {
  id: string;
  key: string;
  label: string;
  caption: string | null;
  accent: string | null;
  images: string[];
  productIds: string[];
}

export interface PublicLocker {
  entity: { id: string; name: string; slug: string; theme: unknown; locker: { headline?: string; tagline?: string } };
  collections: LockerCollection[];
  products: LockerProduct[];
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Storage row → URL a signed-out browser can load. Both buckets the locker uses are public. */
export function imageUrl(bucket: string | null, path: string | null, supabaseUrl: string): string | null {
  if (!path) return null;
  if (bucket === "external" || /^https?:\/\//i.test(path)) return /^https:\/\//i.test(path) ? path : null;
  if (!bucket) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isImg = (i: { url: string | null }): i is { url: string; color: string | null; view: string | null } => Boolean(i.url);

/** RPC JSON → typed locker. Pure; exported for tests. */
export function parseLocker(raw: unknown, supabaseUrl: string): PublicLocker | null {
  const r = obj(raw);
  if (!r.entity) return null;
  const products: LockerProduct[] = arr(r.products).map((pv) => {
    const p = obj(pv);
    return {
      id: String(p.id),
      title: String(p.title ?? ""),
      description: strOrNull(p.description),
      price: num(p.price),
      compareAt: p.compareAt == null ? null : num(p.compareAt),
      handle: strOrNull(p.handle),
      images: arr(p.images)
        .map((iv) => {
          const i = obj(iv);
          return {
            url: imageUrl(strOrNull(i.bucket), strOrNull(i.path), supabaseUrl),
            color: strOrNull(i.color),
            view: strOrNull(i.view),
          };
        })
        .filter(isImg),
      variants: arr(p.variants)
        .map((vv) => {
          const v = obj(vv);
          return {
            id: String(v.id ?? ""),
            size: strOrNull(v.size),
            color: strOrNull(v.color),
            available: v.available !== false,
            price: num(v.price) || num(p.price),
          };
        })
        .filter((v) => numericVariantId(v.id) !== null),
    };
  });
  const ids = new Set(products.map((p) => p.id));
  const collections: LockerCollection[] = arr(r.collections).map((cv) => {
    const c = obj(cv);
    return {
      id: String(c.id),
      key: String(c.key ?? c.id),
      label: String(c.label ?? c.name ?? ""),
      caption: strOrNull(c.caption),
      accent: strOrNull(c.accent),
      images: arr(c.images).filter((u): u is string => typeof u === "string" && (u.startsWith("/") || u.startsWith("https://"))),
      productIds: arr(c.productIds).map(String).filter((id) => ids.has(id)),
    };
  });
  const e = obj(r.entity);
  return {
    entity: {
      id: String(e.id),
      name: String(e.name ?? ""),
      slug: String(e.slug ?? ""),
      theme: e.theme ?? {},
      locker: obj(e.locker) as PublicLocker["entity"]["locker"],
    },
    collections: collections.filter((c) => c.productIds.length > 0),
    products,
  };
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "2XL", "XXL", "3XL", "XXXL", "4XL", "5XL"];
/** Sizes in wearing order, unknowns after. */
export function sortSizes(sizes: string[]): string[] {
  const rank = (s: string) => {
    const i = SIZE_ORDER.indexOf(s.toUpperCase());
    return i === -1 ? 100 : i;
  };
  return Array.from(new Set(sizes)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** The variant for a colour/size pick. With one variant and no options, that one. */
export function pickVariant(p: LockerProduct, color: string | null, size: string | null): LockerVariant | null {
  if (p.variants.length === 1) return p.variants[0];
  return p.variants.find((v) => (color === null || v.color === color) && (size === null || v.size === size)) ?? null;
}

// ── hooks ───────────────────────────────────────────────────────────────

const rpc = (fn: string, args: Record<string, unknown>) => supabase.rpc(fn as never, args as never);

export interface InviteInfo {
  role: PortalRole;
  entityName: string;
  theme: unknown;
}

export function useInviteInfo(token: string | undefined) {
  return useQuery({
    queryKey: ["portal-invite", token],
    enabled: Boolean(token),
    staleTime: 60_000,
    queryFn: async (): Promise<InviteInfo | null> => {
      const { data, error } = await rpc("portal_invite_info", { _token: token });
      if (error) throw new Error(error.message);
      if (!data) return null;
      const d = data as Record<string, unknown>;
      return { role: d.role === "owner" ? "owner" : "team", entityName: String(d.entityName ?? ""), theme: d.theme ?? {} };
    },
  });
}

export async function requestAccess(token: string, fullName: string): Promise<"pending" | "approved" | "denied"> {
  const { data, error } = await rpc("portal_request_access", { _token: token, _full_name: fullName });
  if (error) throw new Error(error.message);
  const s = (data as { status?: string } | null)?.status;
  return s === "approved" || s === "denied" ? s : "pending";
}

export type RedeemResult =
  | { ok: true; athleteId: string; entityName: string; role: PortalRole }
  | { ok: false; message: string };

/** Type an access code -> straight in with that code's role (no approval wait). */
export async function redeemAccessCode(code: string, fullName?: string): Promise<RedeemResult> {
  const { data, error } = await rpc("portal_redeem_access_code", { _code: code, _full_name: fullName ?? null });
  if (error) return { ok: false, message: error.message };
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.status !== "approved") return { ok: false, message: String(d.message ?? "That code didn't work.") };
  return { ok: true, athleteId: String(d.athleteId), entityName: String(d.entityName ?? ""), role: d.role === "owner" ? "owner" : "team" };
}

export interface MyRequest {
  id: string;
  athleteId: string;
  entityName: string;
  theme: unknown;
  status: "pending" | "approved" | "denied";
  requestedRole: PortalRole;
  onboarding: OnboardingAnswers | null;
  answered: boolean;
}

export const myRequestsKey = ["portal-my-requests"];

/** Pure: RPC JSON → requests. Exported for tests. */
export function parseMyRequests(raw: unknown): MyRequest[] {
  return arr(raw).map(obj).map((r) => ({
    id: String(r.id),
    athleteId: String(r.athleteId),
    entityName: String(r.entityName ?? ""),
    theme: r.theme ?? {},
    status: r.status === "approved" || r.status === "denied" ? r.status : "pending",
    requestedRole: r.requestedRole === "owner" ? "owner" : "team",
    onboarding: parseOnboarding(r.onboarding),
    answered: Boolean(r.onboardedAt),
  }));
}

/** The signed-in person's own requests. Polls while one is pending, so approval lands on its own. */
export function useMyAccessRequests(enabled: boolean) {
  return useQuery({
    queryKey: myRequestsKey,
    enabled,
    refetchInterval: (q) => ((q.state.data as MyRequest[] | undefined)?.some((r) => r.status === "pending") ? 15_000 : false),
    queryFn: async (): Promise<MyRequest[]> => {
      const { data, error } = await rpc("portal_my_requests", {});
      if (error) throw new Error(error.message);
      return parseMyRequests(data);
    },
  });
}

export function useSaveOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ athleteId, answers }: { athleteId: string; answers: OnboardingAnswers }) => {
      const { error } = await rpc("portal_save_onboarding", { _athlete_id: athleteId, _answers: answers });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: myRequestsKey });
      qc.invalidateQueries({ queryKey: ["portal-my-onboarding"] });
    },
  });
}

/** The current user's answers for one entity (pre-fills sizes in the portal). */
export function useMyOnboarding(athleteId: string | null | undefined) {
  return useQuery({
    queryKey: ["portal-my-onboarding", athleteId],
    enabled: Boolean(athleteId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ answers: OnboardingAnswers | null; answered: boolean }> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { answers: null, answered: false };
      const { data } = await supabase
        .from("portal_access_requests" as never)
        .select("onboarding, onboarded_at")
        .eq("athlete_id", athleteId as string)
        .eq("user_id", u.user.id)
        .maybeSingle();
      const row = data as { onboarding?: unknown; onboarded_at?: string | null } | null;
      return { answers: parseOnboarding(row?.onboarding), answered: Boolean(row?.onboarded_at) };
    },
  });
}

export function usePublicLocker(slug: string | undefined) {
  return useQuery({
    queryKey: ["public-locker", slug],
    enabled: Boolean(slug),
    staleTime: 60_000,
    queryFn: async (): Promise<PublicLocker | null> => {
      const { data, error } = await rpc("public_locker", { _slug: slug });
      if (error) throw new Error(error.message);
      return parseLocker(data, SUPABASE_PUBLIC_URL);
    },
  });
}
