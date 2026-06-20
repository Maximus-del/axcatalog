// Horizontal product preview for the portal home. Snap-scroll on mobile,
// arrow controls on desktop. Item width scales with breakpoint so we get
// roughly 2 / 3 / 4 / 5 cards visible across sm / md / lg / xl.
import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Shirt } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductImage } from "@/components/shared/ProductImage";
import { cn } from "@/lib/utils";
import type { PortalProduct } from "@/hooks/usePortalProducts";

interface Props {
  products: PortalProduct[];
  loading?: boolean;
  title?: string;
  onViewAll?: () => void;
}

export function ProductPreviewSlider({ products, loading, title = "Your Products", onViewAll }: Props) {
  const navigate = useNavigate();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows, products.length]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const item = el.querySelector<HTMLElement>("[data-slide-item]");
    const step = item ? item.offsetWidth + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step * 2, behavior: "smooth" });
  };

  const items: (PortalProduct | null)[] = loading && products.length === 0
    ? Array.from({ length: 6 }, () => null)
    : products;

  if (!loading && products.length === 0) {
    return (
      <section className="space-y-3">
        <div className="flex items-end justify-between px-1">
          <div>
            <h2 className="ax-label text-accent">{title}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Your products will appear here
            </p>
          </div>
        </div>
        <div className="ax-card p-8 flex flex-col items-center justify-center gap-2 text-center">
          <Shirt className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.2} />
          <p className="text-sm text-muted-foreground">
            No products yet
          </p>
          <p className="text-xs text-muted-foreground/70">
            Once your team adds products to your roster, they'll show up here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between px-1">
        <div>
          <h2 className="ax-label text-accent">{title}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Tap a product to view details
          </p>
        </div>
        <div className="flex items-center gap-1">
          {onViewAll && (
            <Button variant="ghost" size="sm" onClick={onViewAll} className="text-xs">
              View all
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="hidden md:inline-flex h-8 w-8"
            onClick={() => scrollBy(-1)}
            disabled={!canPrev}
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden md:inline-flex h-8 w-8"
            onClick={() => scrollBy(1)}
            disabled={!canNext}
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="relative -mx-4 sm:-mx-6">
        <div
          ref={scrollerRef}
          className={cn(
            "flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth",
            "px-4 sm:px-6 pb-2",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {items.map((p, i) => (
            <div
              key={p?.id ?? `s-${i}`}
              data-slide-item
              className={cn(
                "snap-start shrink-0",
                // Roughly 2 / 3 / 4 / 5 visible.
                "basis-[44%] sm:basis-[31%] md:basis-[23%] lg:basis-[19%]",
              )}
            >
              {p ? (
                <ProductSlide
                  product={p}
                  onClick={() => navigate(`/portal/products/${p.id}`)}
                />
              ) : (
                <Skeleton className="aspect-square w-full rounded-md" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProductSlide({ product, onClick }: { product: PortalProduct; onClick: () => void }) {
  const unit = product.athlete_unit_price ?? product.wholesale_price ?? null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group ax-card p-2 w-full flex flex-col gap-2 text-left transition hover:border-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="relative aspect-square rounded-md bg-[hsl(var(--dark))] overflow-hidden flex items-center justify-center">
        {product.images.length > 0 || product.primary_image_url ? (
          <ProductImage
            images={product.images}
            url={product.primary_image_url}
            alt={product.title}
            viewMode="athlete"
            size="card"
            imgClassName="p-2 transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <Shirt className="h-8 w-8 text-muted-foreground/30" strokeWidth={1.2} />
        )}
      </div>
      <div className="px-0.5 pb-1">
        <h3 className="text-xs font-semibold truncate" title={product.title}>
          {product.title}
        </h3>
        <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
          {unit != null ? `$${unit.toFixed(2)} / unit` : "Price coming soon"}
        </p>
      </div>
    </button>
  );
}