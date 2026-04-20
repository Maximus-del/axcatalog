import { cn } from "@/lib/utils";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { statusBadgeClass, formatStatus, type ProductStatus } from "@/lib/product-status";

interface ProductCardProps {
  id: string;
  title: string;
  price: number | null;
  compareAtPrice: number | null;
  status: ProductStatus;
  imageUrl: string | null;
  onClick: () => void;
}

export function ProductCard({
  title,
  price,
  compareAtPrice,
  status,
  imageUrl,
  onClick,
}: ProductCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left bg-card border border-border rounded-xl overflow-hidden transition-all duration-200 hover:border-accent hover:shadow-[0_8px_24px_-12px_hsl(var(--accent)/0.4)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="h-full w-full flex items-center justify-center text-3xl font-bold text-white"
            style={{ backgroundColor: avatarColorFor(title) }}
            aria-hidden
          >
            {initialsFor(title)}
          </div>
        )}
        <span
          className={cn(
            "absolute top-2 right-2 inline-flex px-2 py-0.5 rounded-full text-[10px] border capitalize backdrop-blur-sm",
            statusBadgeClass(status),
          )}
        >
          {formatStatus(status)}
        </span>
      </div>
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {title}
        </h3>
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-sm font-semibold text-foreground">
            {price != null ? `$${price.toFixed(2)}` : "—"}
          </span>
          {compareAtPrice != null && price != null && compareAtPrice > price && (
            <span className="text-xs text-muted-foreground line-through">
              ${compareAtPrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
