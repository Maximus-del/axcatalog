import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Package,
  Palette,
  Shirt,
  ClipboardList,
  ShoppingCart,
  DollarSign,
  BarChart3,
  Settings,
  ArrowRight,
  LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Tooltip,
} from "recharts";

type SparkPoint = { label: string; value: number };
type ChartData =
  | { kind: "area"; points: SparkPoint[] }
  | { kind: "bars"; points: SparkPoint[] }
  | { kind: "progress"; done: number; total: number };

interface SectionDef {
  key: string;
  label: string;
  icon: LucideIcon;
  route: string;
  enabled: boolean;
  statLabel?: string;
  load?: () => Promise<string | number | null>;
  loadChart?: () => Promise<ChartData | null>;
  noStat?: boolean;
}

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function dayKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function weekKey(d: Date) {
  // ISO-ish week bucket using Monday as start, UTC
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - (day - 1));
  return dayKey(dt);
}

async function loadRevenueByDay(days = 14): Promise<ChartData> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    buckets.set(dayKey(d), 0);
  }
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("order_line_items")
      .select("line_total, is_upcharge, orders!inner(is_test, order_date)")
      .not("attributed_org_id", "is", null)
      .eq("is_upcharge", false)
      .eq("orders.is_test", false)
      .gte("orders.order_date", start.toISOString())
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data) break;
    for (const r of data as Array<{ line_total: number | null; orders: { order_date: string | null } }>) {
      const od = r.orders?.order_date;
      if (!od) continue;
      const k = dayKey(new Date(od));
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + Number(r.line_total ?? 0));
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const points: SparkPoint[] = [...buckets.entries()].map(([label, value]) => ({
    label,
    value: Math.round(value * 100) / 100,
  }));
  return { kind: "area", points };
}

async function loadCreatedByWeek(
  table: "organizations" | "designs",
  weeks = 8,
): Promise<ChartData> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - weeks * 7);
  const { data, error } = await (supabase as any)
    .from(table)
    .select("created_at")
    .gte("created_at", start.toISOString());
  const buckets = new Map<string, number>();
  for (let i = 0; i < weeks; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i * 7);
    buckets.set(weekKey(d), 0);
  }
  if (!error && data) {
    for (const r of data as Array<{ created_at: string }>) {
      const k = weekKey(new Date(r.created_at));
      if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
  }
  const points = [...buckets.entries()].map(([label, value]) => ({ label, value }));
  return { kind: "bars", points };
}

async function loadOrdersByDay(days = 14): Promise<ChartData> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    buckets.set(dayKey(d), 0);
  }
  const { data } = await supabase
    .from("orders")
    .select("order_date")
    .eq("is_test", false)
    .gte("order_date", start.toISOString());
  for (const r of (data ?? []) as Array<{ order_date: string | null }>) {
    if (!r.order_date) continue;
    const k = dayKey(new Date(r.order_date));
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  const points = [...buckets.entries()].map(([label, value]) => ({ label, value }));
  return { kind: "bars", points };
}

async function loadBlanksProgress(): Promise<ChartData> {
  const total = await supabase.from("blanks").select("id", { count: "exact", head: true });
  const missing = await supabase
    .from("blanks")
    .select("id", { count: "exact", head: true })
    .or("price_standard.is.null,price_athlete.is.null,price_corporate.is.null");
  const t = total.count ?? 0;
  const m = missing.count ?? 0;
  return { kind: "progress", done: Math.max(0, t - m), total: t };
}

