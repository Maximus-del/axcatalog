// Mobile-first. Test at 375px before merging.
//
// Athlete-portal product card. Thin presentation wrapper around the
// shared ProductImage so rendering can't drift from the admin grid.
// "View" navigates to the in-portal detail page; "Order" opens the
// shared bulk-order dialog; "Copy" copies the public storefront link.
import { useState } from "react";
import { Copy, Eye, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { ProductImage } from "@/components/shared/ProductImage";
import { ProductOrderDialog } from "./ProductOrderDialog";

interface Props {
  product: PortalProduct;
}

export function buildShareUrl(p: PortalProduct): string {
  if (p.shopify_handle) return `https://www.athletexclusive.com/products/${p.shopify_handle}`;
  return `https://www.athletexclusive.com/products/${p.slug}`;
}

export function ProductCard({ product }: Props) {
  const [orderOpen, setOrderOpen] = useState(false);
  const navigate = useNavigate();
  const shareUrl = buildShareUrl(product);
  const unitWholesale = product.athlete_unit_price ?? product.wholesale_price ?? null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — try again");
    }
  };

  return (
    <div className="ax-card p-3 flex flex-col gap-3">
      {/* Image — shared rendering path with admin grid. */}
      <button
        type="button"
        onClick={() => navigate(`/portal/products/${product.id}`)}
        className="relative h-40 rounded-md bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`View ${product.title}`}
      >
        <ProductImage
          images={product.images}
          url={product.primary_image_url}
          alt={product.title}
          viewMode="athlete"
          size="card"
          imgClassName="max-h-full max-w-full object-contain p-3"
        />
      </button>

      {/* Title + athlete-tier price */}
      <div className="px-1">
        <h3 className="text-sm font-semibold truncate" title={product.title}>
          {product.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
          {unitWholesale != null ? `$${unitWholesale.toFixed(2)} / unit` : "Price coming soon"}
        </p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy} className="h-8 text-xs">
          <Copy className="h-3 w-3 mr-1" /> Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/portal/products/${product.id}`)}
          className="h-8 text-xs"
        >
          <Eye className="h-3 w-3 mr-1" /> View
        </Button>
        <Button
          size="sm"
          onClick={() => setOrderOpen(true)}
          className="h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
        >
          <Plus className="h-3 w-3 mr-1" /> Order
        </Button>
      </div>

      <ProductOrderDialog product={product} open={orderOpen} onOpenChange={setOrderOpen} />
    </div>
  );
}
