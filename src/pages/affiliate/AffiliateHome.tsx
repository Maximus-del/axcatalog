import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMyAffiliate } from "@/hooks/useAffiliate";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Copy, ExternalLink } from "lucide-react";
import AffiliateSignupCTA from "@/components/affiliate/AffiliateSignupCTA";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ax-card p-5">
      <p className="ax-label text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default function AffiliateHome() {
  const { affiliate, loading } = useMyAffiliate();
  const [salesCount, setSalesCount] = useState(0);
  const [monthCommission, setMonthCommission] = useState(0);

  useEffect(() => {
    if (!affiliate) return;
    void (async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("affiliate_sales")
        .select("commission_amount, status, attributed_at")
        .eq("affiliate_id", affiliate.id)
        .gte("attributed_at", start.toISOString());
      const rows = (data ?? []) as { commission_amount: number; status: string }[];
      setSalesCount(rows.filter((r) => r.status !== "void").length);
      setMonthCommission(
        rows.filter((r) => r.status !== "void").reduce((s, r) => s + Number(r.commission_amount), 0),
      );
    })();
  }, [affiliate]);

  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!affiliate) return <AffiliateSignupCTA />;

  const shareLink = `${window.location.origin}/?ref=${affiliate.code}`;

  return (
    <div className="space-y-8">
      {affiliate.status !== "active" && (
        <div className="ax-card p-4 border-accent/30 bg-accent/5">
          <p className="text-sm">
            <Badge variant="outline" className="mr-2 uppercase">{affiliate.status}</Badge>
            {affiliate.status === "pending"
              ? "Your application is awaiting admin approval. You'll be notified when active."
              : "Your account is currently paused. Contact an admin to reactivate."}
          </p>
        </div>
      )}

      <div className="ax-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="ax-label text-muted-foreground">Your code</p>
            <p className="text-3xl font-bold tracking-wider mt-1">{affiliate.code}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Buyers get {affiliate.buyer_discount_percent}% off · you earn {affiliate.commission_percent}%
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(affiliate.code);
                toast({ title: "Code copied" });
              }}
            >
              <Copy className="h-4 w-4 mr-2" /> Copy code
            </Button>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(shareLink);
                toast({ title: "Link copied" });
              }}
            >
              <ExternalLink className="h-4 w-4 mr-2" /> Copy share link
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Balance owed" value={`$${Number(affiliate.balance_owed).toFixed(2)}`} />
        <Stat label="Lifetime earned" value={`$${Number(affiliate.total_earned).toFixed(2)}`} />
        <Stat label="Lifetime paid" value={`$${Number(affiliate.total_paid).toFixed(2)}`} />
        <Stat label="Sales this month" value={String(salesCount)} />
      </div>

      <div className="ax-card p-6">
        <h2 className="ax-section-header mb-2">This month</h2>
        <p className="text-sm text-muted-foreground">
          You've earned <span className="text-foreground font-semibold">${monthCommission.toFixed(2)}</span> in commission across {salesCount} sale{salesCount === 1 ? "" : "s"}.
        </p>
        <div className="mt-4 flex gap-2">
          <Button asChild variant="outline"><Link to="/affiliate/products">Browse products</Link></Button>
          <Button asChild variant="outline"><Link to="/affiliate/sales">View sales</Link></Button>
        </div>
      </div>
    </div>
  );
}