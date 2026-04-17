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
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
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
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
