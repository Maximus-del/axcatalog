import { Shirt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import type { ProductSales } from "@/hooks/usePortalSales";
import { shopifyImg } from "@/lib/shopify-image";

interface Props {
  products: PortalProduct[];
  loading: boolean;
  salesByProduct?: Map<string, ProductSales>;
}

/**
 * Top products ranked by attributed revenue. Falls back to created_at order
 * when no sales data is available.
 */
export function AnalyticsTopProducts({ products, loading, salesByProduct }: Props) {
  const getSales = (id: string): ProductSales =>
    salesByProduct?.get(id) ?? { quantity: 0, revenue: 0 };
  const sorted = [...products].sort(
    (a, b) => getSales(b.id).revenue - getSales(a.id).revenue,
  );
  const top = sorted.slice(0, 4);
  const maxRev = Math.max(1, ...top.map((p) => getSales(p.id).revenue));
  const fmtMoney = (n: number) =>
    n === 0 ? "$0" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-1 md:gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 md:h-14 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="ax-card p-4">
      {top.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No products linked yet.
        </div>
      ) : (
        <>
          {/* Mobile: 2x2 grid */}
          <div className="grid grid-cols-2 gap-3 md:hidden">
            {top.map((p, i) => (
              <div
                key={p.id}
                className="rounded-md border border-border bg-[hsl(var(--dark))] overflow-hidden flex flex-col stagger-fade"
                style={{ ["--i" as string]: i }}
              >
                <div className="aspect-square bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden">
                  {p.primary_image_url ? (
                    <img
                      src={shopifyImg(p.primary_image_url, 400) ?? p.primary_image_url}
                      alt=""
                      loading="lazy"
                      className="max-h-full max-w-full object-contain p-2"
                    />
                  ) : (
                    <Shirt className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />
                  )}
                </div>
                <div className="p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="ax-label">#{i + 1}</span>
                    <span className="text-xs text-muted-foreground">
                      {getSales(p.id).quantity} sold
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-tight line-clamp-2" title={p.title}>
                    {p.title}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: list */}
          <div className="hidden md:block space-y-2">
            {top.map((p, i) => {
              const s = getSales(p.id);
              const pct = (s.revenue / maxRev) * 100;
              return (
              <div key={p.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/5">
                <div className="ax-label w-6 text-center">{i + 1}</div>
                <div className="h-10 w-10 rounded bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden shrink-0">
                  {p.primary_image_url ? (
                    <img
                      src={shopifyImg(p.primary_image_url, 200) ?? p.primary_image_url}
                      alt=""
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <Shirt className="h-5 w-5 text-muted-foreground/40" strokeWidth={1.5} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{s.quantity} sold</div>
                  <div className="mt-1 h-1.5 w-full bg-muted rounded">
                    <div
                      className="h-full rounded bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm tabular-nums">{fmtMoney(s.revenue)}</div>
              </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
