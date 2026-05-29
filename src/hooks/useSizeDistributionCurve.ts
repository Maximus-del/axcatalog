import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SizeCurve = Record<string, number>;

const FALLBACK_CURVE: SizeCurve = {
  S: 0.1,
  M: 0.2,
  L: 0.3,
  XL: 0.25,
  "2XL": 0.1,
  "3XL": 0.05,
};

/**
 * Loads the org-specific default size distribution curve if one exists,
 * otherwise falls back to the global default row (organization_id IS NULL),
 * otherwise an in-code fallback.
 */
export function useSizeDistributionCurve(organizationId: string | null) {
  const [curve, setCurve] = useState<SizeCurve>(FALLBACK_CURVE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("size_distribution_curves" as never)
        .select("organization_id, curve, is_default")
        .eq("is_default", true);
      if (cancelled || !data) return;
      const rows = data as Array<{ organization_id: string | null; curve: SizeCurve }>;
      const orgRow = organizationId
        ? rows.find((r) => r.organization_id === organizationId)
        : null;
      const globalRow = rows.find((r) => r.organization_id === null);
      const chosen = orgRow?.curve ?? globalRow?.curve ?? FALLBACK_CURVE;
      setCurve(chosen);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return curve;
}

/**
 * Distribute a total quantity across `sizes` using the given curve.
 * Rounds each bucket, then rebalances any remainder onto the largest-weight
 * bucket (typically "L") so the sum exactly equals `total`.
 */
export function distributeByCurve(
  total: number,
  sizes: readonly string[],
  curve: SizeCurve,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (total <= 0) {
    sizes.forEach((s) => (out[s] = 0));
    return out;
  }
  let sum = 0;
  sizes.forEach((s) => {
    const w = curve[s] ?? 0;
    const v = Math.round(total * w);
    out[s] = v;
    sum += v;
  });
  const diff = total - sum;
  if (diff !== 0) {
    // largest-weight bucket
    const target = sizes.reduce((best, s) =>
      (curve[s] ?? 0) > (curve[best] ?? 0) ? s : best,
    sizes[0]);
    out[target] = Math.max(0, (out[target] ?? 0) + diff);
  }
  return out;
}