// Quick Order on a gear card. Tap "Quick order" and the card's buttons turn
// into the sizes: tap a size, it's in the cart (tap again for another). The
// arrow on top opens the full panel — every size with − / + and the colours;
// the arrow at the bottom folds it back. No prices on the way: the cart totals
// it once, with the volume discount.
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { draftQty, matchColor, orderGrid, productUnits, quickTargets, type QuickTarget } from "@/lib/portal/cart";
import { useOrderDraft } from "../OrderDraftContext";

export function QuickOrder({
  product,
  lookLabel,
  onClose,
}: {
  product: PortalProduct;
  lookLabel: string | null | undefined;
  onClose: () => void;
}) {
  const { draft, addQty, openCart, unitCount } = useOrderDraft();
  const grid = useMemo(() => orderGrid(product), [product]);
  const [color, setColor] = useState(() => matchColor(product, lookLabel));
  const [open, setOpen] = useState(false);
  // Flip the card to another colourway and the sizes follow it.
  useEffect(() => setColor(matchColor(product, lookLabel)), [product, lookLabel]);
  const targets = useMemo(() => quickTargets(product, color), [product, color]);
  const sized = !(grid.sizes.length === 1 && grid.sizes[0] === "");
  const mine = productUnits(draft, product.id);

  const bump = (t: QuickTarget, delta: number) => {
    if (delta > 0 && !t.available) return;
    addQty(product.id, t.size, delta, t.color);
  };

  return (
    <div className={cn("mw-quick", open && "is-open")} aria-label={`Quick order ${product.title}`}>
      {!open && (
        <button type="button" className="mw-quick-toggle" onClick={() => setOpen(true)} aria-expanded={false} aria-label="Open all sizes">
          <ChevronUp />
        </button>
      )}

      {open && (
        <div className="mw-quick-panel">
          {sized && grid.colors.length > 1 && (
            <div className="mw-quick-colors" role="group" aria-label="Colour">
              {grid.colors.map((c) => (
                <button key={c.key || "one"} type="button" aria-pressed={c.key === color} onClick={() => setColor(c.key)}>
                  {c.hex && <span className="mw-quick-dot" style={{ background: c.hex }} aria-hidden />}
                  {c.name}
                </button>
              ))}
            </div>
          )}
          <ul className="mw-quick-steppers">
            {targets.map((t) => {
              const q = draftQty(draft, product.id, t.size, t.color);
              return (
                <li key={`${t.color}|${t.size}`} className={cn(!t.available && "is-out")}>
                  <span className="mw-quick-label">{t.label}</span>
                  {t.available ? (
                    <span className="mw-quick-stepper">
                      <button type="button" onClick={() => bump(t, -1)} disabled={q === 0} aria-label={`One less ${t.label}`}><Minus /></button>
                      <span aria-live="polite">{q}</span>
                      <button type="button" onClick={() => bump(t, +1)} aria-label={`One more ${t.label}`}><Plus /></button>
                    </span>
                  ) : (
                    <span className="mw-quick-out">Out</span>
                  )}
                </li>
              );
            })}
          </ul>
          <button type="button" className="mw-quick-toggle" onClick={() => setOpen(false)} aria-expanded aria-label="Fold sizes">
            <ChevronDown />
          </button>
        </div>
      )}

      {!open && (
        <div className="mw-quick-row" role="group" aria-label={sized ? "Tap a size to add one" : "Tap to add one"}>
          {targets.map((t) => {
            const q = draftQty(draft, product.id, t.size, t.color);
            return (
              <button
                key={`${t.color}|${t.size}`}
                type="button"
                className={cn("mw-quick-chip", q > 0 && "has-qty")}
                disabled={!t.available}
                onClick={() => bump(t, +1)}
                aria-label={`Add one ${t.label}${q ? ` (${q} in cart)` : ""}`}
                title={!t.available ? "Out of stock" : undefined}
              >
                {t.label}
                {q > 0 && <span className="mw-quick-badge">{q}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="mw-quick-foot">
        <button type="button" className="mw-quick-cart" onClick={openCart} disabled={unitCount === 0}>
          <ShoppingCart />
          {mine > 0 ? `${mine} in cart` : "Tap to add"}
          {unitCount > 0 && <span>· View cart</span>}
        </button>
        <button type="button" className="mw-quick-close" onClick={onClose} aria-label="Done">
          <X />
        </button>
      </div>
    </div>
  );
}
