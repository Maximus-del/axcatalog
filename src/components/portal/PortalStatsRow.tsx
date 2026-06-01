import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: boolean;
  loading?: boolean;
}

function Stat({ label, value, hint, accent, loading }: StatProps) {
  return (
    <div className="ax-card">
      <div className="ax-label mb-3">{label}</div>
      <div className={cn("ax-stat", accent && "text-accent")}>
        {loading ? <span className="text-muted-foreground">—</span> : value}
      </div>
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

interface Props {
  productsLive: number | null;
  activeDesigns: number | null;
  loading: boolean;
  lifetimeRevenue?: number | null;
  totalOrders?: number | null;
  salesLoading?: boolean;
}

export function PortalStatsRow({
  productsLive,
  activeDesigns,
  loading,
  lifetimeRevenue,
  totalOrders,
  salesLoading,
}: Props) {
  const fmtMoney = (n: number | null | undefined) =>
    n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat
        label="Lifetime Revenue"
        value={fmtMoney(lifetimeRevenue)}
        loading={!!salesLoading}
        accent
      />
      <Stat
        label="Total Orders"
        value={totalOrders ?? 0}
        loading={!!salesLoading}
      />
      <Stat
        label="Products Live"
        value={productsLive ?? 0}
        loading={loading}
      />
      <Stat
        label="Active Designs"
        value={activeDesigns ?? 0}
        loading={loading}
      />
    </div>
  );
}
