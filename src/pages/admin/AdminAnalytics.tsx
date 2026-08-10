import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { DollarSign, ShoppingCart, Package, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

const HOUSE_ORG = "Athlete Xclusive";

interface LineRow {
  attributed_org_id: string;
  line_total: number | null;
  quantity: number | null;
  product_title: string | null;
  order_id: string;
  orders: { is_test: boolean | null; order_date: string | null } | null;
}

interface RecentOrder {
  id: string;
  shopify_order_name: string | null;
  customer_name: string | null;
  total: number | null;
  order_date: string | null;
}

interface Analytics {
  revenue: number;
  orders: number;
  units: number;
  aov: number;
  byMonth: Array<{ label: string; revenue: number; orders: number }>;
  topProducts: Array<{ name: string; revenue: number; qty: number }>;
  byOrg: Array<{ name: string; revenue: number }>;
}

function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function monthKey(d: string) {
  return d.slice(0, 7); // YYYY-MM
}
function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

async function fetchAllLines(): Promise<LineRow[]> {
  const pageSize = 1000;
  let from = 0;
  const all: LineRow[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("order_line_items")
      .select(
        "attributed_org_id, line_total, quantity, product_title, order_id, orders!inner(is_test, order_date)",
      )
      .not("attributed_org_id", "is", null)
      .eq("is_upcharge", false)
      .eq("orders.is_test", false)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data) break;
    all.push(...(data as unknown as LineRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export default function AdminAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [recent, setRecent] = useState<RecentOrder[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [lines, recentRes] = await Promise.all([
        fetchAllLines(),
        supabase
          .from("orders")
          .select("id, shopify_order_name, customer_name, total, order_date")
          .eq("is_test", false)
          .order("order_date", { ascending: false, nullsFirst: false })
          .limit(10),
      ]);
      if (!active) return;

      // Aggregate
      const orderSet = new Set<string>();
      let revenue = 0;
      let units = 0;
      const monthRev = new Map<string, number>();
      const monthOrders = new Map<string, Set<string>>();
      const productRev = new Map<string, { revenue: number; qty: number }>();
      const orgRev = new Map<string, number>();

      for (const r of lines) {
        const lt = Number(r.line_total ?? 0);
        revenue += lt;
        units += Number(r.quantity ?? 0);
        orderSet.add(r.order_id);
        const d = r.orders?.order_date;
        if (d) {
          const k = monthKey(d);
          monthRev.set(k, (monthRev.get(k) ?? 0) + lt);
          if (!monthOrders.has(k)) monthOrders.set(k, new Set());
          monthOrders.get(k)!.add(r.order_id);
        }
        const pt = r.product_title ?? "(unnamed)";
        const pr = productRev.get(pt) ?? { revenue: 0, qty: 0 };
        pr.revenue += lt;
        pr.qty += Number(r.quantity ?? 0);
        productRev.set(pt, pr);
        if (r.attributed_org_id) {
          orgRev.set(r.attributed_org_id, (orgRev.get(r.attributed_org_id) ?? 0) + lt);
        }
      }

      // Continuous month range
      const keys = [...monthRev.keys()].sort();
      const byMonth: Analytics["byMonth"] = [];
      if (keys.length) {
        const [sy, sm] = keys[0].split("-").map(Number);
        const [ey, em] = keys[keys.length - 1].split("-").map(Number);
        let y = sy;
        let m = sm;
        while (y < ey || (y === ey && m <= em)) {
          const k = `${y}-${String(m).padStart(2, "0")}`;
          byMonth.push({
            label: monthLabel(k),
            revenue: Math.round(monthRev.get(k) ?? 0),
            orders: monthOrders.get(k)?.size ?? 0,
          });
          m += 1;
          if (m > 12) {
            m = 1;
            y += 1;
          }
        }
      }

      const topProducts = [...productRev.entries()]
        .map(([name, v]) => ({ name, revenue: Math.round(v.revenue), qty: v.qty }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8);

      // Resolve org names, excluding house org
      const orgIds = [...orgRev.keys()];
      let byOrg: Analytics["byOrg"] = [];
      if (orgIds.length) {
        const { data: orgs } = await supabase
          .from("organizations")
          .select("id, name")
          .in("id", orgIds);
        byOrg = (orgs ?? [])
          .filter((o) => o.name !== HOUSE_ORG)
          .map((o) => ({ name: o.name, revenue: Math.round(orgRev.get(o.id) ?? 0) }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 8);
      }

      const orders = orderSet.size;
      setData({
        revenue: Math.round(revenue),
        orders,
        units,
        aov: orders ? revenue / orders : 0,
        byMonth,
        topProducts,
        byOrg,
      });
      setRecent((recentRes.data ?? []) as RecentOrder[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const kpis = useMemo(
    () =>
      data
        ? [
            { label: "Merch Revenue", value: fmtCurrency(data.revenue), icon: DollarSign },
            { label: "Orders", value: data.orders.toLocaleString(), icon: ShoppingCart },
            { label: "Units Sold", value: data.units.toLocaleString(), icon: Package },
            { label: "Avg Order", value: fmtCurrency(data.aov), icon: TrendingUp },
          ]
        : [],
    [data],
  );

  const tooltipStyle = {
    background: "hsl(var(--dark))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  } as const;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header>
        <div className="ax-section-header mb-2">System</div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Attributed merch revenue across all client organizations (excludes test orders).
        </p>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="ax-card space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-24" />
              </div>
            ))
          : kpis.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="ax-card">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
                    <Icon className="h-4 w-4" />
                    {k.label}
                  </div>
                  <div className="mt-2 text-2xl font-bold tabular-nums">{k.value}</div>
                </div>
              );
            })}
      </div>

      {/* Revenue over time */}
      <section className="ax-card p-4">
        <div className="ax-label mb-3">Revenue Over Time</div>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : data && data.byMonth.length > 0 ? (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byMonth} margin={{ top: 10, right: 8, bottom: 8, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  angle={-35}
                  textAnchor="end"
                  height={44}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--accent) / 0.05)" }}
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [fmtCurrency(Number(v)), "Revenue"]}
                />
                <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-12 text-center">No revenue data yet.</p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order volume */}
        <section className="ax-card p-4">
          <div className="ax-label mb-3">Order Volume</div>
          {loading ? (
            <Skeleton className="h-56 w-full" />
          ) : data && data.byMonth.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byMonth} margin={{ top: 10, right: 8, bottom: 8, left: -24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    angle={-35}
                    textAnchor="end"
                    height={44}
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={36}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--accent) / 0.05)" }}
                    contentStyle={tooltipStyle}
                    formatter={(v: number) => [v, "Orders"]}
                  />
                  <Bar dataKey="orders" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-12 text-center">No orders yet.</p>
          )}
        </section>

        {/* Top products */}
        <section className="ax-card p-4">
          <div className="ax-label mb-3">Top Products by Revenue</div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : data && data.topProducts.length > 0 ? (
            <ul className="space-y-2.5">
              {data.topProducts.map((p) => {
                const max = data.topProducts[0].revenue || 1;
                const pct = Math.max(4, Math.round((p.revenue / max) * 100));
                return (
                  <li key={p.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{p.name}</span>
                      <span className="tabular-nums text-muted-foreground shrink-0">
                        {fmtCurrency(p.revenue)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[hsl(var(--accent))]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground py-12 text-center">No product sales yet.</p>
          )}
        </section>
      </div>

      {/* Revenue by client org */}
      <section className="ax-card p-4">
        <div className="ax-label mb-3">Revenue by Client Organization</div>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : data && data.byOrg.length > 0 ? (
          <ul className="space-y-2.5">
            {data.byOrg.map((o) => {
              const max = data.byOrg[0].revenue || 1;
              const pct = Math.max(4, Math.round((o.revenue / max) * 100));
              return (
                <li key={o.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{o.name}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">
                      {fmtCurrency(o.revenue)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[hsl(var(--accent))]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No attributed client revenue yet.
          </p>
        )}
      </section>

      {/* Recent orders */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Orders</h2>
          <Link to="/admin/orders" className="text-accent text-sm hover:underline">
            View all
          </Link>
        </div>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : recent && recent.length > 0 ? (
          <div className="ax-card p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((o) => (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-[hsl(var(--muted)/0.4)]">
                    <td className="px-4 py-2.5">
                      <Link to={`/admin/orders/${o.id}`} className="text-accent hover:underline">
                        {o.shopify_order_name ?? o.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 truncate max-w-[220px]">{o.customer_name ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(o.order_date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {o.total != null ? fmtCurrency(Number(o.total)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ax-card p-8 text-center text-sm text-muted-foreground">No orders yet.</div>
        )}
      </section>
    </div>
  );
}
