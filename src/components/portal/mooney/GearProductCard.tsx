import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Copy, Eye, ImageOff, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Product } from "@/lib/portal/api/contract";
import { formatMoney } from "@/lib/portal/api/money";
import { portalLink } from "./navigation";

export function GearProductCard({ product, canOrder, viewingAs, onOrder }: {
  product: Product;
  canOrder: boolean;
  viewingAs: boolean;
  onOrder: () => void;
}) {
  const location = useLocation();
  const [side, setSide] = useState<"front" | "back">("front");
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const image = side === "back" ? product.backImage : product.frontImage;
  const copy = async () => {
    if (!product.publicUrl) return;
    try { await navigator.clipboard.writeText(product.publicUrl); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy the link. Try again."); }
  };
  const orderReason = viewingAs ? "View-as is read-only. Orders are disabled." : !canOrder ? "Not available to order" : "Order";
  return <article className="mw-gear-card" aria-label={product.title}>
    <div className="mw-gear-image">
      {image && !failedImages.includes(image) ? <img src={image} alt={`${product.title} — ${side}`} loading="lazy" onError={() => setFailedImages((previous) => [...previous, image])} /> : <div className="mw-gear-placeholder"><ImageOff aria-hidden="true" /><span>Image unavailable</span></div>}
      {product.backImage && <div className="mw-gear-sides" role="group" aria-label={`Image view for ${product.title}`}>
        {(["front", "back"] as const).map((view) => <Button key={view} variant="ghost" aria-pressed={side === view} onClick={() => setSide(view)}>{view === "front" ? "Front" : "Back"}</Button>)}
      </div>}
    </div>
    <h3>{product.title}</h3>
    <p className="mw-gear-price">{formatMoney(product.unitPrice, { cents: true })} / unit</p>
    {product.lifecycle === "archive" && <p className="mw-gear-archive-note">Reprinted from the design file</p>}
    <div className="mw-gear-card-actions">
      <Tooltip><TooltipTrigger asChild><span tabIndex={product.publicUrl ? undefined : 0}><Button variant="outline" onClick={copy} disabled={!product.publicUrl} aria-label={`Copy link for ${product.title}`}><Copy /><span>Copy</span></Button></span></TooltipTrigger><TooltipContent>{product.publicUrl ? "Copy store link" : "Not on the store yet"}</TooltipContent></Tooltip>
      <Button variant="outline" asChild><Link to={portalLink(`/portal/products/${encodeURIComponent(product.id)}`, location.search)} aria-label={`View ${product.title}`}><Eye /><span>View</span></Link></Button>
      <Tooltip><TooltipTrigger asChild><span tabIndex={!canOrder || viewingAs ? 0 : undefined}><Button variant="outline" className="mw-gear-order" onClick={onOrder} disabled={!canOrder || viewingAs} aria-label={`Order ${product.title}`}><ShoppingCart /><span>Order</span></Button></span></TooltipTrigger><TooltipContent>{orderReason}</TooltipContent></Tooltip>
    </div>
  </article>;
}