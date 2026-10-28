// Mockup review — every colourway is checked once before it sells.
//
//   ✓ approve  -> this colour goes on (or stays on) the Shopify product
//   ✎ fix      -> back to production with a note (required); kept off Shopify
//   ✕ drop     -> the colourway doesn't work; removed from Shopify
//
// Same one-at-a-time flow as content review. Decisions are saved instantly but
// only reach Shopify when "Sync to Shopify" is pressed for a design, so a
// half-reviewed batch never changes the storefront.
// Server side: public.mockup_reviews + ax_mockup_review(),
// supabase/functions/mockup-review-sync (the Shopify push).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MockupState = "pending" | "approved" | "needs_fix" | "archived";
export type MockupDecision = "approve" | "fix" | "archive" | "pending";

export interface MockupItem {
  id: string;
  athleteId: string | null;
  designCode: string;
  designName: string;
  productTitle: string | null;
  garment: string;
  blankStyle: string | null;
  color: string;
  frontUrl: string | null;
  backUrl: string | null;
  frontDriveId: string | null;
  state: MockupState;
  note: string | null;
  shopifyProductGid: string | null;
  shopifyState: "on" | "off" | null;
  syncedAt: string | null;
  syncError: string | null;
  reviewedAt: string | null;
}

/** Quick notes for "needs fix" — what usually goes wrong on a mockup. */
export const MOCKUP_FIX_CHIPS = [
  "Placement",
  "Print too big",
  "Print too small",
  "Wrong ink colour",
  "Colour render looks off",
  "Duplicate of another colour",
  "Missing back",
] as const;

export const MOCKUP_DROP_CHIPS = ["Colour combo doesn't work", "Low contrast", "Off brand"] as const;

/** Keyboard: A approve, F fix, X drop, Z undo, S / → skip, ← back, B flip front/back. */
export function mockupKey(key: string): "approve" | "fix" | "archive" | "undo" | "next" | "prev" | "flip" | null {
  switch (key.toLowerCase()) {
    case "a": return "approve";
    case "f": return "fix";
    case "x": return "archive";
    case "z": return "undo";
    case "b": return "flip";
    case "s":
    case "arrowright": return "next";
    case "arrowleft": return "prev";
    default: return null;
  }
}

/** What a sync would do to one design, from its review rows. Pure, so it is tested. */
export interface SyncPlan {
  designCode: string;
  designName: string;
  productGid: string | null;
  /** Approved and not yet on Shopify (or the product doesn't exist yet). */
  add: string[];
  /** On Shopify and now dropped or sent to fix. */
  remove: string[];
  /** Approved and already on. */
  keep: string[];
  /** Still waiting for a decision: left exactly as they are. */
  untouched: string[];
}

export function planSync(rows: MockupItem[]): SyncPlan[] {
  const byDesign = new Map<string, MockupItem[]>();
  for (const r of rows) byDesign.set(r.designCode, [...(byDesign.get(r.designCode) ?? []), r]);
  return [...byDesign.entries()].map(([designCode, list]) => {
    const plan: SyncPlan = {
      designCode,
      designName: list[0].designName,
      productGid: list.find((r) => r.shopifyProductGid)?.shopifyProductGid ?? null,
      add: [], remove: [], keep: [], untouched: [],
    };
    for (const r of list) {
      // Unknown Shopify state on an existing product: assume it is on (that is
      // how the seeded designs start — every colour already on the draft).
      const on = r.shopifyState ? r.shopifyState === "on" : Boolean(plan.productGid);
      if (r.state === "approved") (on && plan.productGid ? plan.keep : plan.add).push(r.color);
      else if (r.state === "archived" || r.state === "needs_fix") { if (on && plan.productGid) plan.remove.push(r.color); }
      else plan.untouched.push(r.color);
    }
    return plan;
  });
}

