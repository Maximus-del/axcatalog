import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Copy, ExternalLink, ImageOff, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { PortalImage, PortalProduct } from "@/hooks/usePortalProducts";
import { usePortalScope } from "@/hooks/usePortalApi";
import { formatMoney } from "@/lib/portal/api/money";
import { sanitizeDescriptionHtml } from "@/lib/portal/sanitize-html";
import { ProductOrderDialog } from "@/components/portal/ProductOrderDialog";
import { buildShareUrl } from "@/components/portal/ProductCard";
import { isOrderable, sheetUnitPrice } from "@/lib/portal/api/products";
import { portalLink } from "./navigation";

/** Images linked to a colour through its variants; empty when none are linked. */
export function imagesForColor(product: PortalProduct, color: string | null): PortalImage[] {
  if (!color) return [];
  const ids = new Set(
    product.variants
      .filter((v) => v.color?.toLowerCase() === color.toLowerCase() && v.shopifyImageId)
      .map((v) => v.shopifyImageId as string),
  );
  const linked = product.images.filter((img) => img.shopifyImageId && ids.has(img.shopifyImageId));
  if (linked.length) return linked;
  // Library products: each picture names its colourway (Drive metadata).
  return product.images.filter((img) => img.color?.toLowerCase() === color.toLowerCase());
}

export function GearProductView({ product, description }: { product: PortalProduct; description: string | null }) {
  const location = useLocation();
  const { viewingAs } = usePortalScope();
  const [color, setColor] = useState<string | null>(null);
  const [side, setSide] = useState<"front" | "back">("front");
  const [idx, setIdx] = useState(0);
  const [orderOpen, setOrderOpen] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);

  const gallery = useMemo(() => {
    const linked = imagesForColor(product, color);
    return linked.length ? linked : product.images;
  }, [product, color]);
  const front = gallery.find((i) => i.portalView === "front") ?? gallery[0];
  const back = gallery.find((i) => i.portalView === "back") ?? (gallery.length > 1 ? gallery.find((i) => i !== front) : undefined);
  const hero = idx > 0 ? gallery[idx] : side === "back" && back ? back : front;
  // The bulk-sheet price: what My Gear shows and what the order is charged.
  const unit = sheetUnitPrice(product).athleteUnit;
  const orderable = isOrderable(product);
  const shareUrl = buildShareUrl(product);

  const pickColor = (name: string) => { setColor((c) => (c === name ? null : name)); setIdx(0); setSide("front"); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); toast.success("Link copied"); }
    catch { toast.error("Couldn't copy the link. Try again."); }
  };

  return <main className="mw-pview">
    <Link className="mw-pview-back" to={portalLink("/portal/products", location.search)}><ArrowLeft aria-hidden="true" /> Back to My Gear</Link>
    <div className="mw-pview-grid">
      <section className="mw-pview-media" aria-label="Product photos">
        <div className="mw-pview-hero">
          {hero && !failed.includes(hero.url)
            ? <img src={hero.url} alt={`${product.title}${color ? ` — ${color}` : ""}`} onError={() => setFailed((f) => [...f, hero.url])} />
            : <div className="mw-gear-placeholder"><ImageOff aria-hidden="true" /><span>Image unavailable</span></div>}
          {back && <div className="mw-gear-sides" role="group" aria-label="Image view">
            {(["front", "back"] as const).map((v) => <Button key={v} variant="ghost" aria-pressed={idx === 0 && side === v} onClick={() => { setSide(v); setIdx(0); }}>{v === "front" ? "Front" : "Back"}</Button>)}
          </div>}
        </div>
        {gallery.length > 2 && <div className="mw-pview-thumbs">
          {gallery.map((img, i) => <button key={img.id} type="button" aria-label={`View photo ${i + 1}`} aria-pressed={hero === img} onClick={() => setIdx(i)}>
            <img src={img.url} alt="" loading="lazy" />
          </button>)}
        </div>}
      </section>
      <section className="mw-pview-info">
        <h1 className="mw-heading">{product.title}</h1>
        <p className="mw-pview-price">{formatMoney(unit != null ? { amountMinor: Math.round(unit * 100), currency: "USD" } : null, { cents: true })} <span>/ unit · volume discounts from 50 units</span></p>
        {product.status === "archived" && <p className="mw-gear-archive-note">Reprinted from the design file</p>}
        {product.colors.length > 0 && <div className="mw-pview-colors">
          <h2>Color{color ? `: ${color}` : ""}</h2>
          <div role="group" aria-label="Colors">
            {product.colors.map((c) => <button key={c.name} type="button" className="mw-swatch" aria-pressed={color === c.name} onClick={() => pickColor(c.name)}>
              <span className="mw-swatch-dot" style={c.hex ? { background: c.hex } : undefined} aria-hidden="true" />
              <span className="mw-swatch-name">{c.name}</span>
            </button>)}
          </div>
        </div>}
        {description && <div className="mw-pview-desc" dangerouslySetInnerHTML={{ __html: sanitizeDescriptionHtml(description) }} />}
        <div className="mw-pview-actions">
          <Button className="mw-pview-order" onClick={() => setOrderOpen(true)} disabled={viewingAs || !orderable} title={!orderable ? "Not available to order right now" : undefined}><ShoppingCart /> Order</Button>
          <Button variant="outline" onClick={copy}><Copy /> Copy link</Button>
          {product.shopify_handle && <Button variant="outline" asChild><a href={shareUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> View on Shopify</a></Button>}
        </div>
        {viewingAs && <p className="mw-pview-note">View-as is read-only. Orders are disabled.</p>}
      </section>
    </div>
    <ProductOrderDialog product={product} open={orderOpen} onOpenChange={setOrderOpen} />
  </main>;
}
