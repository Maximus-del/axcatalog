// A product at a glance, without leaving the page: one front picture, and the
// back when the product is printed front and back. Model shots and extra
// colourways are deliberately left out — this is "what is on it", not a gallery.
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import type { PrintSides } from "@/lib/v2/pricing-sheet";

export interface PreviewProduct {
  title: string;
  imageUrl?: string | null;
  backImageUrl?: string | null;
  sides?: PrintSides | null;
  subtitle?: string | null;
}

/** The small + in a product tile's top-right corner. Stops the click reaching the tile. */
export function PreviewPlus({ product, className = "" }: { product: PreviewProduct; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={`Preview ${product.title}`}
        title="See front & back"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
        className={`absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] text-[hsl(var(--ax-ink))] shadow-sm transition-colors hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-accent))] ${className}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </span>
      {open && <ProductPreviewDialog product={product} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ProductPreviewDialog({ product, onClose }: { product: PreviewProduct; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Front only for front-only products; front + back when it has a back print.
  const showBack = product.sides !== "front" && !!product.backImageUrl;
  const sides = [
    { label: "Front", url: product.imageUrl ?? null },
    ...(showBack ? [{ label: "Back", url: product.backImageUrl ?? null }] : []),
  ];
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div role="dialog" aria-modal="true" aria-label={product.title} className="w-full max-w-3xl rounded-2xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] p-4 shadow-xl">
        <div className="mb-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold">{product.title}</h2>
            {product.subtitle && <p className="text-[11.5px] text-[hsl(var(--ax-faint))]">{product.subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="rounded-full border border-[hsl(var(--ax-border))] p-1.5 text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className={`grid gap-3 ${sides.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {sides.map((s) => (
            <figure key={s.label} className="min-w-0">
              <div className={`overflow-hidden rounded-xl bg-[hsl(var(--ax-ink)/0.04)] ${sides.length > 1 ? "aspect-square" : "mx-auto aspect-square max-w-md"}`}>
                {s.url ? (
                  <img src={s.url} alt={`${product.title} — ${s.label}`} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[12px] text-[hsl(var(--ax-faint))]">No {s.label.toLowerCase()} picture</div>
                )}
              </div>
              <figcaption className="mt-1.5 text-center text-[10.5px] uppercase tracking-[0.14em] text-[hsl(var(--ax-faint))]">{s.label}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
