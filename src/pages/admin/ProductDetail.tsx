// Mobile-first. Test at 375px before merging.
//
// Full-page admin product detail. Hosts the unified Media section
// (Mockups / Designs / Videos). Non-media product editing still lives
// in ProductDetailDrawer for now — a "Quick edit" button opens it here.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  ImageIcon,
  Layers,
  Loader2,
  Pencil,
  RefreshCw,
  Video as VideoIcon,
  Frame as FrameIcon,
  DollarSign,
  Boxes,
} from "lucide-react";
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
  blank_id: string | null;
  description: string | null;
}

interface ProductImageRow {
  storage_bucket: string;
  storage_path: string;
  is_primary: boolean;
  sort_order: number;
}

interface VariantRow {
  id: string;
  color: string | null;
  size: string | null;
  price: number | null;
  sku: string | null;
  inventory_quantity: number | null;
  available: boolean | null;
}

interface BlankRow {
  garment_type: string | null;
  blank_cost: number | null;
  decoration_cost: number | null;
  additional_cost: number | null;
}

interface PrintZoneRow {
  id: string;
  label: string;
  surface: string;
}

function publicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
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

  const [images, setImages] = useState<ProductImageRow[]>([]);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [blank, setBlank] = useState<BlankRow | null>(null);
  const [zones, setZones] = useState<PrintZoneRow[]>([]);

  async function load() {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, organization_id, title, slug, status, price, shopify_product_id, shopify_handle, blank_id, description",
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

    // images
    const { data: imgs } = await supabase
      .from("product_images")
      .select("storage_bucket, storage_path, is_primary, sort_order")
      .eq("product_id", id)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });
    setImages((imgs ?? []) as ProductImageRow[]);
    setActiveImageIdx(0);

    // variants
    const { data: vrs } = await supabase
      .from("product_variants")
      .select("id, color, size, price, sku, inventory_quantity, available")
      .eq("product_id", id)
      .order("position", { ascending: true });
    setVariants((vrs ?? []) as VariantRow[]);

    // blank for cost + garment type
    if (data?.blank_id) {
      const { data: b } = await supabase
        .from("blanks")
        .select("garment_type, blank_cost, decoration_cost, additional_cost")
        .eq("id", data.blank_id)
        .maybeSingle();
      setBlank((b as BlankRow | null) ?? null);

      const gt = (b?.garment_type ?? "").toString().toLowerCase();
      const cat = /hat|cap/.test(gt) ? "cap" : "apparel";
      const { data: z } = await supabase
        .from("print_zones" as never)
        .select("id, label, surface")
        .eq("garment_category", cat)
        .order("surface", { ascending: true })
        .order("sort_order", { ascending: true });
      setZones((z ?? []) as PrintZoneRow[]);
    } else {
      setBlank(null);
      setZones([]);
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </div>
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

  const cost =
    blank
      ? Number(blank.blank_cost ?? 0) +
        Number(blank.decoration_cost ?? 0) +
        Number(blank.additional_cost ?? 0)
      : null;
  const price = product.price != null ? Number(product.price) : null;
  const margin = cost != null && price != null ? price - cost : null;
  const marginPct =
    margin != null && price && price > 0 ? (margin / price) * 100 : null;

  const variantColors = Array.from(
    new Set(variants.map((v) => v.color).filter(Boolean) as string[]),
  );
  const variantSizes = Array.from(
    new Set(variants.map((v) => v.size).filter(Boolean) as string[]),
  );
  const totalInventory = variants.reduce(
    (s, v) => s + (v.inventory_quantity ?? 0),
    0,
  );
  const availableVariants = variants.filter((v) => v.available !== false).length;

  const activeImage = images[activeImageIdx] ?? images[0] ?? null;

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

      {/* Apple-style hero: image + spec rail */}
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6">
        {/* Image gallery */}
        <div className="space-y-3">
          <div className="ax-card aspect-square bg-white overflow-hidden flex items-center justify-center">
            {activeImage ? (
              <img
                src={publicUrl(activeImage.storage_bucket, activeImage.storage_path)}
                alt={product.title}
                className="w-full h-full object-contain p-8"
              />
            ) : (
              <div className="text-sm text-muted-foreground">No image</div>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button
                  key={`${img.storage_path}-${i}`}
                  type="button"
                  onClick={() => setActiveImageIdx(i)}
                  className={cn(
                    "h-16 w-16 shrink-0 rounded-lg border bg-white overflow-hidden transition",
                    i === activeImageIdx
                      ? "border-accent ring-2 ring-accent/40"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  <img
                    src={publicUrl(img.storage_bucket, img.storage_path)}
                    alt=""
                    className="w-full h-full object-contain p-1"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Spec rail */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div>
            <div className="ax-section-header mb-2">Product</div>
            <h1 className="text-3xl font-bold leading-tight">{product.title}</h1>
            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
              <span
                className={cn(
                  "inline-flex px-2 py-0.5 rounded-full border capitalize",
                  statusBadgeClass(product.status),
                )}
              >
                {formatStatus(product.status)}
              </span>
              <code className="text-[11px] text-muted-foreground">{product.slug}</code>
            </div>
            {product.description && (
              <p className="mt-3 text-sm text-muted-foreground line-clamp-4">
                {product.description}
              </p>
            )}
          </div>

          {/* Price strip */}
          <div className="ax-card p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Retail
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {price != null ? `$${price.toFixed(2)}` : "—"}
            </div>
          </div>

          {/* Variants */}
          <div className="ax-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Variants</h2>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                {variants.length} total · {availableVariants} live
              </span>
            </div>
            {variantColors.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Colors
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {variantColors.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-muted text-foreground border border-border"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {variantSizes.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  Sizes
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {variantSizes.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-md bg-background border border-border tabular-nums"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {variants.length === 0 && (
              <div className="text-xs text-muted-foreground italic">
                No variants synced.
              </div>
            )}
          </div>

          {/* Cost / Margin */}
          <div className="ax-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Cost &amp; Margin</h2>
            </div>
            <SpecRow label="True cost">
              {cost != null ? `$${cost.toFixed(2)}` : "—"}
            </SpecRow>
            <SpecRow label="Margin / unit">
              {margin != null ? (
                <span
                  className={cn(
                    margin >= 0 ? "text-emerald-600" : "text-destructive",
                  )}
                >
                  ${margin.toFixed(2)}
                </span>
              ) : (
                "—"
              )}
            </SpecRow>
            <SpecRow label="Margin %">
              {marginPct != null ? `${marginPct.toFixed(1)}%` : "—"}
            </SpecRow>
          </div>

          {/* Inventory */}
          <div className="ax-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Inventory</h2>
            </div>
            <SpecRow label="On hand">
              <span className="tabular-nums">{totalInventory}</span>
            </SpecRow>
            <SpecRow label="SKUs">
              <span className="tabular-nums">{variants.length}</span>
            </SpecRow>
          </div>

          {/* Print locations */}
          <div className="ax-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FrameIcon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Print locations</h2>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={() => navigate("/admin/print-zones")}
              >
                Edit
              </Button>
            </div>
            {zones.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">
                {product.blank_id
                  ? "No zones for this garment type."
                  : "Link a blank to enable print zones."}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {zones.map((z) => (
                  <span
                    key={z.id}
                    className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/30 capitalize"
                  >
                    {z.surface} · {z.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Files */}
          <div className="ax-card p-4 space-y-1">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Files</h2>
            </div>
            <SpecRow label="Mockups">
              <span className="tabular-nums">{counts.mockups}</span>
            </SpecRow>
            <SpecRow label="Designs">
              <span className="tabular-nums">{counts.designs}</span>
            </SpecRow>
            <SpecRow label="Videos">
              <span className="tabular-nums">{counts.videos}</span>
            </SpecRow>
          </div>
        </aside>
      </section>

      {/* Media */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Files &amp; Media</h2>
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

function SpecRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{children}</span>
    </div>
  );
}
