import { Check, ImageOff } from "lucide-react";
import { photoCoverage, resolveBlankImage, swatchFor } from "@/lib/v2/blank-image";
import { AssetImage } from "../primitives";
import type { Blank } from "@/lib/v2/types";

// CREATE MOCKUP — steps 2 and 3, choosing the garment and the colourway.
//
// Split out of ConceptBuilder. Blanks are shared AX infrastructure — one
// canonical record per garment, never a per-athlete duplicate — so these lead
// with photography and the colour range, which is what an operator is actually
// choosing between.

/**
 * Step 2. Blanks are shared AX infrastructure — one canonical record per
 * garment, never a per-athlete duplicate — so the card leads with photography
 * and the colour range, which is what an operator is actually choosing between.
 */
export function BlankCard({ blank, price }: { blank: Blank; price: string }) {
  const hero = resolveBlankImage({ blank });
  const coverage = photoCoverage(blank);
  const strip = blank.colors.filter((c) => c.available).slice(0, 9);

  return (
    <>
      <AssetImage url={hero.url} alt={blank.name} className="aspect-square w-full bg-white/[0.03]" fit="contain" />
      <div className="space-y-1.5 p-2.5">
        <div className="truncate text-[12px] font-medium">{blank.name}</div>
        <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
          {[blank.brand, blank.styleNumber].filter(Boolean).join(" · ") || "—"}
        </div>
        <div className="flex items-center gap-0.5">
          {strip.map((c) => (
            <span
              key={c.id}
              title={c.name}
              className="h-3 w-3 rounded-full border border-black/25"
              style={{ background: swatchFor(c) }}
            />
          ))}
          {coverage.total > strip.length && (
            <span className="ml-1 text-[10px] tabular-nums text-[hsl(var(--ax-faint))]">
              +{coverage.total - strip.length}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-medium text-[hsl(var(--ax-accent))]">{price}</span>
          <span
            className="text-[hsl(var(--ax-faint))]"
            title={`${coverage.withPhoto} of ${coverage.total} available colours have photography`}
          >
            {coverage.withPhoto}/{coverage.total} shot
          </span>
        </div>
      </div>
    </>
  );
}

export function ColorStepHeader({ blank }: { blank: Blank }) {
  const coverage = photoCoverage(blank);
  const unshot = coverage.total - coverage.withPhoto;
  return (
    <div className="mb-3 space-y-1">
      <p className="text-[12px] text-[hsl(var(--ax-faint))]">
        {coverage.total} available colour{coverage.total === 1 ? "" : "s"} on {blank.name}.
      </p>
      {unshot > 0 && (
        <p className="text-[11px] text-[hsl(var(--ax-amber))]">
          {unshot} {unshot === 1 ? "has" : "have"} no photography yet and show as a flat swatch — still selectable, but
          the mockup preview will use the catalogue shot.
        </p>
      )}
    </div>
  );
}
