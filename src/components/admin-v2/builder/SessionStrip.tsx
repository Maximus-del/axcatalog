import { Check, Plus, TriangleAlert, X } from "lucide-react";
import { resolveBlankImage } from "@/lib/v2/blank-image";
import { GarmentFrame, PlacedOverlay } from "../GarmentPreview";
import { isFullySaved, needsPlacement, orderedColors, type StudioProduct } from "@/lib/v2/studio-session";
import type { Blank, Design } from "@/lib/v2/types";

// CURRENT MOCKUPS — the products in this session, as tabs.
//
// The strip is the studio's primary navigation: click a product and the whole
// screen above becomes that product. Nothing is saved, nothing is discarded,
// and the step does not move — it is a tab switch, which is the difference
// between working through an assortment and running the wizard six times.
//
// Each card answers the three things you need before clicking: what garment,
// which colourways, and whether it is ready. "Needs setup" is the important
// one — it is the only state standing between the session and being saveable.

export default function SessionStrip({
  products,
  activeKey,
  blanksById,
  designsById,
  onOpen,
  onRemove,
  onAdd,
}: {
  products: StudioProduct[];
  activeKey: string | null;
  blanksById: Map<string, Blank>;
  designsById: Map<string, Design>;
  onOpen: (key: string) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="border-t border-[hsl(var(--ax-line))] px-4 py-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ax-secondary))]">
          Current mockups
        </h4>
        <span className="text-[10.5px] tabular-nums text-[hsl(var(--ax-faint))]">
          {products.length} product{products.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-1">
        {products.map((product) => {
          const blank = blanksById.get(product.blankId) ?? null;
          const colors = orderedColors(product);
          const image = resolveBlankImage({ blank, colorName: product.masterColor, surface: "front" });
          const unplaced = needsPlacement(product);
          const saved = !unplaced && isFullySaved(product);
          const isActive = product.key === activeKey;

          return (
            <div key={product.key} className="group relative shrink-0">
              <button
                type="button"
                onClick={() => onOpen(product.key)}
                title={isActive ? "Showing this product" : `Switch the studio to ${blank?.name ?? "this product"}`}
                className={`flex w-[228px] gap-2.5 rounded-xl border p-2 text-left transition-all ${
                  isActive
                    ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.07)]"
                    : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.55)] hover:bg-white/[0.02]"
                }`}
              >
                <GarmentFrame
                  url={image.url}
                  alt={blank?.name ?? "Garment"}
                  className="h-14 w-14 shrink-0 rounded-lg bg-white"
                  empty={<span className="text-[8px]">No photo</span>}
                >
                  <PlacedOverlay
                    placed={product.placed.filter((p) => p.surface === "front")}
                    designsById={designsById}
                  />
                </GarmentFrame>

                <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                  <span className="truncate text-[11.5px] font-semibold uppercase tracking-wide text-[hsl(var(--ax-ink))]">
                    {blank?.name ?? "Garment"}
                  </span>
                  <span className="truncate text-[10.5px] text-[hsl(var(--ax-faint))]">
                    {colors.length > 0 ? colors.join(" · ") : "No color selected"}
                  </span>
                  <span className="flex items-center gap-1 text-[10px]">
                    <span className="tabular-nums text-[hsl(var(--ax-secondary))]">
                      {colors.length || "0"} colorway{colors.length === 1 ? "" : "s"}
                    </span>
                    {unplaced ? (
                      <span className="flex items-center gap-0.5 font-medium text-[hsl(var(--ax-amber))]">
                        <TriangleAlert className="h-2.5 w-2.5" /> Needs setup
                      </span>
                    ) : (
                      <span
                        className="flex items-center gap-0.5 font-medium text-[hsl(var(--ax-accent))]"
                        title={saved ? "Already saved to the library" : "Placed and ready to save"}
                      >
                        <Check className="h-2.5 w-2.5" /> {saved ? "Saved" : "Ready"}
                      </span>
                    )}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => onRemove(product.key)}
                aria-label={`Remove ${blank?.name ?? "this product"} from the session`}
                title="Remove from this session"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] text-[hsl(var(--ax-faint))] opacity-0 transition-opacity hover:text-[hsl(var(--ax-red))] focus:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAdd}
          className="flex w-[148px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[hsl(var(--ax-border))] py-3 text-[11.5px] font-medium text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-ink))]"
        >
          <Plus className="h-4 w-4" />
          Add product
        </button>
      </div>
    </section>
  );
}
