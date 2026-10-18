import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface VolumeTier {
  min_qty: number;
  discount_pct: number;
}

export interface PricingConfig {
  base_markup_pct: number;
  tiers: VolumeTier[];
}

const DEFAULT: PricingConfig = { base_markup_pct: 50, tiers: [] };

/** Returns the org's base markup % and volume discount tiers (sorted by min_qty asc). */
export function usePortalPricing(organizationId: string | null) {
  const [config, setConfig] = useState<PricingConfig>(DEFAULT);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [cfgRes, tiersRes] = await Promise.all([
        supabase
          .from("org_pricing_config")
          .select("base_markup_pct")
          .eq("organization_id", organizationId)
          .maybeSingle(),
        supabase
          .from("volume_discount_tiers")
          .select("min_qty, discount_pct")
          .eq("organization_id", organizationId)
          .order("min_qty", { ascending: true }),
      ]);
      if (cancelled) return;
      setConfig({
        base_markup_pct: Number(cfgRes.data?.base_markup_pct ?? 50),
        tiers: (tiersRes.data ?? []).map((t) => ({
          min_qty: t.min_qty,
          discount_pct: Number(t.discount_pct),
        })),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return { config, loading };
}

/** Pick the best (largest min_qty <= qty) tier discount; 0 if none apply. */
/**
 * The ladder the SERVER applies when an org has no volume_discount_tiers
 * (portal_quote_order's fallback). Kept in one place so every portal screen
 * quotes the same discount the order is charged.
 */
export const PORTAL_FALLBACK_TIERS: VolumeTier[] = [
  { min_qty: 50, discount_pct: 10 },
  { min_qty: 100, discount_pct: 15 },
  { min_qty: 250, discount_pct: 20 },
  { min_qty: 500, discount_pct: 25 },
];

/** The org's tiers when configured, else the server's fallback ladder. */
export function effectiveTiers(tiers: VolumeTier[]): VolumeTier[] {
  return tiers.length ? tiers : PORTAL_FALLBACK_TIERS;
}

export function pickDiscount(tiers: VolumeTier[], qty: number): number {
  let pct = 0;
  for (const t of tiers) {
    if (qty >= t.min_qty && t.discount_pct > pct) pct = t.discount_pct;
  }
  return pct;
}