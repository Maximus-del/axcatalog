// Mobile-first. Test at 375px before merging.
//
// Real attributed revenue per month. This drew twelve zero-height bars under
// "Revenue data will appear here after Shopify sync" for its whole life — but
// the orders had synced: the portal already pages every attributed line item to
// compute lifetime revenue and top products. Only the dates were never
// selected, so nothing could be bucketed over time.
//
// One series, so no legend — the heading names it. No label on every bar; the
// hover carries the exact figure. A window with no orders gets an empty state
// rather than a flat line, because a flat line at zero asserts "you sold
// nothing" when the truth is usually "nothing in this window".
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PendingPanel } from "@/components/portal/PendingPanel";
import { axisMoney, exactMoney, hasRevenue, seriesTotal, type RevenuePoint } from "@/lib/portal/revenue-series";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-[hsl(var(--dark))] px-3 py-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{exactMoney(Number(payload[0]?.value ?? 0))}</div>
    </div>
  );
}

export function AnalyticsRevenueChart({
  monthly,
  loading = false,
}: {
  monthly: RevenuePoint[];
  loading?: boolean;
}) {
  if (loading) return <Skeleton className="h-60 md:h-56 w-full rounded-2xl" />;

  if (!hasRevenue(monthly)) {
    return (
      <PendingPanel
        icon={<TrendingUp className="h-5 w-5" />}
        title="No revenue in the last 12 months"
        body="Attributed sales appear here month by month as orders come in."
      />
    );
  }

  const total = seriesTotal(monthly);

  return (
    <div className="ax-card p-4">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <div>
          <div className="text-2xl font-black tabular-nums leading-none">{exactMoney(total)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Attributed, last 12 months</div>
        </div>
      </div>
      <div className="h-60 md:h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthly} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              height={24}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={axisMoney}
            />
            <Tooltip cursor={{ fill: "hsl(var(--accent) / 0.06)" }} content={<ChartTooltip />} />
            <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
