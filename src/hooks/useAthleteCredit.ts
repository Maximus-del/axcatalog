import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CreditWallet {
  id: string;
  athlete_id: string;
  balance: number;
  monthly_credit: number;
  max_balance: number;
  total_earned: number;
  total_used: number;
  last_accrual_at: string | null;
}

export interface CreditTransaction {
  id: string;
  wallet_id: string;
  athlete_id: string;
  order_request_id: string | null;
  type: "accrual" | "used" | "adjustment" | "refund";
  amount: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
}

export function useAthleteCredit(athleteId: string | null) {
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!athleteId) {
      setWallet(null);
      setTransactions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: w } = await supabase
      .from("athlete_credit_wallets")
      .select("*")
      .eq("athlete_id", athleteId)
      .maybeSingle();
    if (w) {
      setWallet({
        ...w,
        balance: Number(w.balance),
        monthly_credit: Number(w.monthly_credit),
        max_balance: Number(w.max_balance),
        total_earned: Number(w.total_earned),
        total_used: Number(w.total_used),
      });
      const { data: txs } = await supabase
        .from("athlete_credit_transactions")
        .select("*")
        .eq("wallet_id", w.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setTransactions(
        (txs ?? []).map((t) => ({
          ...t,
          amount: Number(t.amount),
          balance_after: Number(t.balance_after),
        })) as CreditTransaction[],
      );
    } else {
      setWallet(null);
      setTransactions([]);
    }
    setLoading(false);
  }, [athleteId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { wallet, transactions, loading, refetch };
}