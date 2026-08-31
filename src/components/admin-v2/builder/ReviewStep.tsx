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
 * EVERY SELECTED COLOURWAY, WITH THE ARRANGEMENT ALREADY ON IT.
 *
 * There is no "apply to all" button here, and its absence is the design rather
 * than an omission. Placement geometry is stored as percentages of the garment
 * box and is shared by the whole variant set, so a colour added after the
 * artwork was positioned is already positioned — there is nothing for a button
 * to do. Rather than ship a control that fires and changes nothing, the strip
 * shows the propagation happening: drag the logo on the canvas and all thirteen
 * thumbnails move with it.
 *
 * Clicking a colourway makes it the one the canvas shows, so a nudge can be
 * judged against the colour that looked wrong instead of the first one picked.
 */
export function ColorwayStrip({
  blank,
  selected,
  master,
  placed,
  designsById,
  surface,
  onMakeMaster,
}: {
  blank: Blank;
  selected: string[];
  master: string | null;
  placed: PlacedDesign[];
  designsById: Map<string, Design>;
  surface: "front" | "back";
  onMakeMaster: (name: string) => void;
}) {
  const onThisSurface = placed.filter((p) => p.surface === surface);

  return (
    <section className="rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.02] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-semibold text-[hsl(var(--ax-ink))]">
          {selected.length} colourway{selected.length === 1 ? "" : "s"} · {surface}
        </h4>
        <p className="text-[10.5px] text-[hsl(var(--ax-faint))]">
          One arrangement, every colour. Worth a look before saving — a placement that sits right on one garment can
          read slightly differently on another.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {selected.map((name) => {
          const img = resolveBlankImage({ blank, colorName: name, surface });
          const isMaster = name === master;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onMakeMaster(name)}
              title={isMaster ? `${name} — the canvas is showing this one` : `${name} — click to adjust on this colour`}
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
                  img.approximate ? (
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
