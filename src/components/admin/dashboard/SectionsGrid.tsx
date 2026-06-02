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

interface SectionDef {
  key: string;
  label: string;
  icon: LucideIcon;
  route: string;
  enabled: boolean;
  statLabel?: string;
  load?: () => Promise<string | number | null>;
  noStat?: boolean;
}

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

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
  },
  {
    key: "athletes",
    label: "Athletes",
    icon: Users,
    route: "/admin/athletes",
    enabled: true,
    statLabel: "active athletes",
    load: loadAthleteCount,
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
  },
  {
    key: "blanks",
    label: "Blanks",
    icon: Shirt,
    route: "/admin/blanks",
    enabled: true,
    statLabel: "need pricing",
    load: loadBlanksNeedPricing,
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
    enabled: false,
    statLabel: "top org",
    load: loadTopOrg,
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    route: "/admin/settings",
    enabled: false,
    noStat: true,
  },
];

function SectionCard({ def }: { def: SectionDef }) {
  const navigate = useNavigate();
  const [value, setValue] = useState<string | number | null>(null);
  const [loading, setLoading] = useState<boolean>(!!def.load && def.enabled);

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
        "ax-card group relative flex flex-col gap-4 min-h-[140px] transition-all",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "cursor-pointer hover:border-accent hover:-translate-y-0.5",
      )}
    >
      <div className="flex items-start justify-between">
        <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-[hsl(var(--accent)/0.08)]">
          <Icon className="h-5 w-5 text-accent" strokeWidth={2} />
        </div>
        {!disabled && (
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <div className="mt-auto">
        <div className="ax-label mb-2">{def.label}</div>
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
      </div>
    </div>
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