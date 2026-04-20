// Mobile-first. Test at 375px before merging.
//
// Read-only grid of mockups. The "source" of these images is Shopify
// (anything in product_images — they're synced from Shopify product
// media). Admin can:
//  - View full size in a lightbox
//  - Set as primary
//  - Open the corresponding Shopify product page in a new tab
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ImageIcon, Star, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MockupRow {
  id: string;
  product_id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string | null;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
  url: string;
}

interface Props {
  productId: string;
  shopifyProductId: string | null;
  shopifyShopDomain: string | null;
  onCountChange?: (n: number) => void;
}

export function MockupsTab({ productId, shopifyProductId, shopifyShopDomain, onCountChange }: Props) {
  const [rows, setRows] = useState<MockupRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_images")
      .select("id, product_id, storage_bucket, storage_path, file_name, alt_text, is_primary, sort_order")
      .eq("product_id", productId)
      .order("sort_order");
    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }
    const out = (data ?? []).map((r) => {
      const { data: pub } = supabase.storage.from(r.storage_bucket).getPublicUrl(r.storage_path);
      return { ...r, url: pub.publicUrl } as MockupRow;
    });
    setRows(out);
    onCountChange?.(out.length);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  async function setPrimary(row: MockupRow) {
    if (!rows) return;
    const others = rows.filter((r) => r.id !== row.id).map((r) => r.id);
    // Optimistic
    setRows((rs) => rs?.map((r) => ({ ...r, is_primary: r.id === row.id })) ?? rs);
    if (others.length) {
      await supabase.from("product_images").update({ is_primary: false }).in("id", others);
    }
    const { error } = await supabase
      .from("product_images")
      .update({ is_primary: true })
      .eq("id", row.id);
    if (error) {
      toast.error("Could not set primary mockup");
      load();
    } else {
      toast.success("Primary mockup updated");
    }
  }

  const shopifyUrl = useMemo(() => {
    if (!shopifyShopDomain || !shopifyProductId) return null;
    // shopifyProductId can be a GID or numeric — strip GID prefix if present
    const numeric = shopifyProductId.split("/").pop();
    return `https://${shopifyShopDomain}/admin/products/${numeric}`;
  }, [shopifyShopDomain, shopifyProductId]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="ax-card p-12 text-center space-y-3">
        <ImageIcon className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">No mockups synced yet.</p>
        <p className="text-xs text-muted-foreground">
          Add product images in Shopify — they'll sync here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {rows.map((m, i) => (
          <div
            key={m.id}
            className="ax-card p-2 space-y-2 stagger-fade"
            style={{ ["--i" as string]: i }}
          >
            <div className="relative aspect-square rounded-md overflow-hidden bg-muted group">
              <img
                src={m.url}
                alt={m.alt_text ?? m.file_name ?? "Product mockup"}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-dark/80 text-white border border-white/10">
                From Shopify
              </span>
              {m.is_primary && (
                <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-accent text-accent-foreground">
                  <Star className="h-2.5 w-2.5" /> Primary
                </span>
              )}
              <button
                type="button"
                aria-label="View full size"
                onClick={() => setLightboxUrl(m.url)}
                className={cn(
                  "absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-colors opacity-0 hover:opacity-100",
                )}
              >
                <Maximize2 className="h-6 w-6 text-white" />
              </button>
            </div>
            <div className="text-xs truncate text-muted-foreground" title={m.file_name ?? ""}>
              {m.alt_text ?? m.file_name ?? "image"}
            </div>
            {!m.is_primary && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs gap-1 w-full justify-start"
                onClick={() => setPrimary(m)}
              >
                <Star className="h-3 w-3" /> Set as primary
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 text-xs text-muted-foreground">
        <span>Manage mockups in Shopify admin. Changes sync automatically.</span>
        {shopifyUrl && (
          <a
            href={shopifyUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-accent hover:underline"
          >
            Open in Shopify <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <Dialog open={!!lightboxUrl} onOpenChange={(o) => !o && setLightboxUrl(null)}>
        <DialogContent className="max-w-4xl p-2 bg-dark border-border">
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Mockup full size"
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
