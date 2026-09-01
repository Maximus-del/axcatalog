import { Move } from "lucide-react";
import { resolveBlankImage } from "@/lib/v2/blank-image";
import { ApproximateBadge, GarmentFrame, PlacedOverlay } from "../GarmentPreview";
import type { PlacedDesign } from "@/lib/v2/placement-geometry";
import type { Blank, Design } from "@/lib/v2/types";

// CREATE MOCKUP — the review screen's previews.
//
// Split out of ConceptBuilder. One arrangement rendered on every selected
// colourway, and front and back rendered separately, because the last chance
// to notice a placement sits 3% low is the screen before saving.

/**
 * EVERY SELECTED COLOURWAY, WITH THE ARRANGEMENT IT ACTUALLY HAS.
 *
 * Each thumbnail renders its OWN placement, not a shared one. A colourway
 * inherits the product's arrangement until somebody adjusts it, and the
 * photography is why that matters: the same hoodie shot in Cream and in Shadow
 * can sit a couple of percent apart in frame, so a chest hit that is right on
 * one reads low on the other. Adjusted colourways carry a dot, because "which
 * of these did I hand-tune" is unanswerable a week later otherwise.
 *
 * Clicking a colourway makes it the one the canvas shows, so a nudge can be
 * judged against the colour that looked wrong instead of the first one picked.
 */
export function ColorwayStrip({
  blank,
  selected,
  master,
  placedFor,
  adjusted,
  designsById,
  surface,
  onMakeMaster,
}: {
  blank: Blank;
  selected: string[];
  master: string | null;
  /** This colourway's own arrangement — its adjustment, or the shared one. */
  placedFor: (colorName: string) => PlacedDesign[];
  /** Colourways hand-tuned away from the shared arrangement. */
  adjusted: string[];
  designsById: Map<string, Design>;
  surface: "front" | "back";
  onMakeMaster: (name: string) => void;
}) {

  return (
    <section className="rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.02] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-semibold text-[hsl(var(--ax-ink))]">
          {selected.length} colourway{selected.length === 1 ? "" : "s"} · {surface}
        </h4>
        <p className="text-[10.5px] text-[hsl(var(--ax-faint))]">
          {adjusted.length > 0
            ? `${adjusted.length} adjusted for ${adjusted.length === 1 ? "its" : "their"} own photograph.`
            : "All sharing one arrangement."}
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {selected.map((name) => {
          const img = resolveBlankImage({ blank, colorName: name, surface });
          const isMaster = name === master;
          const isAdjusted = adjusted.includes(name);
          const onThisSurface = placedFor(name).filter((p) => p.surface === surface);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onMakeMaster(name)}
              title={
                isMaster
                  ? `${name} — the canvas is showing this one`
                  : isAdjusted
                    ? `${name} — adjusted for its own photograph. Click to edit it.`
                    : `${name} — click to adjust on this colour`
              }
              className={`relative w-[104px] shrink-0 overflow-hidden rounded-xl border text-left transition-all ${
                isMaster
                  ? "border-[hsl(var(--ax-accent))] ring-1 ring-[hsl(var(--ax-accent))]"
                  : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.6)]"
              }`}
            >
              <GarmentFrame
                url={img.url}
                alt={name}
                className="aspect-square w-full"
                empty={<span className="text-[9px]">No {surface} photo</span>}
                badge={
                  isAdjusted ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--ax-accent))]"
                      title="Adjusted for this colourway"
                    />
                  ) : img.approximate ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--ax-amber))]"
                      title="Not this colourway's own photograph"
                    />
                  ) : undefined
                }
              >
                <PlacedOverlay placed={onThisSurface} designsById={designsById} />
              </GarmentFrame>
              <div className="truncate px-1.5 py-1 text-[9.5px] text-[hsl(var(--ax-secondary))]">{name}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function StaticMockup({
  image,
  placed,
  designsById,
  blankName,
  onEdit,
}: {
  image: ReturnType<typeof resolveBlankImage>;
  placed: PlacedDesign[];
  designsById: Map<string, Design>;
  blankName: string;
  /**
   * Back to the canvas, on this surface.
   *
   * Reviewing is when you notice the logo sits 3% low, so the fix has to be
   * reachable from the thing you noticed it on. Making the preview itself the
   * way back beats asking the operator to find a step chip in the header.
   */
  onEdit?: () => void;
}) {
  return (
    <GarmentFrame
      url={image.url}
      alt={blankName}
      className="group mx-auto aspect-square w-full max-w-[420px] rounded-2xl border border-[hsl(var(--ax-border))]"
      empty="No photograph for this side yet — the placement is saved regardless."
      badge={
        image.approximate ? (
          <ApproximateBadge>
            {image.source === "blank" ? "Catalogue photo — not this colour" : "Front photo shown"}
          </ApproximateBadge>
        ) : undefined
      }
    >
      <PlacedOverlay placed={placed} designsById={designsById} />

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute inset-0 flex items-end justify-center bg-black/0 pb-4 opacity-0 transition-all hover:bg-black/25 focus:opacity-100 group-hover:opacity-100"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] shadow-lg">
            <Move className="h-3.5 w-3.5" />
            Adjust placement
          </span>
        </button>
      )}
    </GarmentFrame>
  );
}

export function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-[hsl(var(--ax-faint))]">{label}</span>
      <span className="min-w-0 flex-1 truncate">{value}</span>
    </div>
  );
}
