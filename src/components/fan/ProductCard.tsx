// Product card → opens in-app product detail (/p/:id). Save button overlays
// the image. Actual purchase happens on the AX store from the detail page.
import { Link } from "react-router-dom";
import { ImageOff } from "lucide-react";
import { productImageUrl, fmtPrice } from "@/lib/ecosystem/image";
import type { PublicAthleteProduct } from "@/lib/ecosystem/types";
import { SaveButton } from "@/components/fan/ui/SaveButton";

export function ProductCard({ product, athleteName }: { product: PublicAthleteProduct; athleteName?: string }) {
  const img = productImageUrl(product);
  const price = fmtPrice(product.price);

  return (
    <Link
      to={`/p/${product.id}`}
      className="block rounded-2xl overflow-hidden border border-border bg-card hover:border-accent/40 transition-colors"
    >
      <div className="relative aspect-square bg-muted overflow-hidden">
        {img ? (
          <img src={img} alt={product.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <SaveButton item={{ type: "product", ref: product.id, athleteId: product.athlete_id, title: product.title }} />
        </div>
      </div>
      <div className="p-3">
        {athleteName && <div className="text-[11px] uppercase tracking-wider text-accent font-bold truncate">{athleteName}</div>}
        <div className="text-sm font-semibold leading-tight line-clamp-2 mt-0.5">{product.title}</div>
        {price && <div className="text-[13px] text-muted-foreground mt-1">{price}</div>}
      </div>
    </Link>
  );
}
