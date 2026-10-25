import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, Eye, Link2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Product } from "@/lib/portal/api/contract";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { formatMoney } from "@/lib/portal/api/money";
import { gearLooks, type GearLook } from "@/lib/portal/gear-looks";
import { buildShareUrl } from "../ProductCard";
import { imagesForColor } from "./GearProductView";
import { portalLink } from "./navigation";
import { QuickOrder } from "./QuickOrder";

/** Every colourway this card can show. Empty = nothing to show, and My Gear leaves the product out. */
export function looksFor(product: Product, source: PortalProduct | undefined): GearLook[] {
  const looks = source ? gearLooks(source, imagesForColor as never) : [];
  if (looks.length) return looks;
  return product.frontImage ? [{ label: "", front: product.frontImage, back: product.backImage }] : [];
}

/**
 * One product, big: flip through its colourways (arrows or the swatch strip),
 * Front / Back, then Quick order (sizes straight into the cart), View product
 * or Copy link. No download — the files stay hosted by AX; the link is what
 * gets shared.
 */
export function GearProductCard({
  product,
  source,
  canOrder,
  viewingAs,
  onOrder,
}: {
  product: Product;
  source: PortalProduct | undefined;
  canOrder: boolean;
  viewingAs: boolean;
  onOrder: () => void;
}) {
  const location = useLocation();
  const looks = useMemo(() => looksFor(product, source), [product, source]);
  const [at, setAt] = useState(0);
  const [side, setSide] = useState<"front" | "back">("front");
  const [failed, setFailed] = useState<string[]>([]);
  const [quick, setQuick] = useState(false);
  const look = looks[Math.min(at, looks.length - 1)];
  const image = (side === "back" && look?.back) || look?.front || null;
  const shareUrl = product.publicUrl ?? (source ? buildShareUrl(source) : null);

  const go = (dir: -1 | 1) => {
    setAt((i) => (i + dir + looks.length) % looks.length);
    setFailed([]);
  };
  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link. Try again.");
    }
  };

  return (
    <article className="mw-content-card mw-gear-show" aria-label={product.title}>
      <div className="mw-gear-show-image">
        {image && !failed.includes(image) ? (
          <img src={image} alt={`${product.title}${look?.label ? ` — ${look.label}` : ""}, ${side}`} loading="lazy" onError={() => setFailed((f) => [...f, image])} />
        ) : (
          <div className="mw-gear-placeholder">Picture coming</div>
        )}
        {looks.length > 1 && (
          <>
            <button type="button" className="mw-gear-arrow" data-dir="prev" aria-label="Previous colour" onClick={() => go(-1)}>
              <ChevronLeft />
            </button>
            <button type="button" className="mw-gear-arrow" data-dir="next" aria-label="Next colour" onClick={() => go(1)}>
              <ChevronRight />
            </button>
          </>
        )}
        {look?.back && (
          <div className="mw-gear-sides" role="group" aria-label={`Side of ${product.title}`}>
            {(["front", "back"] as const).map((v) => (
              <Button key={v} variant="ghost" aria-pressed={side === v} onClick={() => setSide(v)}>
                {v === "front" ? "Front" : "Back"}
              </Button>
            ))}
          </div>
        )}
      </div>

      {looks.length > 1 && (
        <div className="mw-gear-swatches" role="group" aria-label="Colourways">
          {looks.map((l, i) => (
            <button
              key={`${l.label}-${i}`}
              type="button"
              aria-pressed={i === at}
              aria-label={l.label || `Colour ${i + 1}`}
              title={l.label || undefined}
              onClick={() => {
                setAt(i);
                setFailed([]);
              }}
            >
              {l.front ? <img src={l.front} alt="" loading="lazy" /> : null}
            </button>
          ))}
        </div>
      )}

      <div className="mw-content-body">
        <div className="mw-content-kind">
          {look?.label ? look.label : " "}
          {looks.length > 1 && <span className="mw-gear-count-pill">{looks.length} colourways</span>}
        </div>
        <h3>{product.title}</h3>
        <p className="mw-gear-price">
          {formatMoney(product.unitPrice, { cents: true })} <span>/ unit</span>
          {product.lifecycle === "archive" && <span className="mw-gear-archive-note"> · reprinted from the design file</span>}
        </p>
        {quick && source ? (
          <QuickOrder product={source} lookLabel={look?.label} onClose={() => setQuick(false)} />
        ) : (
          <div className="mw-content-actions mw-gear-show-actions">
            <Button
              variant="outline"
              className="mw-pill mw-gear-order"
              onClick={() => (source ? setQuick(true) : onOrder())}
              disabled={!canOrder || viewingAs}
              title={viewingAs ? "View-as is read-only. Orders are disabled." : !canOrder ? "Not available to order" : undefined}
            >
              <Zap />
              Quick order
            </Button>
            <Button variant="outline" className="mw-pill" asChild>
              <Link to={portalLink(`/portal/products/${encodeURIComponent(product.id)}`, location.search)}>
                <Eye />
                View product
              </Link>
            </Button>
            <Button variant="outline" className="mw-pill mw-gear-copy" onClick={copy} disabled={!shareUrl} title={shareUrl ? "Copy store link" : "Not on the store yet"} aria-label="Copy store link">
              <Link2 />
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
