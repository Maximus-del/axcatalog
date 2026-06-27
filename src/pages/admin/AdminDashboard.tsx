import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Clock,
  Package,
  Truck,
  AlertTriangle,
  Sparkles,
  Inbox,
  Printer,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { format, formatDistanceToNow, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

interface RevenueState {
  total: number;
  prev: number;
  series: { d: string; v: number }[];
}

function useMonthRevenue() {
  const [state, setState] = useState<RevenueState | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const now = new Date();
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      const prevStart = startOfMonth(subMonths(now, 1));
      const prevEnd = endOfMonth(subMonths(now, 1));

      const buckets = new Map<string, number>();
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        buckets.set(format(d, "yyyy-MM-dd"), 0);
      }

      const pageSize = 1000;
      let from = 0;
      let total = 0;
      while (true) {
        const { data, error } = await supabase
          .from("order_line_items")
          .select("line_total, orders!inner(is_test, order_date)")
          .not("attributed_org_id", "is", null)
          .eq("orders.is_test", false)
          .gte("orders.order_date", start.toISOString())
          .lte("orders.order_date", end.toISOString())
          .range(from, from + pageSize - 1);
        if (error || !data) break;
        for (const r of data as Array<{ line_total: number | null; orders: { order_date: string | null } }>) {
          const lt = Number(r.line_total ?? 0);
          total += lt;
          const od = r.orders?.order_date;
          if (od) {
            const k = format(new Date(od), "yyyy-MM-dd");
            if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + lt);
          }
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }

      // previous month total
      let prev = 0;
      from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("order_line_items")
          .select("line_total, orders!inner(is_test, order_date)")
          .not("attributed_org_id", "is", null)
          .eq("orders.is_test", false)
          .gte("orders.order_date", prevStart.toISOString())
          .lte("orders.order_date", prevEnd.toISOString())
          .range(from, from + pageSize - 1);
        if (error || !data) break;
        for (const r of data as Array<{ line_total: number | null }>) {
          prev += Number(r.line_total ?? 0);
        }
        if (data.length < pageSize) break;
        from += pageSize;
      }

      if (cancelled) return;
      setState({
        total: Math.round(total),
        prev: Math.round(prev),
        series: [...buckets.entries()].map(([d, v]) => ({ d, v: Math.round(v) })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

interface Priority {
  id: string;
  label: string;
  hint: string;
  tag: "urgent" | "review" | "ship" | "done";
  to: string;
}

function usePriorities() {
  const [items, setItems] = useState<Priority[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: bulk } = await supabase
        .from("bulk_order_requests")
        .select("id, order_number, status, created_at, total_units")
        .in("status", ["submitted", "acknowledged", "in_production"])
        .order("created_at", { ascending: true })
        .limit(8);
      if (cancelled) return;
      const out: Priority[] = (bulk ?? []).map((b) => {
        const ageDays = (Date.now() - new Date(b.created_at).getTime()) / 86400000;
        let tag: Priority["tag"] = "review";
        if (b.status === "submitted" && ageDays > 1) tag = "urgent";
        else if (b.status === "in_production") tag = "ship";
        else if (b.status === "acknowledged") tag = "review";
        return {
          id: b.id,
          label: `Review order ${b.order_number ?? b.id.slice(0, 8)}`,
          hint: `${b.total_units} units · ${formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}`,
          tag,
          to: `/admin/orders/${b.id}`,
        };
      });
      setItems(out);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return items;
}

interface PendingApproval {
  id: string;
  title: string;
  image: string | null;
  to: string;
}
function usePendingApprovals() {
  const [items, setItems] = useState<PendingApproval[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("designs")
        .select("id, title, status")
        .order("created_at", { ascending: false })
        .limit(6);
      if (cancelled) return;
      setItems(
        (data ?? []).map((d: any) => ({
          id: d.id,
          title: d.title,
          image: null,
          to: `/admin/designs/${d.id}`,
        })),
      );
    })();
    return () => { cancelled = true; };
  }, []);
  return items;
}

interface ShippingRow {
  id: string;
  order_number: string | null;
  client: string;
  units: number;
}
function useShippingToday() {
  const [items, setItems] = useState<ShippingRow[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("bulk_order_requests")
        .select(`id, order_number, total_units, status,
          athlete:athletes!bulk_order_requests_athlete_id_fkey(full_name, first_name, last_name),
          team:teams!bulk_order_requests_team_id_fkey(name)`)
        .in("status", ["in_production", "acknowledged"])
        .order("created_at", { ascending: true })
        .limit(5);
      if (cancelled) return;
      setItems(
        (data ?? []).map((o: any) => ({
          id: o.id,
          order_number: o.order_number,
          client:
            (o.athlete?.full_name ||
              `${o.athlete?.first_name ?? ""} ${o.athlete?.last_name ?? ""}`.trim() ||
              o.team?.name ||
              "—") as string,
          units: o.total_units ?? 0,
        })),
      );
    })();
    return () => { cancelled = true; };
  }, []);
  return items;
}

