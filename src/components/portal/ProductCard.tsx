import { useState } from "react";
import { Copy, ExternalLink, Plus, Shirt, Minus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { useOrderDraft } from "./OrderDraftContext";

interface Props {
  product: PortalProduct;
}

function buildShareUrl(p: PortalProduct): string {
  if (p.shopify_handle) return `https://www.athletexclusive.com/products/${p.shopify_handle}`;
  return `https://www.athletexclusive.com/products/${p.slug}`;
}

export function ProductCard({ product }: Props) {
  const [orderOpen, setOrderOpen] = useState(false);
  const [localQtys, setLocalQtys] = useState<Record<string, number>>({});
  const { bulkSet } = useOrderDraft();

  const url = buildShareUrl(product);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — try again");
    }
  };

  const handleAddToOrder = () => {
    if (!product.sizes.length) {
      toast.error("This product has no available sizes yet");
      return;
    }
    const total = Object.values(localQtys).reduce((s, n) => s + (n || 0), 0);
    if (total <= 0) {
      toast.error("Enter at least one quantity");
      return;
    }
    bulkSet(product.id, localQtys);
    setLocalQtys({});
    setOrderOpen(false);
    toast.success(`Added ${total} unit${total === 1 ? "" : "s"} to order draft`);
  };

  return (
    <div className="ax-card p-3 flex flex-col gap-3">
      {/* Image */}
      <div className="relative h-40 rounded-md bg-[hsl(var(--dark))] flex items-center justify-center overflow-hidden">
        {product.primary_image_url ? (
          <img
            src={product.primary_image_url}
            alt={product.title}
            className="max-h-full max-w-full object-contain p-3"
            loading="lazy"
          />
        ) : (
          <Shirt className="h-12 w-12 text-muted-foreground/40" strokeWidth={1.5} />
        )}
      </div>

      {/* Title + stub stats */}
      <div className="px-1">
        <h3 className="text-sm font-semibold truncate" title={product.title}>
          {product.title}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">— sold · $—</p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          className="h-8 text-xs"
        >
          <Copy className="h-3 w-3 mr-1" /> Copy
        </Button>
        <Button
          variant="outline"
          size="sm"
          asChild
          className="h-8 text-xs"
        >
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3 mr-1" /> View
          </a>
        </Button>
        <Button
          size="sm"
          onClick={() => setOrderOpen((v) => !v)}
          className="h-8 text-xs bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
        >
          <Plus className="h-3 w-3 mr-1" /> Order
        </Button>
      </div>

      {/* Inline order panel */}
      {orderOpen && (
        <div className="border-t border-border pt-3 mt-1 space-y-3">
          {product.sizes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              No sizes available — link a blank with sizes to order.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {product.sizes.map((size) => {
                  const qty = localQtys[size] ?? 0;
                  return (
                    <div key={size} className="flex flex-col items-center gap-1">
                      <span className="ax-label">{size}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setLocalQtys((p) => ({
                              ...p,
                              [size]: Math.max(0, (p[size] ?? 0) - 1),
                            }))
                          }
                          className="h-6 w-6 rounded border border-border hover:border-accent text-xs flex items-center justify-center"
                          aria-label={`Decrease ${size}`}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={qty}
                          onChange={(e) =>
                            setLocalQtys((p) => ({
                              ...p,
                              [size]: Math.max(0, parseInt(e.target.value || "0", 10) || 0),
                            }))
                          }
                          className={cn(
                            "h-6 w-10 text-center text-xs rounded bg-background border border-border",
                            qty > 0 && "border-accent text-accent",
                          )}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setLocalQtys((p) => ({ ...p, [size]: (p[size] ?? 0) + 1 }))
                          }
                          className="h-6 w-6 rounded border border-border hover:border-accent text-xs flex items-center justify-center"
                          aria-label={`Increase ${size}`}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                size="sm"
                onClick={handleAddToOrder}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
              >
                Add to Order
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
