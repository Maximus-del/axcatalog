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

/**
 * The artwork rail beside the canvas.
 *
 * Folders are the organising unit here exactly as they are on the shelf, so a
 * set of variations stays together while the operator tries them one after
 * another. Tiles are HTML5 drag sources — drag onto the garment to place at a
 * point, or click to drop into the centre zone for the surface being edited.
 */

/**
 * Colourway multi-select for building a run.
 *
 * The base colour is shown but locked — it is already in the batch, and letting
 * it be "deselected" would imply the mockup on screen could be excluded from
 * its own save.
 */
export function ColorChips({
  blank,
  selected,
  baseColorName,
  onToggle,
}: {
  blank: Blank;
  selected: string[];
  baseColorName: string | null;
  onToggle: (name: string) => void;
}) {
  const available = blank.colors.filter((c) => c.available);
  if (available.length === 0) {
    return <p className="text-[12px] text-[hsl(var(--ax-faint))]">This blank has no colour records.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {available.map((c) => {
        const isBase = c.name === baseColorName;
        const on = isBase || selected.includes(c.name);
        return (
          <button
            key={c.id}
            type="button"
            disabled={isBase}
            onClick={() => onToggle(c.name)}
            title={isBase ? `${c.name} — the colourway you built` : c.name}
            className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] transition-colors ${
              on
                ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-accent))]"
                : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
            } ${isBase ? "opacity-70" : ""}`}
          >
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/25"
              style={{ background: swatchFor(c) }}
            />
            {c.name}
            {isBase && <span className="text-[9px] uppercase tracking-wider opacity-70">base</span>}
            {!c.imageUrl && <ImageOff className="h-2.5 w-2.5 opacity-60" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** One other blank in the run, with its own colour selection once ticked. */
export function OtherBlankRow({
  blank,
  selected,
  colors,
  onToggle,
  onToggleColor,
}: {
  blank: Blank;
  selected: boolean;
  colors: string[];
  onToggle: () => void;
  onToggleColor: (name: string) => void;
}) {
  const hero = resolveBlankImage({ blank });
  return (
    <div
      className={`rounded-xl border p-2 transition-colors ${
        selected ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.05)]" : "border-[hsl(var(--ax-border))]"
      }`}
    >
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 text-left">
        <AssetImage
          url={hero.url}
          alt={blank.name}
          className="h-9 w-9 shrink-0 rounded-lg bg-white/[0.04]"
          fit="contain"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium">{blank.name}</span>
          <span className="block truncate text-[10px] text-[hsl(var(--ax-faint))]">
            {[blank.brand, blank.styleNumber].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
        <span
          className={`h-4 w-4 shrink-0 rounded-md border ${
            selected ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))]"
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5 text-[hsl(var(--ax-on-accent))]" />}
        </span>
      </button>

      {selected && (
        <div className="mt-2 border-t border-[hsl(var(--ax-accent)/0.2)] pt-2">
          <div className="mb-1 text-[10px] text-[hsl(var(--ax-faint))]">
            {colors.length === 0 ? "No colour chosen — saves one mockup" : `${colors.length} colourway${colors.length === 1 ? "" : "s"}`}
          </div>
          <div className="flex flex-wrap gap-1">
            {blank.colors
              .filter((c) => c.available)
              .slice(0, 10)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onToggleColor(c.name)}
                  title={c.name}
                  className={`h-4 w-4 rounded-full border transition-transform ${
                    colors.includes(c.name)
                      ? "border-[hsl(var(--ax-accent))] scale-110 ring-1 ring-[hsl(var(--ax-accent))]"
                      : "border-black/25 hover:scale-110"
                  }`}
                  style={{ background: swatchFor(c) }}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