interface Tiles {
  production: number;
  openRequests: number;
  inventory: number;
  launching: number;
}
function useStatTiles() {
  const [t, setT] = useState<Tiles | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [prod, open, blanks] = await Promise.all([
        supabase.from("bulk_order_requests").select("id", { count: "exact", head: true }).eq("status", "in_production"),
        supabase.from("bulk_order_requests").select("id", { count: "exact", head: true }).eq("status", "submitted"),
        supabase.from("blanks").select("id", { count: "exact", head: true })
          .or("price_standard.is.null,price_athlete.is.null,price_corporate.is.null"),
      ]);
      if (cancelled) return;
      setT({
        production: prod.count ?? 0,
        openRequests: open.count ?? 0,
        inventory: blanks.count ?? 0,
        launching: 0,
      });
    })();
    return () => { cancelled = true; };
  }, []);
  return t;
}

const TAG_STYLE: Record<Priority["tag"], string> = {
  urgent: "bg-[hsl(var(--ax-red)/0.12)] text-[hsl(var(--ax-red))]",
  review: "bg-[hsl(var(--ax-blue)/0.12)] text-[hsl(var(--ax-blue))]",
  ship: "bg-[hsl(var(--ax-amber)/0.14)] text-[hsl(var(--ax-amber))]",
  done: "bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const firstName = useMemo(() => {
    const local = (user?.email ?? "").split("@")[0];
    return local ? local.split(/[._-]/)[0].replace(/^./, (c) => c.toUpperCase()) : "there";
  }, [user]);

  const revenue = useMonthRevenue();
  const priorities = usePriorities();
  const approvals = usePendingApprovals();
  const shipping = useShippingToday();
  const tiles = useStatTiles();

  const month = format(new Date(), "MMMM");
  const today = format(new Date(), "EEEE, MMM d");
  const attentionCount = (priorities?.length ?? 0) + (approvals?.length ?? 0);

  const trendPct = revenue && revenue.prev > 0
    ? ((revenue.total - revenue.prev) / revenue.prev) * 100
    : null;

  return (
    <div className="p-5 md:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Greeting */}
      <header className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[hsl(var(--ax-ink))]">
          {greeting()}, {firstName}
        </h1>
        <p className="text-sm text-[hsl(var(--ax-secondary))]">
          {today} ·{" "}
          {attentionCount > 0 ? (
            <span className="text-[hsl(var(--ax-ink))] font-medium">
              {attentionCount} item{attentionCount === 1 ? "" : "s"} need your attention
            </span>
          ) : (
            <span>All clear — nothing urgent.</span>
          )}
        </p>
      </header>

      {/* Magazine grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Hero revenue — spans 2 cols */}
        <section className="lg:col-span-2 ax-os-card p-6 relative overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))] font-semibold">
                Revenue · {month}
              </div>
              {revenue ? (
                <>
                  <div className="mt-2 text-4xl md:text-5xl font-bold tracking-tight text-[hsl(var(--ax-ink))] tabular-nums">
                    {fmtMoney(revenue.total)}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    {trendPct !== null && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold",
                          trendPct >= 0
                            ? "bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
                            : "bg-[hsl(var(--ax-red)/0.12)] text-[hsl(var(--ax-red))]",
                        )}
                      >
                        <ArrowUpRight
                          className={cn("h-3 w-3", trendPct < 0 && "rotate-90")}
                        />
                        {Math.abs(trendPct).toFixed(1)}%
                      </span>
                    )}
                    <span className="text-[hsl(var(--ax-secondary))]">
                      vs {fmtMoney(revenue.prev)} last month
                    </span>
                  </div>
                </>
              ) : (
                <Skeleton className="h-12 w-48 mt-2" />
              )}
            </div>
            <Link
              to="/admin/orders"
              className="hidden sm:inline-flex h-9 px-3 items-center rounded-[11px] border border-[hsl(var(--ax-border))] text-xs font-medium text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] hover:border-[hsl(var(--ax-accent))]"
            >
              View orders →
            </Link>
          </div>
          <div className="mt-6 -mx-2 h-44">
            {revenue ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenue.series}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--ax-accent))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--ax-accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{
                      background: "white",
                      border: "1px solid hsl(var(--ax-border))",
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => fmtMoney(v)}
                    labelFormatter={(l) => format(new Date(l as string), "MMM d")}
                  />
                  <XAxis dataKey="d" hide />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="hsl(var(--ax-accent))"
                    strokeWidth={2.5}
                    fill="url(#revFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="h-full w-full" />
            )}
          </div>
        </section>

        {/* Today's priorities — tall rail */}
        <section className="ax-os-card p-5 lg:row-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-[hsl(var(--ax-ink))]">Today's priorities</h2>
            <span className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))] font-semibold">
              {priorities?.length ?? 0}
            </span>
          </div>
          <ul className="space-y-2 overflow-y-auto flex-1">
            {!priorities &&
              Array.from({ length: 5 }).map((_, i) => (
                <li key={i}><Skeleton className="h-14 w-full" /></li>
              ))}
            {priorities && priorities.length === 0 && (
              <li className="text-sm text-[hsl(var(--ax-secondary))] py-8 text-center">
                Nothing pressing. Nice work.
              </li>
            )}
            {priorities?.map((p) => (
              <li key={p.id}>
                <Link
                  to={p.to}
                  className="group flex items-start gap-3 p-3 rounded-[12px] border border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent))] hover:bg-[hsl(var(--ax-accent)/0.04)] transition-all"
                >
                  <Circle className="h-4 w-4 mt-0.5 text-[hsl(var(--ax-faint))] group-hover:text-[hsl(var(--ax-accent))] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-[hsl(var(--ax-ink))]">{p.label}</div>
                    <div className="text-xs text-[hsl(var(--ax-secondary))] mt-0.5 truncate">{p.hint}</div>
                  </div>
                  <span className={cn("shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full", TAG_STYLE[p.tag])}>
                    {p.tag}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Pending approvals */}
        <section className="ax-os-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-[hsl(var(--ax-ink))]">Pending approvals</h2>
            <Link to="/admin/designs" className="text-xs text-[hsl(var(--ax-accent))] font-medium hover:underline">
              View all
            </Link>
          </div>
          {!approvals ? (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-[10px]" />)}
            </div>
          ) : approvals.length === 0 ? (
            <div className="text-sm text-[hsl(var(--ax-secondary))] py-6 text-center">No proofs awaiting review.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {approvals.slice(0, 6).map((a) => (
                <Link
                  key={a.id}
                  to={a.to}
                  title={a.title}
                  className="aspect-square rounded-[10px] border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-line))] overflow-hidden flex items-center justify-center hover:border-[hsl(var(--ax-accent))] transition-colors"
                >
                  {a.image ? (
                    <img src={a.image} alt={a.title} className="w-full h-full object-cover" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-[hsl(var(--ax-faint))]" />
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Shipping today */}
        <section className="ax-os-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-[hsl(var(--ax-ink))]">Shipping today</h2>
            <Link to="/admin/orders" className="text-xs text-[hsl(var(--ax-accent))] font-medium hover:underline">
              View all
            </Link>
          </div>
          {!shipping ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : shipping.length === 0 ? (
            <div className="text-sm text-[hsl(var(--ax-secondary))] py-6 text-center">Nothing scheduled today.</div>
          ) : (
            <ul className="divide-y divide-[hsl(var(--ax-line))]">
              {shipping.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/admin/orders/${s.id}`}
                    className="flex items-center gap-3 py-2.5 hover:opacity-80"
                  >
                    <Truck className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-[hsl(var(--ax-ink))]">{s.client}</div>
                      <div className="text-xs text-[hsl(var(--ax-secondary))]">
                        {s.order_number ?? s.id.slice(0, 8)} · {s.units} units
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Compact stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Production queue"
          value={tiles?.production}
          icon={Printer}
          tone="blue"
          to="/admin/print-queue"
        />
        <StatTile
          label="Open client requests"
          value={tiles?.openRequests}
          icon={Inbox}
          tone="amber"
          to="/admin/orders?tab=open"
        />
        <StatTile
          label="Inventory alerts"
          value={tiles?.inventory}
          icon={AlertTriangle}
          tone="red"
          to="/admin/blanks"
        />
        <StatTile
          label="Launching soon"
          value={tiles?.launching}
          icon={Sparkles}
          tone="violet"
          to="/admin/products"
        />
      </div>
    </div>
  );
}

function StatTile({
  label, value, icon: Icon, tone, to,
}: {
  label: string;
  value: number | undefined;
  icon: typeof Package;
  tone: "blue" | "amber" | "red" | "violet";
  to: string;
}) {
  const toneMap: Record<string, string> = {
    blue: "bg-[hsl(var(--ax-blue)/0.12)] text-[hsl(var(--ax-blue))]",
    amber: "bg-[hsl(var(--ax-amber)/0.14)] text-[hsl(var(--ax-amber))]",
    red: "bg-[hsl(var(--ax-red)/0.12)] text-[hsl(var(--ax-red))]",
    violet: "bg-[hsl(var(--ax-violet)/0.12)] text-[hsl(var(--ax-violet))]",
  };
  return (
    <Link
      to={to}
      className="ax-os-card p-4 flex items-center gap-3 hover:-translate-y-0.5 transition-transform"
    >
      <div className={cn("h-10 w-10 rounded-[11px] flex items-center justify-center", toneMap[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.12em] text-[hsl(var(--ax-faint))] font-semibold truncate">
          {label}
        </div>
        <div className="text-xl font-bold text-[hsl(var(--ax-ink))] tabular-nums">
          {value ?? "—"}
        </div>
      </div>
    </Link>
  );
}
