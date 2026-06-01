import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Plus, Tag } from "lucide-react";

interface Batch {
  id: string; file_name: string; status: string; total_rows: number;
  orders_imported: number; orders_skipped: number;
  line_items_imported: number; line_items_attributed: number;
  line_items_unattributed: number; uploaded_at: string; completed_at: string | null;
  error_log: any;
}
interface Org { id: string; name: string; }
interface OrgRollup { org_id: string | null; org_name: string; line_items: number; revenue: number; }
interface Unattrib {
  product_title: string; sku: string | null;
  line_items: number; quantity: number; revenue: number;
  sample_line_id: string;
}

export default function ImportBatchDetail() {
  const { id: batchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [rollup, setRollup] = useState<OrgRollup[]>([]);
  const [unattrib, setUnattrib] = useState<Unattrib[]>([]);
  const [upchargeStats, setUpchargeStats] = useState<{ count: number; total: number }>({ count: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const [assignTarget, setAssignTarget] = useState<Unattrib | null>(null);

  const load = useCallback(async () => {
    if (!batchId) return;
    setLoading(true);
    const [b, oData] = await Promise.all([
      supabase.from("import_batches").select("*").eq("id", batchId).single(),
      supabase.from("organizations").select("id, name").order("name"),
    ]);

    setBatch(b.data as Batch);
    setOrgs((oData.data ?? []) as Org[]);

    // Compute rollup client-side
    {
      const { data: orderIds } = await supabase.from("orders")
        .select("id").eq("import_batch_id", batchId);
      const ids = (orderIds ?? []).map((o: any) => o.id);
      if (ids.length) {
        const { data: lis } = await supabase.from("order_line_items")
          .select("attributed_org_id, line_total, is_upcharge")
          .in("order_id", ids);
        const map = new Map<string, { line_items: number; revenue: number }>();
        let upN = 0, upTotal = 0;
        for (const li of lis ?? []) {
          if (li.is_upcharge) {
            upN++;
            upTotal += Number(li.line_total ?? 0);
            continue;
          }
          const k = li.attributed_org_id ?? "__un__";
          const cur = map.get(k) ?? { line_items: 0, revenue: 0 };
          cur.line_items++; cur.revenue += Number(li.line_total ?? 0);
          map.set(k, cur);
        }
        setUpchargeStats({ count: upN, total: Math.round(upTotal * 100) / 100 });
        const orgMap = new Map((oData.data ?? []).map((o: any) => [o.id, o.name]));
        setRollup([...map.entries()].map(([k, v]) => ({
          org_id: k === "__un__" ? null : k,
          org_name: k === "__un__" ? "Unattributed" : (orgMap.get(k) ?? k),
          line_items: v.line_items,
          revenue: Math.round(v.revenue * 100) / 100,
        })).sort((a, b) => b.revenue - a.revenue));
      } else {
        setRollup([]);
        setUpchargeStats({ count: 0, total: 0 });
      }
    }

    // Unattributed grouped by title (client side)
    {
      const { data: orderIds } = await supabase.from("orders")
        .select("id").eq("import_batch_id", batchId);
      const ids = (orderIds ?? []).map((o: any) => o.id);
      if (ids.length) {
        const { data: lis } = await supabase.from("order_line_items")
          .select("id, product_title, sku, quantity, line_total")
          .in("order_id", ids)
          .is("attributed_org_id", null)
          .eq("is_upcharge", false);
        const map = new Map<string, Unattrib>();
        for (const li of lis ?? []) {
          const key = (li.product_title ?? "").toLowerCase();
          const cur = map.get(key) ?? {
            product_title: li.product_title, sku: li.sku,
            line_items: 0, quantity: 0, revenue: 0,
            sample_line_id: li.id,
          };
          cur.line_items++;
          cur.quantity += li.quantity ?? 0;
          cur.revenue += Number(li.line_total ?? 0);
          map.set(key, cur);
        }
        setUnattrib([...map.values()].sort((a, b) => b.revenue - a.revenue));
      } else {
        setUnattrib([]);
      }
    }
    setLoading(false);
  }, [batchId]);

  useEffect(() => { void load(); }, [load]);

  const totalLineItems = useMemo(
    () => rollup.reduce((a, b) => a + b.line_items, 0), [rollup],
  );
  const totalRevenue = useMemo(
    () => rollup.reduce((a, b) => a + b.revenue, 0), [rollup],
  );

  const handleRerun = async () => {
    setRerunning(true);
    const t = toast.loading("Re-running attribution...");
    try {
      const { data, error } = await supabase.functions.invoke("rerun-attribution", {
        body: { batch_id: batchId },
      });
      toast.dismiss(t);
      if (error) toast.error(error.message);
      else toast.success(`Updated ${data?.updated ?? 0} of ${data?.scanned ?? 0} line items`);
      void load();
    } finally { setRerunning(false); }
  };

  if (loading || !batch) {
    return <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>;
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/imports/orders")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> All imports
        </Button>
      </div>
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="ax-section-header mb-2">Import Batch</div>
          <h1 className="text-2xl font-bold truncate">{batch.file_name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(batch.uploaded_at).toLocaleString()} ·
            {" "}{batch.orders_imported} orders ({batch.orders_skipped} dupes skipped) ·
            {" "}{batch.line_items_imported} line items
          </p>
        </div>
        <Button onClick={handleRerun} disabled={rerunning} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${rerunning ? "animate-spin" : ""}`} />
          Re-run attribution
        </Button>
      </header>

      {/* Stacked bar: attribution by org */}
      <section className="ax-card">
        <h2 className="text-sm font-semibold mb-3">Attribution by org</h2>
        {totalLineItems === 0 ? (
          <p className="text-sm text-muted-foreground">No line items.</p>
        ) : (
          <>
            <div className="flex h-7 w-full overflow-hidden rounded-md bg-muted">
              {rollup.map((r, i) => {
                const pct = (r.line_items / totalLineItems) * 100;
                const isUnatt = r.org_id == null;
                const colorVar = isUnatt
                  ? "hsl(var(--destructive))"
                  : ORG_COLORS[i % ORG_COLORS.length];
                return (
                  <div key={r.org_name} style={{ width: `${pct}%`, background: colorVar }}
                       title={`${r.org_name}: ${r.line_items} line items · $${r.revenue.toFixed(2)}`} />
                );
              })}
            </div>
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
              {rollup.map((r, i) => (
                <div key={r.org_name} className="flex items-center justify-between border-l-2 pl-2"
                     style={{ borderColor: r.org_id == null ? "hsl(var(--destructive))" : ORG_COLORS[i % ORG_COLORS.length] }}>
                  <span className={r.org_id == null ? "text-destructive" : ""}>{r.org_name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {r.line_items} · ${r.revenue.toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-l-2 border-transparent pl-2 col-span-full pt-1 border-t">
                <span className="font-medium">Total</span>
                <span className="tabular-nums font-medium">
                  {totalLineItems} · ${totalRevenue.toFixed(2)}
                </span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Unattributed review */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            Unattributed line items ({unattrib.length} unique titles)
          </h2>
        </div>
        {unattrib.length === 0 ? (
          <div className="ax-card text-center text-sm text-muted-foreground py-10">
            🎉 Every line item was attributed.
          </div>
        ) : (
          <div className="ax-card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Product title</th>
                  <th className="text-left px-4 py-2">SKU</th>
                  <th className="text-right px-4 py-2">Line items</th>
                  <th className="text-right px-4 py-2">Qty</th>
                  <th className="text-right px-4 py-2">Revenue</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {unattrib.map((u) => (
                  <tr key={u.sample_line_id} className="border-t border-border">
                    <td className="px-4 py-2 truncate max-w-[420px]">{u.product_title}</td>
                    <td className="px-4 py-2 text-muted-foreground">{u.sku ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{u.line_items}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{u.quantity}</td>
                    <td className="px-4 py-2 text-right tabular-nums">${u.revenue.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setAssignTarget(u)}>
                        <Tag className="h-3 w-3 mr-1" /> Create rule
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <AssignDialog
        open={!!assignTarget}
        target={assignTarget}
        orgs={orgs}
        onClose={() => setAssignTarget(null)}
        onCreated={() => { setAssignTarget(null); void handleRerun(); }}
      />
    </div>
  );
}

const ORG_COLORS = [
  "hsl(var(--accent))",
  "hsl(220 70% 50%)",
  "hsl(160 60% 45%)",
  "hsl(280 65% 55%)",
  "hsl(35 90% 55%)",
];

function AssignDialog({
  open, target, orgs, onClose, onCreated,
}: {
  open: boolean; target: Unattrib | null; orgs: Org[];
  onClose: () => void; onCreated: () => void;
}) {
  const [orgId, setOrgId] = useState<string>("");
  const [matchType, setMatchType] = useState<string>("starts_with");
  const [pattern, setPattern] = useState<string>("");
  const [priority, setPriority] = useState<number>(100);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      const t = target.product_title ?? "";
      // Suggest first 2 words as a starts_with pattern
      const words = t.split(/\s+/).slice(0, 2).join(" ");
      setPattern(words);
      setMatchType("starts_with");
      setPriority(100);
      setOrgId("");
    }
  }, [target]);

  if (!target) return null;

  const handleSave = async () => {
    if (!orgId || !pattern.trim()) {
      toast.error("Pick an org and a pattern");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("product_attribution_rules").insert({
      organization_id: orgId,
      match_type: matchType,
      match_pattern: pattern.trim(),
      priority,
      is_active: true,
      notes: `Created from "${target.product_title}"`,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Rule created — re-running attribution");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create attribution rule</DialogTitle>
          <DialogDescription className="truncate">
            For: <span className="text-foreground">{target.product_title}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Assign matching line items to</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger><SelectValue placeholder="Pick org..." /></SelectTrigger>
              <SelectContent>
                {orgs.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Match type</Label>
            <Select value={matchType} onValueChange={setMatchType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="starts_with">Title starts with</SelectItem>
                <SelectItem value="contains">Title contains</SelectItem>
                <SelectItem value="exact">Title exact match</SelectItem>
                <SelectItem value="sku_exact">SKU exact</SelectItem>
                <SelectItem value="sku_contains">SKU contains</SelectItem>
                <SelectItem value="tag_contains">Order tag contains</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Pattern</Label>
            <Input value={pattern} onChange={(e) => setPattern(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Input type="number" value={priority}
                   onChange={(e) => setPriority(parseInt(e.target.value || "100", 10))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Plus className="h-4 w-4 mr-1" />
            {saving ? "Saving..." : "Create rule & re-run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
