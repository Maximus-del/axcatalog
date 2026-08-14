// Mobile-first. Profile (Phase 5) — brand snapshot, tier, analytics,
// Code Vault, account. Analytics stays visually simple.
import { useMemo } from "react";
import { LogOut, TrendingUp, ShoppingBag, Package, Wallet } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { AccessSummaryCard } from "@/components/portal/AccessSummaryCard";
import { PortalApprovals } from "@/components/portal/PortalApprovals";
import { useAthleteCredit } from "@/hooks/useAthleteCredit";
import { getTierProgress, fmtUsd } from "@/lib/portal-config";
import { CodeVault } from "@/components/portal/CodeVault";
import { Skeleton } from "@/components/ui/skeleton";

const ORDER_STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  in_production: "In production",
  ready: "Ready",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TX_LABEL: Record<string, string> = {
  accrual: "Credit earned",
  used: "Applied to order",
  adjustment: "Adjustment",
  refund: "Refund",
};

export default function PortalProfile() {
  const { user, signOut } = useAuth();
  const { athlete, sales, stats, products, orders, ordersLoading } = usePortalData();
  const { wallet, transactions, loading: creditLoading } = useAthleteCredit(athlete.id);

  const tier = getTierProgress(sales.lifetimeRevenue);
  const fullName = athlete.full_name || `${athlete.first_name} ${athlete.last_name}`.trim();

  const bestSellers = useMemo(() => {
    const titleById = new Map(products.map((p) => [p.id, p.title]));
    return [...sales.byProduct.entries()]
      .map(([id, s]) => ({ id, title: titleById.get(id) ?? "Product", revenue: s.revenue, qty: s.quantity }))
      .filter((r) => r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [sales.byProduct, products]);

  const brand = [
    { label: "Lifetime Revenue", value: fmtUsd(sales.lifetimeRevenue), icon: TrendingUp, loading: sales.loading },
    { label: "Orders", value: String(sales.totalOrders), icon: ShoppingBag, loading: sales.loading },
    { label: "Products Live", value: String(stats.productsLive ?? 0), icon: Package, loading: stats.loading },
    { label: "AX Credit", value: fmtUsd(wallet?.balance ?? 0, { cents: true }), icon: Wallet, loading: creditLoading },
  ];

  return (
    <main className="max-w-[1000px] mx-auto px-4 sm:px-6 py-6 space-y-8 pb-bottom-nav md:pb-32">
      <header>
        <div className="text-[10px] uppercase tracking-[0.2em] text-accent font-bold">Your Brand</div>
        <h1 className="text-2xl font-bold mt-1">{fullName}</h1>
      </header>

      <PortalApprovals athleteId={athlete.id} />

      {/* Brand stats */}
      <section className="grid grid-cols-2 gap-3">
        {brand.map((b) => {
          const Icon = b.icon;
          return (
            <div key={b.label} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <span className="text-[10px] uppercase tracking-[0.14em] font-semibold">{b.label}</span>
              </div>
              {b.loading ? <Skeleton className="h-7 w-20 mt-2" /> : <div className="text-2xl font-bold tabular-nums mt-1.5">{b.value}</div>}
            </div>
          );
        })}
      </section>

      <AccessSummaryCard athleteId={athlete.id} />

      {/* Tier progress */}
      <section className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/12 via-card to-card p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold uppercase tracking-[0.1em] text-accent">{tier.label}</div>
          {tier.next && (
            <div className="text-[11px] text-muted-foreground">{fmtUsd(tier.untilNext)} to Level {tier.next.level}</div>
          )}
        </div>
        <div className="mt-3 h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${tier.progressPct}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tier.current.perks.map((perk) => (
            <span key={perk} className="text-[10px] font-medium rounded-full bg-background/40 border border-border px-2 py-1 text-muted-foreground">
              {perk}
            </span>
          ))}
        </div>
      </section>

      {/* Best sellers */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-[0.06em] mb-3">Best Sellers</h2>
        {sales.loading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : bestSellers.length === 0 ? (
          <EmptyLine text="Sales will show your top products here." />
        ) : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {bestSellers.map((b, i) => {
              const max = bestSellers[0].revenue || 1;
              return (
                <div key={b.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium truncate">
                      <span className="text-muted-foreground mr-1.5">{i + 1}.</span>
                      {b.title}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-accent shrink-0">{fmtUsd(b.revenue)}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-accent" style={{ width: `${Math.max(4, (b.revenue / max) * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent orders */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-[0.06em] mb-3">Recent Orders</h2>
        {ordersLoading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : orders.length === 0 ? (
          <EmptyLine text="Your orders will appear here." />
        ) : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {orders.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{o.order_number ?? o.id.slice(0, 8)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {o.total_units} units
                  </div>
                </div>
                <span className="text-[11px] font-semibold rounded-full bg-muted px-2 py-1 text-muted-foreground shrink-0">
                  {ORDER_STATUS_LABEL[o.status] ?? o.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Credit activity */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-[0.06em] mb-3">Credit Activity</h2>
        {creditLoading ? (
          <Skeleton className="h-20 w-full rounded-2xl" />
        ) : transactions.length === 0 ? (
          <EmptyLine text="Earn $1 for every $10 you spend." />
        ) : (
          <div className="rounded-2xl border border-border bg-card divide-y divide-border">
            {transactions.slice(0, 5).map((t) => {
              const positive = t.amount >= 0;
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{TX_LABEL[t.type] ?? t.type}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${positive ? "text-accent" : "text-foreground"}`}>
                    {positive ? "+" : "−"}${Math.abs(t.amount).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Code Vault */}
      <CodeVault />

      {/* Account */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-[0.06em] mb-3">Account</h2>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-sm text-muted-foreground">Signed in as</span>
            <span className="text-sm font-medium truncate max-w-[60%]">{user?.email}</span>
          </div>
          <button onClick={signOut} className="pressable w-full flex items-center gap-3 px-4 py-3.5 text-destructive text-sm font-medium">
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
