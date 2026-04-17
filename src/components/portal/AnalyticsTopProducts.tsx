import { Shirt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortalProduct } from "@/hooks/usePortalProducts";

interface Props {
  products: PortalProduct[];
  loading: boolean;
}

/**
 * Top products by created_at (no sales data yet).
 * Bars rendered at 0% with a clear "Sales data populates after Shopify sync" note.
 */
export function AnalyticsTopProducts({ products, loading }: Props) {
  const top = products.slice(0, 5);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="ax-card p-4">
      <p className="text-xs text-muted-foreground mb-4">
        Sales data will populate after Shopify sync is configured.
      </p>
      {top.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No products linked yet.
        </div>
      ) : (
        <div className="space-y-2">
          {top.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/5"
            >
              <div className="ax-label w-6 text-center">{i + 1}</div>
              <div className="h-10 w-10 rounded bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden shrink-0">
                {p.primary_image_url ? (
                  <img
                    src={p.primary_image_url}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <Shirt className="h-5 w-5 text-muted-foreground/40" strokeWidth={1.5} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.title}</div>
                <div className="text-xs text-muted-foreground">— sold</div>
                <div className="mt-1 h-1.5 w-full bg-muted rounded">
                  <div className="h-full w-0 rounded bg-accent" />
                </div>
              </div>
              <div className="text-sm text-muted-foreground tabular-nums">$—</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
