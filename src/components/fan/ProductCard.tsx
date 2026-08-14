// Feed / profile product card. Links out to the external AX store (no in-app
// checkout — matches the platform rule to hand off payment externally).
import { ImageOff, ExternalLink } from "lucide-react";
import { productImageUrl, shopLink, fmtPrice } from "@/lib/ecosystem/image";
import type { PublicAthleteProduct } from "@/lib/ecosystem/types";

export function ProductCard({ product, athleteName }: { product: PublicAthleteProduct; athleteName?: string }) {
  const img = productImageUrl(product);
  const href = shopLink(product.shopify_handle);
  const price = fmtPrice(product.price);

  const inner = (
    <>
      <div className="relative aspect-square bg-muted overflow-hidden">
        {img ? (
          <img src={img} alt={product.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
        {href && (
          <span className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 backdrop-blur flex items-center justify-center">
            <ExternalLink className="h-3.5 w-3.5 text-white" />
          </span>
        )}
      </div>
      <div className="p-3">
        {athleteName && <div className="text-[11px] uppercase tracking-wider text-accent font-bold truncate">{athleteName}</div>}
        <div className="text-sm font-semibold leading-tight line-clamp-2 mt-0.5">{product.title}</div>
        {price && <div className="text-[13px] text-muted-foreground mt-1">{price}</div>}
      </div>
    </>
  );

  const cls = "block rounded-2xl overflow-hidden border border-border bg-card hover:border-accent/40 transition-colors";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
