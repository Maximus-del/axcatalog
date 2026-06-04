// Mobile-first. Test at 375px before merging.
import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import type { ProductSales } from "@/hooks/usePortalSales";
import { ProductImage } from "@/components/shared/ProductImage";
import { ProductGalleryDialog } from "./ProductGalleryDialog";

interface Props {
  products: PortalProduct[];
  loading: boolean;
  athleteId: string;
  organizationId: string;
  salesByProduct?: Map<string, ProductSales>;
}

export function ContentHubGrid({ products, loading, athleteId, organizationId }: Props) {
  const [galleryProduct, setGalleryProduct] = useState<PortalProduct | null>(null);
  if (loading) {
    return (
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-80 rounded-xl" />
        ))}
      </div>
    );
  }

  const top = products.slice(0, 10);

  if (top.length === 0) {
    return (
      <div className="ax-card p-12 text-center text-sm text-muted-foreground">
        No content available yet — graphics will appear when products are linked.
      </div>
    );
  }

  return (
    <>
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
      {top.map((p) => {
        return (
          <div key={p.id} className="ax-card p-3 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setGalleryProduct(p)}
              className="relative h-56 rounded-md bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden group focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label={`Open gallery for ${p.title}`}
            >
              <ProductImage
                images={p.images}
                url={p.primary_image_url}
                alt={p.title}
                viewMode="athlete"
                size="card"
                imgClassName="p-3"
              />
            </button>
            <div className="px-1">
              <h3 className="text-sm font-semibold truncate" title={p.title}>
                {p.title}
              </h3>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs font-bold uppercase tracking-wider"
              onClick={() => setGalleryProduct(p)}
            >
              <ImagePlus className="h-3 w-3 mr-1" /> View gallery
            </Button>
          </div>
        );
      })}
    </div>
    <ProductGalleryDialog
      open={!!galleryProduct}
      onOpenChange={(v) => !v && setGalleryProduct(null)}
      product={galleryProduct}
      athleteId={athleteId}
      organizationId={organizationId}
    />
    </>
  );
}
