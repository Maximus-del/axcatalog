import { useEffect, useState } from "react";
import { Shirt, ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ProductImage } from "@/components/shared/ProductImage";
import type { PortalProduct } from "@/hooks/usePortalProducts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: PortalProduct | null;
}

interface BlankInfo {
  brand: string | null;
  garment_title: string | null;
  fabric: string | null;
  color: string | null;
  fabric_specs: Record<string, unknown> | null;
}

interface ProductInfo {
  description: string | null;
}

export function ProductPreviewDialog({ open, onOpenChange, product }: Props) {
  const [idx, setIdx] = useState(0);
  const [blank, setBlank] = useState<BlankInfo | null>(null);
  const [info, setInfo] = useState<ProductInfo | null>(null);

  useEffect(() => {
    if (!open) return;
    setIdx(0);
    setBlank(null);
    setInfo(null);
    if (!product) return;
    let cancelled = false;
    void (async () => {
      const [{ data: p }, blankRes] = await Promise.all([
        supabase
          .from("products")
          .select("description")
          .eq("id", product.id)
          .maybeSingle(),
        product.blank_id
          ? supabase
              .from("blanks")
              .select("brand, garment_title, fabric, color, fabric_specs")
              .eq("id", product.blank_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setInfo({ description: p?.description ?? null });
      setBlank((blankRes.data as BlankInfo) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, product]);

  if (!product) return null;
  const images = product.images?.length
    ? product.images
    : product.primary_image_url
      ? [{ id: "primary", url: product.primary_image_url, is_primary: true, sort_order: 0 }]
      : [];
  const current = images[idx];

  const fabricLines: Array<[string, string]> = [];
  if (blank?.brand) fabricLines.push(["Brand", blank.brand]);
  if (blank?.garment_title) fabricLines.push(["Style", blank.garment_title]);
  if (blank?.color) fabricLines.push(["Color", blank.color]);
  if (blank?.fabric) fabricLines.push(["Fabric", blank.fabric]);
  if (blank?.fabric_specs && typeof blank.fabric_specs === "object") {
    for (const [k, v] of Object.entries(blank.fabric_specs)) {
      if (v == null || v === "") continue;
      fabricLines.push([
        k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
        String(v),
      ]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-card border-border p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-accent uppercase tracking-[0.18em] text-sm">
            {product.title}
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-[1.2fr_1fr] gap-0">
          <div className="relative bg-[hsl(var(--dark))] aspect-square flex items-center justify-center">
            {current ? (
              <ProductImage
                images={[current]}
                alt={product.title}
                viewMode="athlete"
                size="hero"
                imgClassName="max-h-full max-w-full object-contain p-4"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
                <Shirt className="h-16 w-16 text-muted-foreground/30" strokeWidth={1.2} />
                <span className="text-xs uppercase tracking-wider">No image</span>
              </div>
            )}
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/70 hover:bg-background flex items-center justify-center"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIdx((i) => (i + 1) % images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-background/70 hover:bg-background flex items-center justify-center"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {images.map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        i === idx ? "bg-accent" : "bg-muted-foreground/40",
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {info?.description && (
              <div>
                <div className="ax-label mb-1.5">Description</div>
                <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">
                  {info.description}
                </p>
              </div>
            )}

            {fabricLines.length > 0 && (
              <div>
                <div className="ax-label mb-1.5">Material & Fabric</div>
                <dl className="text-sm divide-y divide-border/60">
                  {fabricLines.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-1.5">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="text-foreground/90 text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {images.length > 1 && (
              <div>
                <div className="ax-label mb-1.5">Images</div>
                <div className="flex gap-2 flex-wrap">
                  {images.map((img, i) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setIdx(i)}
                      className={cn(
                        "h-14 w-14 rounded bg-[hsl(var(--dark))] overflow-hidden border",
                        i === idx ? "border-accent" : "border-border",
                      )}
                    >
                      <ProductImage
                        images={[img]}
                        alt=""
                        viewMode="athlete"
                        size="card"
                        imgClassName="h-full w-full object-contain p-1"
                        flagFailures={false}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!info?.description && fabricLines.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No additional product details available.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}