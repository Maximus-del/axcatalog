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
}

export function PortalStatsRow({ productsLive, activeDesigns, loading }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Stat
        label="Total Revenue"
        value="—"
        hint="Revenue data coming soon"
        loading={false}
      />
      <Stat
        label="Total Orders"
        value="—"
        hint="Sales data coming soon"
        loading={false}
      />
      <Stat
        label="Products Live"
        value={productsLive ?? 0}
        loading={loading}
        accent
      />
      <Stat
        label="Active Designs"
        value={activeDesigns ?? 0}
        loading={loading}
      />
    </div>
  );
}
