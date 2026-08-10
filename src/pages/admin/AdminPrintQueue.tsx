import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Printer, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

interface LineRow {
  product_id: string | null;
  product_title: string | null;
  variant_title: string | null;
  quantity: number | null;
  order_id: string;
  orders: { shopify_order_name: string | null; fulfillment_status: string | null } | null;
}

interface ProductJob {
  key: string;
  product_id: string | null;
  title: string;
  units: number;
  orders: number;
  variants: Map<string, number>;
}

function first<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default function AdminPrintQueue() {
  const [lines, setLines] = useState<LineRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("order_line_items")
        .select(
          "product_id, product_title, variant_title, quantity, order_id, orders!inner(shopify_order_name, fulfillment_status, is_test)",
        )
        .eq("is_upcharge", false)
        .eq("orders.is_test", false)
        .in("orders.fulfillment_status", ["unfulfilled", "partial"]);
      if (!active) return;
      setLines(
        (data ?? []).map((r) => ({
          ...r,
          orders: first(r.orders) as LineRow["orders"],
        })) as LineRow[],
      );
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const { jobs, totalUnits, orderCount } = useMemo(() => {
    const map = new Map<string, ProductJob>();
    const orderSet = new Set<string>();
    let units = 0;
    (lines ?? []).forEach((l) => {
      const qty = Number(l.quantity ?? 0);
      units += qty;
      orderSet.add(l.order_id);
      const key = l.product_id ?? l.product_title ?? "(unknown)";
      const title = l.product_title ?? "(unnamed product)";
      const job =
        map.get(key) ??
        ({ key, product_id: l.product_id, title, units: 0, orders: 0, variants: new Map() } as ProductJob);
      job.units += qty;
      const vt = l.variant_title ?? "—";
      job.variants.set(vt, (job.variants.get(vt) ?? 0) + qty);
      map.set(key, job);
    });
    // order counts per job
    const perJobOrders = new Map<string, Set<string>>();
    (lines ?? []).forEach((l) => {
      const key = l.product_id ?? l.product_title ?? "(unknown)";
      if (!perJobOrders.has(key)) perJobOrders.set(key, new Set());
      perJobOrders.get(key)!.add(l.order_id);
    });
    const jobs = [...map.values()]
      .map((j) => ({ ...j, orders: perJobOrders.get(j.key)?.size ?? 0 }))
      .sort((a, b) => b.units - a.units);
    return { jobs, totalUnits: units, orderCount: orderSet.size };
  }, [lines]);

  const isEmpty = !loading && jobs.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <header>
        <div className="ax-section-header mb-2">Operations</div>
        <h1 className="text-3xl font-bold">Print Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Garments to produce, aggregated from unfulfilled and partial orders.
        </p>
      </header>

      {!isEmpty && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="ax-card">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Units to Produce</div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{totalUnits.toLocaleString()}</div>
          </div>
          <div className="ax-card">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Products</div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{jobs.length.toLocaleString()}</div>
          </div>
          <div className="ax-card">
            <div className="text-muted-foreground text-xs uppercase tracking-wide">Open Orders</div>
            <div className="mt-2 text-2xl font-bold tabular-nums">{orderCount.toLocaleString()}</div>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-[12px] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] flex items-center justify-center">
            <Printer className="h-5 w-5" />
          </div>
          <p className="text-muted-foreground">
            Print queue is clear — no unfulfilled or partial orders to produce.
          </p>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.key} className="ax-card">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  {job.product_id ? (
                    <Link
                      to={`/admin/products/${job.product_id}`}
                      className="font-semibold hover:text-accent truncate block"
                    >
                      {job.title}
                    </Link>
                  ) : (
                    <div className="font-semibold truncate">{job.title}</div>
                  )}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {job.orders} order{job.orders === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-bold tabular-nums flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    {job.units}
                  </div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wide">units</div>
                </div>
              </div>
              {job.variants.size > 0 && (
                <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-1.5">
                  {[...job.variants.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([variant, qty]) => (
                      <span
                        key={variant}
                        className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-xs"
                      >
                        <span className="text-muted-foreground">{variant}</span>
                        <span className="tabular-nums font-medium">×{qty}</span>
                      </span>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
