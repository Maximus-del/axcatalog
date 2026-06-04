import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyAffiliate } from "@/hooks/useAffiliate";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AffiliateSignupCTA from "@/components/affiliate/AffiliateSignupCTA";

interface Sale {
  id: string;
  code: string;
  gross_amount: number;
  commission_amount: number;
  status: "pending" | "approved" | "paid" | "void";
  attributed_at: string;
}

export default function AffiliateSales() {
  const { affiliate, loading: affLoading } = useMyAffiliate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!affiliate) return;
    setLoading(true);
    void supabase
      .from("affiliate_sales")
      .select("id, code, gross_amount, commission_amount, status, attributed_at")
      .eq("affiliate_id", affiliate.id)
      .order("attributed_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setSales((data ?? []) as Sale[]);
        setLoading(false);
      });
  }, [affiliate?.id]);

  if (affLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!affiliate) return <AffiliateSignupCTA />;

  return (
    <div className="space-y-6">
      <h1 className="ax-section-header">Sales</h1>
      <div className="ax-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Code</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : sales.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No sales yet.</TableCell></TableRow>
            ) : sales.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{new Date(s.attributed_at).toLocaleDateString()}</TableCell>
                <TableCell className="font-mono text-xs">{s.code}</TableCell>
                <TableCell className="text-right">${Number(s.gross_amount).toFixed(2)}</TableCell>
                <TableCell className="text-right font-semibold">${Number(s.commission_amount).toFixed(2)}</TableCell>
                <TableCell><Badge variant={s.status === "paid" ? "default" : s.status === "void" ? "destructive" : "outline"} className="uppercase">{s.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}