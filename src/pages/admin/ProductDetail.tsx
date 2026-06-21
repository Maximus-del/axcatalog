// Mobile-first. Test at 375px before merging.
//
// Full-page admin product detail. Hosts the unified Media section
// (Mockups / Designs / Videos). Non-media product editing still lives
// in ProductDetailDrawer for now — a "Quick edit" button opens it here.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, ImageIcon, Layers, Loader2, Pencil, RefreshCw, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { fetchShopifyPrimaryImage, refreshShopifyImages, summarizeRefresh } from "@/lib/shopify-refresh-images";
import { refreshShopifyVariants, summarizeVariantRefresh } from "@/lib/shopify-refresh-variants";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductDetailDrawer } from "@/components/admin/products/ProductDetailDrawer";
import { MockupsTab } from "@/components/admin/products/media/MockupsTab";
import { DesignsTab } from "@/components/admin/products/media/DesignsTab";
import { VideosTab } from "@/components/admin/products/media/VideosTab";
import { cn } from "@/lib/utils";
import { formatStatus, statusBadgeClass, type ProductStatus } from "@/lib/product-status";

interface ProductLite {
  id: string;
  organization_id: string;
  title: string;
  slug: string;
  status: ProductStatus;
  price: number | null;
  shopify_product_id: string | null;
  shopify_handle: string | null;
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<ProductLite | null>(null);
  const [shopDomain, setShopDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [fetchBusy, setFetchBusy] = useState(false);
  const [variantsBusy, setVariantsBusy] = useState(false);

  const [counts, setCounts] = useState({ mockups: 0, designs: 0, videos: 0 });
  const [tab, setTab] = useState<"mockups" | "designs" | "videos">("mockups");

  async function load() {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, organization_id, title, slug, status, price, shopify_product_id, shopify_handle",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) console.error(error);
    setProduct((data as ProductLite | null) ?? null);
    if (data?.organization_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("shopify_shop_domain")
        .eq("id", data.organization_id)
        .maybeSingle();
      setShopDomain(org?.shopify_shop_domain ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleRefreshImages() {
    if (!product || refreshBusy) return;
    setRefreshBusy(true);
    const t = toast.loading("Refreshing images from Shopify…");
    try {
      const res = await refreshShopifyImages({ product_id: product.id });
      toast.success(summarizeRefresh(res), { id: t });
      await load();
    } catch (e: any) {
      toast.error(`Refresh failed: ${e?.message ?? e}`, { id: t });
    } finally {
      setRefreshBusy(false);
    }
  }

  async function handleRefreshVariants() {
    if (!product || variantsBusy) return;
    setVariantsBusy(true);
    const t = toast.loading("Refreshing variants from Shopify…");
    try {
      const res = await refreshShopifyVariants({ product_id: product.id });
      if (res.errors.length) {
        toast.warning(`Partial sync — ${summarizeVariantRefresh(res)}`, { id: t });
      } else {
        toast.success(summarizeVariantRefresh(res), { id: t });
      }
    } catch (e: any) {
      toast.error("Variant refresh failed. Please try again.", { id: t });
      console.error("Variant refresh failed:", e);
    } finally {
      setVariantsBusy(false);
    }
  }

  async function handleFetchImage() {
    if (!product || fetchBusy) return;
    setFetchBusy(true);
    const t = toast.loading("Fetching primary image from Shopify…");
    try {
      const res = await fetchShopifyPrimaryImage({ product_id: product.id });
      if (res.ok) {
        toast.success("Image updated", { id: t });
        await load();
      } else if (res.no_image && res.shopify_admin_url) {
        toast.error("No image found in Shopify — re-upload there first", {
          id: t,
          action: {
            label: "Open Shopify",
            onClick: () => window.open(res.shopify_admin_url!, "_blank", "noopener,noreferrer"),
          },
        });
      } else {
        toast.error(res.message ?? "Fetch failed", { id: t });
      }
    } catch (e: any) {
      const url = e?.shopifyAdminUrl;
      toast.error(`Fetch failed: ${e?.message ?? e}`, {
        id: t,
        action: url
          ? { label: "Open Shopify", onClick: () => window.open(url, "_blank", "noopener,noreferrer") }
          : undefined,
      });
    } finally {
      setFetchBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-4 lg:p-8 max-w-[1400px] mx-auto space-y-4">
        <Button variant="ghost" asChild className="gap-2">
          <Link to="/admin/products">
            <ArrowLeft className="h-4 w-4" /> Back to products
          </Link>
        </Button>
        <div className="ax-card p-12 text-center text-sm text-muted-foreground">
          Product not found.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={() => navigate("/admin/products")} className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" /> Products
        </Button>
        <div className="flex items-center gap-2">
          {product.shopify_product_id && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={handleFetchImage}
                    disabled={fetchBusy || refreshBusy}
                    className="gap-2"
                  >
                    {fetchBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Fetch image
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pull the current primary image from Shopify for this product.</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={handleRefreshImages}
                    disabled={refreshBusy || fetchBusy}
                    className="gap-2"
                  >
                    {refreshBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Refresh images
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Full sync of all images for this product.</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={handleRefreshVariants}
                    disabled={variantsBusy}
                    className="gap-2"
                  >
                    {variantsBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Refresh variants
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pull colors, sizes, prices and inventory from Shopify.</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button variant="outline" onClick={() => setDrawerOpen(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> Quick edit
          </Button>
        </div>
      </div>

      {/* Hero */}
      <header className="space-y-2">
        <div className="ax-section-header">Product</div>
        <h1 className="text-2xl md:text-3xl font-bold">{product.title}</h1>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span
            className={cn(
              "inline-flex px-2 py-0.5 rounded-full border capitalize",
              statusBadgeClass(product.status),
            )}
          >
            {formatStatus(product.status)}
          </span>
          {product.price != null && (
            <span className="text-muted-foreground tabular-nums">
              ${Number(product.price).toFixed(2)}
            </span>
          )}
          <span className="text-muted-foreground">·</span>
          <code className="text-[11px] text-muted-foreground">{product.slug}</code>
        </div>
      </header>

      {/* Media */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Media</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            Mockups ({counts.mockups}) · Designs ({counts.designs}) · Videos ({counts.videos})
          </span>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid grid-cols-3 w-full sm:w-auto sm:inline-flex">
            <TabsTrigger value="mockups" className="gap-2">
              <ImageIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Mockups</span>
              <span className="text-xs text-muted-foreground tabular-nums">({counts.mockups})</span>
            </TabsTrigger>
            <TabsTrigger value="designs" className="gap-2">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Designs</span>
              <span className="text-xs text-muted-foreground tabular-nums">({counts.designs})</span>
            </TabsTrigger>
            <TabsTrigger value="videos" className="gap-2">
              <VideoIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Videos</span>
              <span className="text-xs text-muted-foreground tabular-nums">({counts.videos})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="mockups" className="mt-4">
            <MockupsTab
              productId={product.id}
              shopifyProductId={product.shopify_product_id}
              shopifyShopDomain={shopDomain}
              onCountChange={(n) => setCounts((c) => ({ ...c, mockups: n }))}
            />
          </TabsContent>

          <TabsContent value="designs" className="mt-4">
            <DesignsTab
              productId={product.id}
              organizationId={product.organization_id}
              productTitle={product.title}
              onCountChange={(n) => setCounts((c) => ({ ...c, designs: n }))}
            />
          </TabsContent>

          <TabsContent value="videos" className="mt-4">
            <VideosTab
              productId={product.id}
              organizationId={product.organization_id}
              onCountChange={(n) => setCounts((c) => ({ ...c, videos: n }))}
            />
          </TabsContent>
        </Tabs>
      </section>

      <ProductDetailDrawer
        productId={product.id}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onChanged={load}
      />
    </div>
  );
}
