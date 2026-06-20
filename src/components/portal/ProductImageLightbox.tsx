import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/components/shared/ProductImage";
import type { PortalProduct } from "@/hooks/usePortalProducts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: PortalProduct | null;
}

export function ProductImageLightbox({ open, onOpenChange, product }: Props) {
  const [idx, setIdx] = useState(0);

  if (!product) return null;

  const images = product.images?.length
    ? product.images
    : product.primary_image_url
      ? [{ id: "primary", url: product.primary_image_url, is_primary: true, sort_order: 0 }]
      : [];

  const current = images[idx];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setIdx(0);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-4xl bg-card border-border p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border flex flex-row items-center justify-between">
          <DialogTitle className="text-accent uppercase tracking-[0.18em] text-sm">
            {product.title}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="relative bg-[hsl(var(--dark))] w-full h-[60vh] max-h-[640px] overflow-hidden flex items-center justify-center px-14 sm:px-20 py-4">
          {current ? (
            <ProductImage
              images={[current]}
              alt={product.title}
              viewMode="athlete"
              size="hero"
              imgClassName="max-h-full max-w-full w-auto h-auto object-contain"
            />
          ) : (
            <div className="text-muted-foreground text-sm">No images available</div>
          )}

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
                className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 hover:bg-background flex items-center justify-center shadow-lg"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setIdx((i) => (i + 1) % images.length)}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-background/80 hover:bg-background flex items-center justify-center shadow-lg"
                aria-label="Next image"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Dot indicators */}
          {images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={cn(
                    "h-2 w-2 rounded-full transition-colors",
                    i === idx ? "bg-accent" : "bg-muted-foreground/40 hover:bg-muted-foreground/60",
                  )}
                  aria-label={`Go to image ${i + 1}`}
                />
              ))}
            </div>
          )}

          {/* Image counter */}
          {images.length > 1 && (
            <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-background/80 text-xs font-medium">
              {idx + 1} / {images.length}
            </div>
          )}
        </div>

        {/* Thumbnail strip */}
        {images.length > 1 && (
          <div className="px-6 py-4 border-t border-border">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={cn(
                    "h-16 w-16 rounded-md bg-[hsl(var(--dark))] overflow-hidden border-2 shrink-0 flex items-center justify-center",
                    i === idx ? "border-accent" : "border-transparent hover:border-border",
                  )}
                >
                  <ProductImage
                    images={[img]}
                    alt=""
                    viewMode="athlete"
                    size="card"
                    imgClassName="h-full w-full object-contain"
                    flagFailures={false}
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
