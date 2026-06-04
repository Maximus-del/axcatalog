// Mobile-first. Test at 375px before merging.
//
// Athlete-side product detail page. Mirrors the admin detail layout
// (in athlete viewMode): hero image, gallery, name + description,
// athlete-tier price, Order button, Copy share link, View on Shopify.
// No cost / margin / supplier / refresh-image actions.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAthlete } from "@/hooks/useCurrentAthlete";
import { usePortalProducts, type PortalProduct } from "@/hooks/usePortalProducts";
import { ProductImage } from "@/components/shared/ProductImage";
import { ProductOrderDialog } from "@/components/portal/ProductOrderDialog";
import { ProductImageLightbox } from "@/components/portal/ProductImageLightbox";
import { buildShareUrl } from "@/components/portal/ProductCard";
import { cn } from "@/lib/utils";

export default function PortalProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { athlete } = useCurrentAthlete();
  const { products, loading } = usePortalProducts(athlete?.id ?? null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  const [description, setDescription] = useState<string | null>(null);

  const product: PortalProduct | undefined = useMemo(
    () => products.find((p) => p.id === id),
    [products, id],
  );

  useEffect(() => setHeroIdx(0), [id]);

  // Pull plain product description (Shopify-synced) if present.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("products")
        .select("description")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) setDescription((data?.description as string | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading && !product) {
    return (
      <div className="p-4 lg:p-8 max-w-[1100px] mx-auto space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="aspect-[4/3] w-full max-w-2xl" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-4 lg:p-8 max-w-[1100px] mx-auto space-y-4">
        <Button variant="ghost" asChild className="gap-2">
          <Link to="/portal">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
        <div className="ax-card p-12 text-center text-sm text-muted-foreground">
          Product not found in your portal.
        </div>
      </div>
    );
  }

  const shareUrl = buildShareUrl(product);
  const unitPrice = product.athlete_unit_price ?? product.wholesale_price ?? null;
  const heroImage = product.images[heroIdx] ?? product.images[0];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-[1100px] mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate("/portal")} className="gap-2 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Hero + gallery */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="w-full aspect-[4/3] rounded-xl bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={`View images of ${product.title}`}
          >
            <ProductImage
              images={heroImage ? [heroImage] : product.images}
              alt={product.title}
              viewMode="athlete"
              size="hero"
              imgClassName="max-h-full max-w-full object-contain p-6"
            />
          </button>
          {product.images.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {product.images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => {
                    setHeroIdx(i);
                    setLightboxOpen(true);
                  }}
                  className={cn(
                    "aspect-square rounded-md bg-[hsl(var(--dark))] overflow-hidden border-2 flex items-center justify-center",
                    i === heroIdx ? "border-accent" : "border-transparent hover:border-border",
                  )}
                  aria-label={`View image ${i + 1}`}
                >
                  <ProductImage
                    images={[img]}
                    alt={`${product.title} ${i + 1}`}
                    viewMode="athlete"
                    size="card"
                    imgClassName="max-h-full max-w-full object-contain p-1"
                    flagFailures={false}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-5">
          <div className="space-y-2">
            <h1 className="text-2xl md:text-3xl font-bold leading-tight">{product.title}</h1>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-accent tabular-nums">
                {unitPrice != null ? `$${unitPrice.toFixed(2)}` : "—"}
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                / unit · MOQ 10
              </span>
            </div>
          </div>

          {description && (
            <div
              className="prose prose-sm prose-invert max-w-none text-sm text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: description }}
            />
          )}

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              onClick={() => setOrderOpen(true)}
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
            >
              <Plus className="h-4 w-4 mr-2" /> Order
            </Button>
            <Button variant="outline" size="lg" onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-2" /> Copy share link
            </Button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-accent inline-flex items-center gap-1 mt-1"
            >
              <ExternalLink className="h-3 w-3" /> View on Shopify
            </a>
          </div>
        </div>
      </div>

      <ProductOrderDialog product={product} open={orderOpen} onOpenChange={setOrderOpen} />
      <ProductImageLightbox
        product={product}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </div>
  );
}