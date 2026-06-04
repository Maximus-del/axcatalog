import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyAffiliate } from "@/hooks/useAffiliate";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AffiliateSignupCTA from "@/components/affiliate/AffiliateSignupCTA";

interface Payout {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  paid_at: string;
}

export default function AffiliatePayouts() {
  const { affiliate, loading: affLoading } = useMyAffiliate();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!affiliate) return;
    setLoading(true);
    void supabase
      .from("affiliate_payouts")
      .select("id, amount, method, reference, notes, paid_at")
      .eq("affiliate_id", affiliate.id)
      .order("paid_at", { ascending: false })
      .then(({ data }) => {
        setPayouts((data ?? []) as Payout[]);
        setLoading(false);
      });
  }, [affiliate?.id]);

  if (affLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!affiliate) return <AffiliateSignupCTA />;

  return (
    <div className="space-y-6">
      <h1 className="ax-section-header">Payouts</h1>
      <div className="ax-card p-5 grid grid-cols-3 gap-4">
        <div><p className="ax-label text-muted-foreground">Balance owed</p><p className="text-xl font-bold mt-1">${Number(affiliate.balance_owed).toFixed(2)}</p></div>
        <div><p className="ax-label text-muted-foreground">Lifetime earned</p><p className="text-xl font-bold mt-1">${Number(affiliate.total_earned).toFixed(2)}</p></div>
        <div><p className="ax-label text-muted-foreground">Lifetime paid</p><p className="text-xl font-bold mt-1">${Number(affiliate.total_paid).toFixed(2)}</p></div>
      </div>
      <div className="ax-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : payouts.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No payouts yet.</TableCell></TableRow>
            ) : payouts.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{new Date(p.paid_at).toLocaleDateString()}</TableCell>
                <TableCell className="uppercase text-xs">{p.method}</TableCell>
                <TableCell className="font-mono text-xs">{p.reference ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold">${Number(p.amount).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}