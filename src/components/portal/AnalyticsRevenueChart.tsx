import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const stubData = MONTHS.map((m) => ({ month: m, revenue: 0 }));

export function AnalyticsRevenueChart() {
  return (
    <div className="ax-card p-4">
      <p className="text-xs text-muted-foreground mb-4">
        Revenue data will appear here after Shopify sync.
      </p>
      <div className="h-56 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stubData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: "hsl(var(--accent) / 0.05)" }}
              contentStyle={{
                background: "hsl(var(--dark))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">
            Awaiting Shopify sync
          </span>
        </div>
      </div>
    </div>
  );
}
