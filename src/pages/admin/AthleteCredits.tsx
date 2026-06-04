import { useEffect, useMemo, useState } from "react";
import { Wallet, Plus, Minus, History, Settings2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

interface Row {
  id: string;
  athlete_id: string;
  balance: number;
  monthly_credit: number;
  max_balance: number;
  total_earned: number;
  total_used: number;
  last_accrual_at: string | null;
  athlete: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
}

interface Txn {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  notes: string | null;
  created_at: string;
  order_request_id: string | null;
}

function fmt(n: number) {
  return `$${Number(n).toFixed(2)}`;
}

export default function AthleteCredits() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [adjust, setAdjust] = useState<{ row: Row; sign: 1 | -1 } | null>(null);
  const [editLimits, setEditLimits] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row | null>(null);

  const refetch = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("athlete_credit_wallets")
      .select("*, athlete:athletes(full_name, first_name, last_name)")
      .order("balance", { ascending: false });
    setRows(
      ((data ?? []) as unknown as Row[]).map((r) => ({
        ...r,
        balance: Number(r.balance),
        monthly_credit: Number(r.monthly_credit),
        max_balance: Number(r.max_balance),
        total_earned: Number(r.total_earned),
        total_used: Number(r.total_used),
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    void refetch();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (r.athlete?.full_name ||
        `${r.athlete?.first_name ?? ""} ${r.athlete?.last_name ?? ""}`).toLowerCase();
      return name.includes(q);
    });
  }, [rows, filter]);

  const runAccrual = async () => {
    const { data, error } = await supabase.rpc("accrue_monthly_credits");
    if (error) toast.error(error.message);
    else toast.success(`Accrued credits to ${data ?? 0} athletes`);
    await refetch();
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-accent" />
          <h1 className="text-xl font-bold tracking-tight">Athlete Credits</h1>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search athlete..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-56"
          />
          <Button onClick={runAccrual} variant="outline">
            Run Monthly Accrual
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Athlete</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Monthly</TableHead>
              <TableHead className="text-right">Max</TableHead>
              <TableHead className="text-right">Earned</TableHead>
              <TableHead className="text-right">Used</TableHead>
              <TableHead>Last Accrual</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No athletes</TableCell></TableRow>
            ) : filtered.map((r) => {
              const name = r.athlete?.full_name || `${r.athlete?.first_name ?? ""} ${r.athlete?.last_name ?? ""}`.trim() || "—";
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{name}</TableCell>
                  <TableCell className="text-right font-bold text-accent tabular-nums">{fmt(r.balance)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.monthly_credit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.max_balance)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(r.total_earned)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(r.total_used)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.last_accrual_at ? new Date(r.last_accrual_at).toLocaleDateString() : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setAdjust({ row: r, sign: 1 })} title="Add credit">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAdjust({ row: r, sign: -1 })} title="Subtract credit">
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditLimits(r)} title="Edit limits">
                        <Settings2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setHistory(r)} title="History">
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AdjustDialog
        state={adjust}
        onClose={() => setAdjust(null)}
        onDone={refetch}
      />
      <LimitsDialog
        row={editLimits}
        onClose={() => setEditLimits(null)}
        onDone={refetch}
      />
      <HistorySheet row={history} onClose={() => setHistory(null)} />
    </div>
  );
}

function AdjustDialog({
  state, onClose, onDone,
}: { state: { row: Row; sign: 1 | -1 } | null; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setAmount(""); setNotes(""); }, [state]);

  if (!state) return null;
  const { row, sign } = state;
  const adding = sign > 0;

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter an amount"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("admin_adjust_credit", {
      _athlete_id: row.athlete_id,
      _amount: sign * amt,
      _notes: notes || (adding ? "Manual add" : "Manual subtract"),
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Credit adjusted"); onDone(); onClose(); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{adding ? "Add" : "Subtract"} Credit</DialogTitle>
          <DialogDescription>Current balance: {fmt(row.balance)} (max {fmt(row.max_balance)})</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Amount ($)</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for adjustment" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {adding ? "Add" : "Subtract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LimitsDialog({
  row, onClose, onDone,
}: { row: Row | null; onClose: () => void; onDone: () => void }) {
  const [monthly, setMonthly] = useState("");
  const [max, setMax] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (row) { setMonthly(String(row.monthly_credit)); setMax(String(row.max_balance)); }
  }, [row]);

  if (!row) return null;

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("athlete_credit_wallets")
      .update({ monthly_credit: Number(monthly), max_balance: Number(max) })
      .eq("id", row.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Limits updated"); onDone(); onClose(); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Credit Limits</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Monthly Credit ($)</Label>
            <Input type="number" step="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </div>
          <div>
            <Label>Max Balance ($)</Label>
            <Input type="number" step="0.01" value={max} onChange={(e) => setMax(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistorySheet({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!row) return;
    setLoading(true);
    void supabase
      .from("athlete_credit_transactions")
      .select("id, type, amount, balance_after, notes, created_at, order_request_id")
      .eq("wallet_id", row.id)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setTxns(((data ?? []) as Txn[]).map((t) => ({
          ...t, amount: Number(t.amount), balance_after: Number(t.balance_after),
        })));
        setLoading(false);
      });
  }, [row]);

  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Credit History</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {loading ? <Skeleton className="h-32 w-full" /> :
            txns.length === 0 ? <div className="text-sm text-muted-foreground">No transactions yet</div> :
              txns.map((t) => (
                <div key={t.id} className="rounded border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="uppercase tracking-wider text-[10px] font-semibold text-muted-foreground">
                      {t.type}
                    </span>
                    <span className={`font-bold tabular-nums ${t.amount >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {t.amount >= 0 ? "+" : ""}{fmt(t.amount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    <span>{new Date(t.created_at).toLocaleString()}</span>
                    <span>Bal: {fmt(t.balance_after)}</span>
                  </div>
                  {t.notes && <div className="text-xs text-muted-foreground mt-1">{t.notes}</div>}
                  {t.order_request_id && (
                    <a href={`/admin/orders/${t.order_request_id}`} className="text-xs text-accent hover:underline">
                      View order →
                    </a>
                  )}
                </div>
              ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}