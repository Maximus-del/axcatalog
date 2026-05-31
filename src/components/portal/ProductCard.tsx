// Mobile-first. Test at 375px before merging.
//
// Athlete-portal product card. Thin presentation wrapper around the
// shared ProductImage so rendering can't drift from the admin grid.
// "View" navigates to the in-portal detail page; "Order" opens the
// shared bulk-order dialog; "Copy" copies the public storefront link.
import { useState } from "react";
import { Copy, Eye, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { ProductImage } from "@/components/shared/ProductImage";
import { ProductOrderDialog } from "./ProductOrderDialog";

interface Props {
  product: PortalProduct;
}

export function buildShareUrl(p: PortalProduct): string {
  if (p.shopify_handle) return `https://www.athletexclusive.com/products/${p.shopify_handle}`;
  return `https://www.athletexclusive.com/products/${p.slug}`;
}

export function ProductCard({ product }: Props) {
  const [orderOpen, setOrderOpen] = useState(false);
  const navigate = useNavigate();
  const shareUrl = buildShareUrl(product);
  const unitWholesale = product.athlete_unit_price ?? product.wholesale_price ?? null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — try again");
    }
  };

  return (
    <div className="ax-card p-3 flex flex-col gap-3">
      {/* Image — shared rendering path with admin grid. */}
      <button
        type="button"
        onClick={() => navigate(`/portal/products/${product.id}`)}
        className="relative h-40 rounded-md bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`View ${product.title}`}
      >
        <ProductImage
          images={product.images}
          url={product.primary_image_url}
          alt={product.title}
          viewMode="athlete"
          size="card"
          imgClassName="max-h-full max-w-full object-contain p-3"
        />
      </button>

      {/* Title + athlete-tier price */}
      <div className="px-1">
        <h3 className="text-sm font-semibold truncate" title={product.title}>
          {product.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
          {unitWholesale != null ? `$${unitWholesale.toFixed(2)} / unit` : "Price coming soon"}
        </p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="sm" onClick={handleCopy} className="h-8 text-xs">
          <Copy className="h-3 w-3 mr-1" /> Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/portal/products/${product.id}`)}
          className="h-8 text-xs"
        >
          <Eye className="h-3 w-3 mr-1" /> View
        </Button>
        <Button
          size="sm"
          onClick={() => setOrderOpen(true)}
          className="h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
        >
          <Plus className="h-3 w-3 mr-1" /> Order
        </Button>
      </div>

        <DialogContent className="max-w-lg p-0 bg-card border-border overflow-hidden">
          <div className="h-56 bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden">
            {product.primary_image_url && !imgFailed ? (
              <img
                src={shopifyImg(product.primary_image_url, 800) ?? product.primary_image_url}
                alt={product.title}
                className="max-h-full max-w-full object-contain p-4"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <Shirt className="h-16 w-16 text-muted-foreground/40" strokeWidth={1.5} />
            )}
          </div>

          <div className="px-6 pt-4 pb-2">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base font-semibold leading-tight">
                {product.title}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {unitWholesale != null
                  ? `$${unitWholesale.toFixed(2)} wholesale / unit`
                  : "Wholesale pricing TBD"}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 pb-4 space-y-4">
            {/* Auto-distribute */}
            <div className="rounded-md border border-border/60 bg-[hsl(var(--dark))]/40 px-3 py-2 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <Label htmlFor={`auto-${product.id}`} className="text-xs uppercase tracking-wider">
                    Auto-distribute
                  </Label>
                  <span className="text-[11px] text-muted-foreground">
                    Slide a total to split evenly across S–3XL
                  </span>
                </div>
                <Switch
                  id={`auto-${product.id}`}
                  checked={autoDistribute}
                  onCheckedChange={(v) => {
                    setAutoDistribute(v);
                  }}
                />
              </div>
              {autoDistribute && (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-accent leading-none tabular-nums">
                        {autoTotal}
                      </span>
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">
                        units
                      </span>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={autoTotal || ""}
                      placeholder="0"
                      onChange={(e) =>
                        applyAutoTotal(parseInt(e.target.value || "0", 10) || 0)
                      }
                      onFocus={(e) => e.currentTarget.select()}
                      className="h-7 w-20 text-center text-sm rounded bg-background border border-border focus:outline-none focus:border-accent"
                    />
                  </div>
                  <MilestoneSlider
                    min={0}
                    max={500}
                    step={1}
                    value={autoTotal}
                    onValueChange={(v) => applyAutoTotal(v)}
                    organizationId={athlete?.organization_id ?? null}
                  />
                </div>
              )}
            </div>

            {/* Size grid */}
            <div className="grid grid-cols-6 gap-1.5">
              {sizes.map((size) => {
                const qty = effectiveQtys[size] ?? 0;
                const active = qty > 0;
                return (
                  <div
                    key={size}
                    className={cn(
                      "flex flex-col items-center rounded border bg-background px-1 py-1.5 gap-1",
                      active ? "border-accent" : "border-border",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider",
                        active ? "text-accent" : "text-muted-foreground",
                      )}
                    >
                      {size}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        min={0}
                        value={qty || ""}
                        placeholder="0"
                        onChange={(e) =>
                          setQtys((p) => ({
                            ...p,
                            [size]: Math.max(0, parseInt(e.target.value || "0", 10) || 0),
                          }))
                        }
                        onFocus={(e) => e.currentTarget.select()}
                        className={cn(
                          "h-7 w-10 text-center text-sm rounded bg-transparent border-0 focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-70",
                          active && "text-accent font-semibold",
                        )}
                      />
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => bumpQty(size, +1)}
                          className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-accent disabled:opacity-40"
                          aria-label={`Increase ${size}`}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => bumpQty(size, -1)}
                          className="h-3 w-4 flex items-center justify-center text-muted-foreground hover:text-accent disabled:opacity-40"
                          aria-label={`Decrease ${size}`}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer: subtotal + submit */}
          <div className="border-t border-border px-6 py-4 flex items-center justify-between gap-3 bg-[hsl(var(--dark))]">
            <div>
              <div className="ax-label">Subtotal · {totalUnits} units</div>
              <div className="text-2xl font-bold text-accent leading-none mt-1">
                {subtotal != null ? `$${subtotal.toFixed(2)}` : "—"}
              </div>
              {discountPct > 0 && (
                <div className="text-[11px] text-accent uppercase tracking-wider mt-1">
                  {discountPct}% volume discount
                </div>
              )}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitting || totalUnits === 0}
              className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
