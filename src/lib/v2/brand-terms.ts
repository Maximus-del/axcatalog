// A client's Brand HQ terms — what their one-pagers say about the split.
//
// Lives in athletes.metadata.brand_terms (snake_case, read by the
// portal_brand_playbook RPC). Only an operator can write athletes, so a client
// can read their terms but never change them. Absent = "not agreed yet", and
// the portal says so rather than showing a number AX never set.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { t, type Row } from "./db";

export interface BrandTerms {
  /** Percent of gross store sales paid to the client. */
  revenueSharePercent: number | null;
  /** e.g. "Monthly, by the 15th". */
  payoutSchedule: string;
  /** Anything else the client should read on "How your money works". */
  note: string;
}

export const EMPTY_TERMS: BrandTerms = { revenueSharePercent: null, payoutSchedule: "", note: "" };

/** Pure: metadata.brand_terms → BrandTerms. */
export function parseBrandTerms(raw: unknown): BrandTerms {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pct = r.revenue_share_percent;
  const n = pct === null || pct === undefined || pct === "" ? null : Number(pct);
  return {
    revenueSharePercent: n != null && Number.isFinite(n) ? n : null,
    payoutSchedule: typeof r.payout_schedule === "string" ? r.payout_schedule : "",
    note: typeof r.note === "string" ? r.note : "",
  };
}

/** Pure: a validation message, or null when the terms can be saved. */
export function brandTermsError(terms: BrandTerms): string | null {
  const p = terms.revenueSharePercent;
  if (p != null && (!Number.isFinite(p) || p < 0 || p > 100)) return "Revenue share must be between 0 and 100%.";
  if (terms.note.length > 600) return "Keep the note under 600 characters.";
  return null;
}

/** Pure: merge into metadata, removing the key entirely when every field is empty. */
export function mergeBrandTerms(metadata: unknown, terms: BrandTerms): Record<string, unknown> {
  const base = { ...((metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>) };
  const empty = terms.revenueSharePercent == null && !terms.payoutSchedule.trim() && !terms.note.trim();
  if (empty) {
    delete base.brand_terms;
    return base;
  }
  base.brand_terms = {
    revenue_share_percent: terms.revenueSharePercent,
    payout_schedule: terms.payoutSchedule.trim() || null,
    note: terms.note.trim() || null,
  };
  return base;
}

const key = (entityId: string) => ["v2", "brand-terms", entityId] as const;

export function useBrandTerms(entityId: string) {
  return useQuery({
    queryKey: key(entityId),
    enabled: !!entityId,
    queryFn: async () => {
      const res = (await t("athletes").select("metadata").eq("id", entityId).maybeSingle()) as {
        data: Row | null;
        error: { message: string } | null;
      };
      if (res.error) throw new Error(res.error.message);
      return parseBrandTerms((res.data?.metadata as Record<string, unknown> | undefined)?.brand_terms);
    },
  });
}

/** Read metadata fresh, change only brand_terms, write back (same rule as the portal theme). */
export function useSaveBrandTerms(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (terms: BrandTerms) => {
      const problem = brandTermsError(terms);
      if (problem) throw new Error(problem);
      const current = (await t("athletes").select("metadata").eq("id", entityId).maybeSingle()) as {
        data: Row | null;
        error: { message: string } | null;
      };
      if (current.error) throw new Error(current.error.message);
      if (!current.data) throw new Error("This entity could not be found.");
      const next = mergeBrandTerms(current.data.metadata, terms);
      const res = (await t("athletes").update({ metadata: next } as never).eq("id", entityId).select("id")) as {
        data: Row[] | null;
        error: { message: string } | null;
      };
      if (res.error) throw new Error(res.error.message);
      if (!res.data || res.data.length !== 1) throw new Error("The change was not saved — you may not have access to edit this entity.");
      return parseBrandTerms(next.brand_terms);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(entityId) }),
  });
}
