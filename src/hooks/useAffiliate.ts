import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export interface Affiliate {
  id: string;
  user_id: string;
  display_name: string;
  email: string | null;
  code: string;
  status: "pending" | "active" | "paused" | "rejected";
  commission_percent: number;
  buyer_discount_percent: number;
  payout_method_notes: string | null;
  total_earned: number;
  total_paid: number;
  balance_owed: number;
}

export function useMyAffiliate() {
  const { user } = useAuth();
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) {
      setAffiliate(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("affiliates")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    setAffiliate((data as Affiliate) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { affiliate, loading, refetch };
}