import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export type CatalogTier = "athlete" | "corporate" | "standard";

interface ResolvedCatalogToken {
  tier: CatalogTier;
  customer_name: string | null;
  customer_email: string | null;
  organization_id: string | null;
}

interface CatalogAccessValue {
  token: string | null;
  tier: CatalogTier;
  customerName: string | null;
  customerEmail: string | null;
  organizationId: string | null;
  loading: boolean;
}

const STORAGE_KEY = "wholesale_catalog_token_v1";
const CatalogAccessContext = createContext<CatalogAccessValue | null>(null);

export function CatalogAccessProvider({ children }: { children: React.ReactNode }) {
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get("t");

  const initialToken =
    urlToken ??
    (typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null);

  const [token, setToken] = useState<string | null>(initialToken);
  const [resolved, setResolved] = useState<ResolvedCatalogToken | null>(null);
  const [loading, setLoading] = useState<boolean>(!!initialToken);

  // Update token when URL param changes
  useEffect(() => {
    if (urlToken && urlToken !== token) {
      setToken(urlToken);
      try {
        window.localStorage.setItem(STORAGE_KEY, urlToken);
      } catch {
        /* ignore */
      }
    }
  }, [urlToken, token]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setResolved(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("resolve_catalog_token" as any, {
        p_token: token,
      } as any);
      if (cancelled) return;
      if (error || !Array.isArray(data) || data.length === 0) {
        setResolved(null);
      } else {
        const row = data[0] as ResolvedCatalogToken;
        setResolved({
          tier: (row.tier as CatalogTier) ?? "standard",
          customer_name: row.customer_name ?? null,
          customer_email: row.customer_email ?? null,
          organization_id: row.organization_id ?? null,
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo<CatalogAccessValue>(
    () => ({
      token,
      tier: resolved?.tier ?? "standard",
      customerName: resolved?.customer_name ?? null,
      customerEmail: resolved?.customer_email ?? null,
      organizationId: resolved?.organization_id ?? null,
      loading,
    }),
    [token, resolved, loading],
  );

  return (
    <CatalogAccessContext.Provider value={value}>{children}</CatalogAccessContext.Provider>
  );
}

export function useCatalogAccess() {
  const ctx = useContext(CatalogAccessContext);
  if (!ctx) throw new Error("useCatalogAccess must be used within CatalogAccessProvider");
  return ctx;
}

export function priceForTier(
  item: {
    price_athlete: number | null;
    price_corporate: number | null;
    price_standard: number | null;
  },
  tier: CatalogTier,
): number | null {
  const v =
    tier === "athlete"
      ? item.price_athlete
      : tier === "corporate"
        ? item.price_corporate
        : item.price_standard;
  return typeof v === "number" && v > 0 ? v : null;
}