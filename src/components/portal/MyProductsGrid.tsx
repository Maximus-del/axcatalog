// Mobile-first. Test at 375px before merging.
import { Shirt } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { ProductCard } from "./ProductCard";

interface Props {
  products: PortalProduct[];
  loading: boolean;
}

export function MyProductsGrid({ products, loading }: Props) {
  if (loading) {
    return (
      <div className="grid gap-3 grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="ax-card p-12 text-center">
        <Shirt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">
          No products linked to you yet. Once your merch is live, it'll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {products.map((p, i) => (
        <div key={p.id} className="stagger-fade" style={{ ["--i" as string]: i }}>
          <ProductCard product={p} />
        </div>
      ))}
    </div>
  );
}
