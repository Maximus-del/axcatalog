import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

interface Affiliate {
  id: string;
  display_name: string;
  email: string | null;
  code: string;
  status: "pending" | "active" | "paused" | "rejected";
  commission_percent: number;
  balance_owed: number;
  total_earned: number;
  total_paid: number;
  created_at: string;
}

interface RequestRow {
  id: string;
  affiliate_id: string;
  product_id: string;
  status: string;
  affiliate: { display_name: string; code: string } | null;
  product: { title: string } | null;
}

export default function AffiliatesList() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [payoutFor, setPayoutFor] = useState<Affiliate | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutMethod, setPayoutMethod] = useState("venmo");
  const [payoutRef, setPayoutRef] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: aff }, { data: reqs }] = await Promise.all([
      supabase.from("affiliates").select("*").order("created_at", { ascending: false }),
      supabase
        .from("affiliate_product_requests")
        .select("id, affiliate_id, product_id, status, affiliate:affiliates(display_name, code), product:products(title)")
        .eq("status", "pending")
        .order("requested_at", { ascending: false }),
    ]);
    setAffiliates((aff ?? []) as Affiliate[]);
    setRequests((reqs ?? []) as unknown as RequestRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const setStatus = async (id: string, status: Affiliate["status"]) => {
    const { error } = await supabase.rpc("set_affiliate_status", { _affiliate_id: id, _status: status });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: `Status set to ${status}` });
    await load();
  };

  const decideRequest = async (id: string, approve: boolean) => {
    const { error } = await supabase.rpc("decide_affiliate_request", { _request_id: id, _approve: approve });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: approve ? "Approved" : "Rejected" });
    await load();
  };

  const recordPayout = async () => {
    if (!payoutFor) return;
    const amount = parseFloat(payoutAmount);
    if (!amount || amount <= 0) return toast({ title: "Enter a valid amount", variant: "destructive" });
    const { error } = await supabase.rpc("record_affiliate_payout", {
      _affiliate_id: payoutFor.id,
      _amount: amount,
      _method: payoutMethod as "venmo" | "ach" | "paypal" | "other",
      _reference: payoutRef || null,
      _notes: null,
    });
    if (error) return toast({ title: "Failed", description: error.message, variant: "destructive" });
    toast({ title: "Payout recorded" });
    setPayoutFor(null);
    setPayoutAmount("");
    setPayoutRef("");
    await load();
  };

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="ax-page-title">Affiliates</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage affiliate applications, product approvals, and payouts.</p>
      </div>

      {requests.length > 0 && (
        <div>
          <h2 className="ax-section-header mb-3">Pending product requests ({requests.length})</h2>
          <div className="ax-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Affiliate</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.affiliate?.display_name} <span className="text-muted-foreground text-xs ml-2">{r.affiliate?.code}</span></TableCell>
                    <TableCell>{r.product?.title ?? r.product_id}</TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" onClick={() => void decideRequest(r.id, true)}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => void decideRequest(r.id, false)}>Reject</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div>
        <h2 className="ax-section-header mb-3">All affiliates</h2>
        <div className="ax-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Earned</TableHead>
                <TableHead className="text-right">Owed</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : affiliates.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No affiliates yet.</TableCell></TableRow>
              ) : affiliates.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <p className="font-medium">{a.display_name}</p>
                    {a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.code}</TableCell>
                  <TableCell><Badge variant={a.status === "active" ? "default" : a.status === "rejected" ? "destructive" : "outline"} className="uppercase">{a.status}</Badge></TableCell>
                  <TableCell className="text-right">${Number(a.total_earned).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-semibold">${Number(a.balance_owed).toFixed(2)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    {a.status === "pending" && <Button size="sm" onClick={() => void setStatus(a.id, "active")}>Approve</Button>}
                    {a.status === "active" && <Button size="sm" variant="outline" onClick={() => void setStatus(a.id, "paused")}>Pause</Button>}
                    {a.status === "paused" && <Button size="sm" onClick={() => void setStatus(a.id, "active")}>Reactivate</Button>}
                    {a.balance_owed > 0 && <Button size="sm" variant="outline" onClick={() => { setPayoutFor(a); setPayoutAmount(String(a.balance_owed)); }}>Pay out</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!payoutFor} onOpenChange={(o) => !o && setPayoutFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record payout — {payoutFor?.display_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Balance owed: ${Number(payoutFor?.balance_owed ?? 0).toFixed(2)}</p>
            </div>
            <div>
              <Label>Method</Label>
              <Select value={payoutMethod} onValueChange={setPayoutMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="venmo">Venmo</SelectItem>
                  <SelectItem value="paypal">PayPal</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference / note</Label>
              <Input value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} placeholder="Transaction ID, handle, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayoutFor(null)}>Cancel</Button>
            <Button onClick={() => void recordPayout()}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}