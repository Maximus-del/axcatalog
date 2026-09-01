import { Check, Plus, X } from "lucide-react";
import { resolveBlankImage } from "@/lib/v2/blank-image";
import { GarmentFrame, PlacedOverlay } from "../GarmentPreview";
import { isFullySaved, needsPlacement, orderedColors, type StudioProduct } from "@/lib/v2/studio-session";
import type { Blank, Design } from "@/lib/v2/types";

// CURRENT MOCKUPS — the session, as navigation.
//
// The studio holds several products at once and each one owns its placement.
// This strip is how you get back to one: small tiles, not cards, because they
// are a way of moving around rather than a thing to read.
//
// A product with no arrangement yet says so on its face. That is the single
// most useful fact on this strip — it is the one thing standing between the
// session and being able to save it.

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
    <section className="border-t border-[hsl(var(--ax-line))] px-4 py-2.5">
      <div className="mb-1.5 flex items-baseline gap-2">
        <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
          Current mockups
        </h4>
        <span className="text-[10.5px] tabular-nums text-[hsl(var(--ax-faint))]">
          {products.length} product{products.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {products.map((product) => {
          const blank = blanksById.get(product.blankId) ?? null;
          const colors = orderedColors(product);
          const image = resolveBlankImage({ blank, colorName: product.masterColor, surface: "front" });
          const unplaced = needsPlacement(product);
          const done = !unplaced && isFullySaved(product);
          const isActive = product.key === activeKey;

          return (
            <div key={product.key} className="relative shrink-0">
              <button
                type="button"
                onClick={() => onOpen(product.key)}
                title={`${blank?.name ?? "Garment"} — ${colors.length || "no"} colourway${colors.length === 1 ? "" : "s"}`}
                className={`flex w-[168px] items-center gap-2 rounded-xl border p-1.5 text-left transition-all ${
                  isActive
                    ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]"
                    : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.6)]"
                }`}
              >
                <GarmentFrame
                  url={image.url}
                  alt={blank?.name ?? "Garment"}
                  className="h-11 w-11 shrink-0 rounded-lg bg-white/[0.03]"
                  empty={<span className="text-[8px]">No photo</span>}
                >
                  <PlacedOverlay
                    placed={product.placed.filter((p) => p.surface === "front")}
                    designsById={designsById}
                  />
                </GarmentFrame>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-medium text-[hsl(var(--ax-ink))]">
                    {blank?.name ?? "Garment"}
                  </span>
                  {unplaced ? (
                    <span className="block truncate text-[10.5px] font-medium text-[hsl(var(--ax-amber))]">
                      Place artwork
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10.5px] text-[hsl(var(--ax-faint))]">
                      {done && (
                        <Check
                          className="h-3 w-3 shrink-0 text-[hsl(var(--ax-accent))]"
                          aria-label="Saved"
                        />
                      )}
                      <span className="min-w-0 truncate">
                        {colors.length > 0 ? colors.join(", ") : "No colour"}
                      </span>
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onRemove(product.key)}
                aria-label={`Remove ${blank?.name ?? "this product"} from the session`}
                title="Remove from this session"
                className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] p-0.5 text-[hsl(var(--ax-faint))] opacity-0 transition-opacity hover:text-[hsl(var(--ax-red))] focus:opacity-100 group-hover:opacity-100 [div:hover>&]:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAdd}
          className="flex w-[132px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-[hsl(var(--ax-border))] py-2 text-[11.5px] font-medium text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-ink))]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add product
        </button>
      </div>
    </section>
  );
}
