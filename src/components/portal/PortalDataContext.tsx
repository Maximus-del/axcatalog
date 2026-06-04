// Shared portal data + actions, hoisted from PortalHome so multiple
// child routes can read the same athlete/products/sales without each
// page re-running every hook.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAthlete } from "@/hooks/useCurrentAthlete";
import { usePortalStats } from "@/hooks/usePortalStats";
import { usePortalSales } from "@/hooks/usePortalSales";
import { usePortalProducts } from "@/hooks/usePortalProducts";
import { usePortalOrders } from "@/hooks/usePortalOrders";
import { usePortalHiddenProducts } from "@/hooks/usePortalHiddenProducts";

type Athlete = ReturnType<typeof useCurrentAthlete>["athlete"];

interface PortalDataValue {
  athlete: NonNullable<Athlete>;
  isImpersonating: boolean;
  teamName: string | null;
  stats: ReturnType<typeof usePortalStats>;
  sales: ReturnType<typeof usePortalSales>;
  products: ReturnType<typeof usePortalProducts>["products"];
  productsLoading: boolean;
  refetchProducts: () => void;
  orders: ReturnType<typeof usePortalOrders>["orders"];
  ordersLoading: boolean;
  refetchOrders: () => void;
  hidden: ReturnType<typeof usePortalHiddenProducts>;
  openOrderSheet: () => void;
  openGuard: () => void;
}

const Ctx = createContext<PortalDataValue | null>(null);

export function usePortalData(): PortalDataValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePortalData must be used inside <PortalDataProvider>");
  return v;
}

interface ProviderProps {
  children: ReactNode;
  athlete: NonNullable<Athlete>;
  isImpersonating: boolean;
  openOrderSheet: () => void;
  openGuard: () => void;
}

export function PortalDataProvider({
  children,
  athlete,
  isImpersonating,
  openOrderSheet,
  openGuard,
}: ProviderProps) {
  const stats = usePortalStats(athlete.id);
  const sales = usePortalSales(athlete.organization_id ?? null);
  const { products, loading: productsLoading, refetch: refetchProducts } =
    usePortalProducts(athlete.id);
  const { orders, loading: ordersLoading, refetch: refetchOrders } = usePortalOrders(athlete.id);
  const hidden = usePortalHiddenProducts(athlete.id);

  const [teamName, setTeamName] = useState<string | null>(null);
  useEffect(() => {
    if (!athlete.current_team_id) {
      setTeamName(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("teams")
        .select("name")
        .eq("id", athlete.current_team_id!)
        .maybeSingle();
      if (!cancelled) setTeamName(data?.name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [athlete.current_team_id]);

  const value: PortalDataValue = {
    athlete,
    isImpersonating,
    teamName,
    stats,
    sales,
    products,
    productsLoading,
    refetchProducts: useCallback(() => refetchProducts(), [refetchProducts]),
    orders,
    ordersLoading,
    refetchOrders: useCallback(() => refetchOrders(), [refetchOrders]),
    hidden,
    openOrderSheet,
    openGuard,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}