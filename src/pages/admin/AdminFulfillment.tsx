import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Truck, PackageCheck, PackageX, PackageOpen, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface OrderRow {
  id: string;
  shopify_order_name: string | null;
  customer_name: string | null;
  total: number | null;
  order_date: string | null;
  fulfillment_status: string | null;
  financial_status: string | null;
}

type StatusKey = "unfulfilled" | "partial" | "fulfilled" | "restocked";

const STATUS_META: Record<StatusKey, { label: string; icon: typeof Truck }> = {
  unfulfilled: { label: "Unfulfilled", icon: PackageX },
  partial: { label: "Partial", icon: PackageOpen },
  fulfilled: { label: "Fulfilled", icon: PackageCheck },
  restocked: { label: "Restocked", icon: RotateCcw },
};

function normStatus(s: string | null): StatusKey {
  const v = (s ?? "unfulfilled").toLowerCase();
  if (v === "fulfilled") return "fulfilled";
  if (v === "partial" || v === "partially_fulfilled") return "partial";
  if (v === "restocked") return "restocked";
  return "unfulfilled";
}

function fmtCurrency(n: number | null) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminFulfillment() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"actionable" | StatusKey | "all">("actionable");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("orders")
        .select("id, shopify_order_name, customer_name, total, order_date, fulfillment_status, financial_status")
        .eq("is_test", false)
        .order("order_date", { ascending: false, nullsFirst: false });
      if (!active) return;
      setOrders((data ?? []) as OrderRow[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<StatusKey, number> = { unfulfilled: 0, partial: 0, fulfilled: 0, restocked: 0 };
    (orders ?? []).forEach((o) => {
      c[normStatus(o.fulfillment_status)] += 1;
    });
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    return orders.filter((o) => {
      const s = normStatus(o.fulfillment_status);
      if (filter === "all") return true;
      if (filter === "actionable") return s === "unfulfilled" || s === "partial";
      return s === filter;
    });
  }, [orders, filter]);

  const tabs: Array<{ key: typeof filter; label: string }> = [
    { key: "actionable", label: "Needs Action" },
    { key: "unfulfilled", label: "Unfulfilled" },
    { key: "partial", label: "Partial" },
    { key: "fulfilled", label: "Fulfilled" },
    { key: "restocked", label: "Restocked" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header>
        <div className="ax-section-header mb-2">Operations</div>
        <h1 className="text-3xl font-bold">Fulfillment</h1>
        <p className="text-sm text-muted-foreground mt-1">Track and work orders by fulfillment status.</p>
      </header>

      {/* Status tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(STATUS_META) as StatusKey[]).map((k) => {
          const Icon = STATUS_META[k].icon;
          return (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "ax-card text-left transition-colors",
                filter === k && "ring-2 ring-[hsl(var(--ax-accent))]",
              )}
            >
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                <Icon className="h-4 w-4" />
                {STATUS_META[k].label}
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">
                {loading ? "—" : counts[k].toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {tabs.map((t) => (
          <button
            key={String(t.key)}
            onClick={() => setFilter(t.key)}
            className={cn(
              "px-3 h-8 rounded-[10px] text-sm font-medium transition-colors",
              filter === t.key
                ? "bg-[hsl(var(--ax-accent))] text-white"
                : "text-muted-foreground hover:bg-[hsl(var(--muted))]",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <div className="ax-card p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-[12px] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] flex items-center justify-center">
            <Truck className="h-5 w-5" />
          </div>
          <p className="text-muted-foreground">
            {filter === "actionable"
              ? "Nothing needs action — all orders are fulfilled or restocked."
              : "No orders in this status."}
          </p>
        </div>
      ) : (
        <div className="ax-card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((o) => {
                const s = normStatus(o.fulfillment_status);
                return (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-[hsl(var(--muted)/0.4)]">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/orders/${o.id}`} className="text-accent hover:underline">
                        {o.shopify_order_name ?? o.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 truncate max-w-[220px]">{o.customer_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(o.order_date)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          s === "fulfilled" && "bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]",
                          s === "unfulfilled" && "bg-amber-500/15 text-amber-600",
                          s === "partial" && "bg-blue-500/15 text-blue-600",
                          s === "restocked" && "bg-[hsl(var(--muted))] text-muted-foreground",
                        )}
                      >
                        {STATUS_META[s].label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(o.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 200 && (
            <div className="px-4 py-2.5 text-xs text-muted-foreground border-t border-border">
              Showing 200 of {filtered.length.toLocaleString()} orders.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
