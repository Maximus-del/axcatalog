// Mobile-first. Test at 375px before merging.
import { useState } from "react";
import { Copy, Download, ExternalLink, ImagePlus, Shirt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { shopifyImg } from "@/lib/shopify-image";
import { ProductGalleryDialog } from "./ProductGalleryDialog";

interface Props {
  products: PortalProduct[];
  loading: boolean;
  athleteId: string;
  organizationId: string;
}

function shareUrl(p: PortalProduct): string {
  if (p.shopify_handle) return `https://www.athletexclusive.com/products/${p.shopify_handle}`;
  return `https://www.athletexclusive.com/products/${p.slug}`;
}

async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Fetch failed");
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    toast.success("Saved to your device");
  } catch {
    toast.error("Couldn't save — try again");
  }
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
        const url = shareUrl(p);
        return (
          <div key={p.id} className="ax-card p-3 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setGalleryProduct(p)}
              className="relative h-56 rounded-md bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden group focus:outline-none focus:ring-2 focus:ring-accent"
              aria-label={`Open gallery for ${p.title}`}
            >
              {p.primary_image_url ? (
                <img
                  src={shopifyImg(p.primary_image_url, 600) ?? p.primary_image_url}
                  alt={p.title}
                  className="max-h-full max-w-full object-contain p-3"
                  loading="lazy"
                />
              ) : (
                <Shirt className="h-12 w-12 text-muted-foreground/40" strokeWidth={1.5} />
              )}
              <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-accent/90 text-accent-foreground text-[10px] font-bold uppercase tracking-wider">
                Available Now
              </div>
              <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
                  <ImagePlus className="h-4 w-4" /> Open gallery
                </span>
              </div>
            </button>
            <div className="px-1">
              <h3 className="text-sm font-semibold truncate" title={p.title}>
                {p.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-1">— sold</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copied");
                  } catch {
                    toast.error("Couldn't copy");
                  }
                }}
              >
                <Copy className="h-3 w-3 mr-1" /> Link
              </Button>
              <Button variant="outline" size="sm" asChild className="h-8 text-xs">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3 mr-1" /> View
                </a>
              </Button>
              <Button
                size="sm"
                disabled={!p.primary_image_url}
                onClick={() =>
                  p.primary_image_url &&
                  downloadImage(p.primary_image_url, `${p.slug}.png`)
                }
                className="h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
              >
                <Download className="h-3 w-3 mr-1" /> Save
              </Button>
            </div>
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