/** One line for the confirm button: "Add 2 · Remove 5 · Keep 14". */
export function planSummary(p: SyncPlan): string {
  const parts = [
    p.add.length ? `Add ${p.add.length}` : null,
    p.remove.length ? `Remove ${p.remove.length}` : null,
    p.keep.length ? `Keep ${p.keep.length}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing to change";
}

export function hasChanges(p: SyncPlan): boolean {
  return p.add.length > 0 || p.remove.length > 0;
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v ? v : null);

export function toMockupItem(r: Row): MockupItem {
  return {
    id: String(r.id),
    athleteId: s(r.athlete_id),
    designCode: String(r.design_code ?? ""),
    designName: String(r.design_name ?? ""),
    productTitle: s(r.product_title),
    garment: String(r.garment ?? ""),
    blankStyle: s(r.blank_style),
    color: String(r.color ?? ""),
    frontUrl: s(r.front_url),
    backUrl: s(r.back_url),
    frontDriveId: s(r.front_drive_id),
    state: (s(r.review_state) as MockupState | null) ?? "pending",
    note: s(r.review_note),
    shopifyProductGid: s(r.shopify_product_gid),
    shopifyState: r.shopify_state === "on" || r.shopify_state === "off" ? r.shopify_state : null,
    syncedAt: s(r.synced_at),
    syncError: s(r.sync_error),
    reviewedAt: s(r.reviewed_at),
  };
}

const KEY = ["v2", "mockup-review"] as const;
const COLS = "id, athlete_id, design_code, design_name, product_title, garment, blank_style, color, front_url, back_url, front_drive_id, review_state, review_note, shopify_product_gid, shopify_state, synced_at, sync_error, reviewed_at";

export function useMockupReviews() {
  return useQuery({
    queryKey: KEY,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mockup_reviews" as never)
        .select(COLS)
        .order("design_code", { ascending: true })
        .order("color", { ascending: true })
        .limit(3000);
      if (error) {
        if ((error as { code?: string }).code === "42P01") return [] as MockupItem[]; // table not there yet
        throw new Error(error.message);
      }
      return ((data ?? []) as unknown as Row[]).map(toMockupItem);
    },
  });
}

/** For the rail badge. */
export function usePendingMockupCount(): number {
  const { data } = useMockupReviews();
  return (data ?? []).filter((i) => i.state === "pending").length;
}

const STATE_OF: Record<MockupDecision, MockupState> = { approve: "approved", fix: "needs_fix", archive: "archived", pending: "pending" };

export function useMockupDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; decision: MockupDecision; note?: string | null }) => {
      const { error } = await supabase.rpc("ax_mockup_review" as never, { _id: input.id, _decision: input.decision, _note: input.note ?? null } as never);
      if (error) throw new Error(error.message);
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KEY });
      const before = qc.getQueryData<MockupItem[]>(KEY);
      qc.setQueryData<MockupItem[]>(KEY, (list) =>
        (list ?? []).map((i) => (i.id === input.id
          ? { ...i, state: STATE_OF[input.decision], note: input.decision === "pending" ? i.note : input.note?.trim() || null, reviewedAt: new Date().toISOString() }
          : i)),
      );
      return { before };
    },
    onError: (_e, _input, ctx) => { if (ctx?.before) qc.setQueryData(KEY, ctx.before); },
    onSettled: () => { void qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export interface SyncResult {
  design_code: string;
  product_gid?: string;
  added?: string[];
  removed?: string[];
  error?: string;
}

/** Push one design's decisions to Shopify (approved on, dropped / to-fix off). */
export function useMockupSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (designCode: string): Promise<SyncResult> => {
      const { data, error } = await supabase.functions.invoke("mockup-review-sync", { body: { design_code: designCode } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
        throw new Error((body as { error?: string } | null)?.error ?? error.message);
      }
      const r = data as SyncResult;
      if (r.error) throw new Error(r.error);
      return r;
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: KEY }); },
  });
}

export interface IntakeResult { scanned: number; added: number; error?: string; hint?: string }

/** Pull new colourways from the Drive library (needs the Google service account). */
export function useMockupIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<IntakeResult> => {
      const { data, error } = await supabase.functions.invoke("mockup-review-intake", { body: {} });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : null;
        throw new Error((body as { error?: string } | null)?.error ?? error.message);
      }
      return data as IntakeResult;
    },
    onSuccess: (r) => { if (r.added > 0) void qc.invalidateQueries({ queryKey: KEY }); },
  });
}