async function loadTodayRevenue(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const pageSize = 1000;
  let from = 0;
  let total = 0;
  while (true) {
    const { data, error } = await supabase
      .from("order_line_items")
      .select("line_total, is_upcharge, orders!inner(id, is_test, order_date)")
      .not("attributed_org_id", "is", null)
      .eq("is_upcharge", false)
      .eq("orders.is_test", false)
      .gte("orders.order_date", start.toISOString())
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data) break;
    for (const r of data as Array<{ line_total: number | null }>) {
      total += Number(r.line_total ?? 0);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return Math.round(total * 100) / 100;
}

async function loadAthleteCount(): Promise<number> {
  const { count } = await supabase
    .from("organizations")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

async function loadProductCount(): Promise<number> {
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

async function loadDesignCount(): Promise<number> {
  const { count } = await supabase
    .from("designs")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

async function loadBlanksNeedPricing(): Promise<number> {
  const { count } = await supabase
    .from("blanks")
    .select("id", { count: "exact", head: true })
    .or("price_standard.is.null,price_athlete.is.null,price_corporate.is.null");
  return count ?? 0;
}

async function loadPendingBulk(): Promise<number> {
  const { count } = await supabase
    .from("bulk_order_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review" as never);
  return count ?? 0;
}

async function loadOrders30d(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("is_test", false)
    .gte("order_date", cutoff);
  return count ?? 0;
}

async function loadActiveBreaks(): Promise<number> {
  const { count } = await supabase
    .from("volume_discount_breaks")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

async function loadTopOrg(): Promise<string> {
  const pageSize = 1000;
  let from = 0;
  const agg = new Map<string, number>();
  while (true) {
    const { data, error } = await supabase
      .from("order_line_items")
      .select("attributed_org_id, line_total, orders!inner(is_test)")
      .not("attributed_org_id", "is", null)
      .eq("orders.is_test", false)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data) break;
    for (const r of data as Array<{ attributed_org_id: string; line_total: number | null }>) {
      agg.set(
        r.attributed_org_id,
        (agg.get(r.attributed_org_id) ?? 0) + Number(r.line_total ?? 0),
      );
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  const ids = [...agg.keys()];
  if (!ids.length) return "—";
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", ids);
  const ranked = (orgs ?? [])
    .filter((o) => o.name !== "Athlete Xclusive")
    .map((o) => ({ name: o.name, rev: agg.get(o.id) ?? 0 }))
    .sort((a, b) => b.rev - a.rev);
  return ranked[0]?.name ?? "—";
}

const SECTIONS: SectionDef[] = [
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    route: "/admin",
    enabled: true,
    statLabel: "today",
    load: async () => fmtMoney(await loadTodayRevenue()),
    loadChart: () => loadRevenueByDay(14),
  },
  {
    key: "athletes",
    label: "Athletes",
    icon: Users,
    route: "/admin/athletes",
    enabled: true,
    statLabel: "active athletes",
    load: loadAthleteCount,
    loadChart: () => loadCreatedByWeek("organizations", 8),
  },
  {
    key: "products",
    label: "Products",
    icon: Package,
    route: "/admin/products",
    enabled: true,
    statLabel: "products",
    load: loadProductCount,
  },
  {
    key: "designs",
    label: "Designs",
    icon: Palette,
    route: "/admin/designs",
    enabled: true,
    statLabel: "designs",
    load: loadDesignCount,
    loadChart: () => loadCreatedByWeek("designs", 8),
  },
  {
    key: "blanks",
    label: "Blanks",
    icon: Shirt,
    route: "/admin/blanks",
    enabled: true,
    statLabel: "need pricing",
    load: loadBlanksNeedPricing,
    loadChart: loadBlanksProgress,
  },
  {
    key: "bulk",
    label: "Bulk Orders",
    icon: ShoppingCart,
    route: "/admin/bulk-orders",
    enabled: false,
    statLabel: "pending review",
    load: loadPendingBulk,
  },
  {
    key: "orders",
    label: "Orders",
    icon: ClipboardList,
    route: "/admin/orders",
    enabled: true,
    statLabel: "in last 30d",
    load: loadOrders30d,
    loadChart: () => loadOrdersByDay(14),
  },
  {
    key: "pricing",
    label: "Pricing",
    icon: DollarSign,
    route: "/admin/pricing",
    enabled: true,
    statLabel: "active breaks",
    load: loadActiveBreaks,
  },
  {
    key: "analytics",
    label: "Analytics",
    icon: BarChart3,
    route: "/admin/analytics",
    enabled: true,
    statLabel: "top org",
    load: loadTopOrg,
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    route: "/admin/settings",
    enabled: true,
    noStat: true,
  },
];

function SectionCard({ def }: { def: SectionDef }) {
  const navigate = useNavigate();
  const [value, setValue] = useState<string | number | null>(null);
  const [loading, setLoading] = useState<boolean>(!!def.load && def.enabled);
  const [chart, setChart] = useState<ChartData | null>(null);

  useEffect(() => {
    if (!def.load || !def.enabled) return;
    let cancelled = false;
    setLoading(true);
    def
      .load()
      .then((v) => {
        if (!cancelled) {
          setValue(v);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setValue("—");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [def]);

  useEffect(() => {
    if (!def.loadChart || !def.enabled) return;
    let cancelled = false;
    def
      .loadChart()
      .then((d) => {
        if (!cancelled) setChart(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [def]);

  const Icon = def.icon;
  const disabled = !def.enabled;

  const onActivate = () => {
    if (!disabled) navigate(def.route);
  };

  return (
    <div
      onClick={onActivate}
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "ax-card group relative flex flex-col gap-4 min-h-[180px] transition-all",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:border-accent hover:-translate-y-0.5",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-[hsl(var(--accent)/0.08)]">
          <Icon className="h-5 w-5 text-accent" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-foreground truncate">{def.label}</div>
        </div>
        {!disabled && (
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        )}
      </div>
      <div className="mt-auto">
        {def.noStat ? (
          <div className="h-6" />
        ) : disabled ? (
          <div className="text-xs text-muted-foreground">Coming soon</div>
        ) : loading ? (
          <Skeleton className="h-6 w-20" />
        ) : (
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-xl sm:text-2xl font-bold tabular-nums truncate">
              {value ?? "—"}
            </span>
            {def.statLabel && (
              <span className="text-[11px] text-muted-foreground truncate">
                {def.statLabel}
              </span>
            )}
          </div>
        )}
        {def.loadChart && !disabled && (
          <div className="mt-3 h-10 -mx-1">
            {chart ? <MiniChart data={chart} /> : <Skeleton className="h-full w-full" />}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniChart({ data }: { data: ChartData }) {
  if (data.kind === "progress") {
    const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
    return (
      <div className="flex flex-col gap-1.5 pt-2">
        <div className="h-2 w-full rounded-full bg-[hsl(var(--muted))] overflow-hidden">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          {data.done}/{data.total} priced · {pct}%
        </div>
      </div>
    );
  }
  const points = data.points;
  if (data.kind === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.45} />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={false}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 11,
              padding: "4px 8px",
            }}
            labelStyle={{ color: "hsl(var(--muted-foreground))" }}
            formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="hsl(var(--accent))"
            strokeWidth={1.5}
            fill="url(#sparkGrad)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
        <Tooltip
          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 6,
            fontSize: 11,
            padding: "4px 8px",
          }}
          labelStyle={{ color: "hsl(var(--muted-foreground))" }}
        />
        <Bar dataKey="value" fill="hsl(var(--accent))" radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SectionsGrid() {
  return (
    <section>
      <div className="ax-section-header mb-4">Sections</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SECTIONS.map((s) => (
          <SectionCard key={s.key} def={s} />
        ))}
      </div>
    </section>
  );
}