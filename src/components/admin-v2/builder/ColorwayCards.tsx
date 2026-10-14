import { useState } from "react";
import { Check, MoreHorizontal, Move, Plus, RotateCcw, X } from "lucide-react";
import { resolveBlankImage } from "@/lib/v2/blank-image";
import { GarmentFrame, PlacedOverlay } from "../GarmentPreview";
import type { PlacedDesign } from "@/lib/v2/placement-geometry";
import type { Blank, Design } from "@/lib/v2/types";

// COLORWAYS — the mockups, at a size you can actually judge.
//
// This was a row of pills. A pill tells you a colour is ticked; it does not
// tell you what the mockup LOOKS like, which is the only question worth asking
// on a review screen. Each card is now the real composite: that colourway's own
// photograph, with that colourway's own placement drawn on it.
//
// "Its own placement" is load-bearing. Colourways inherit the product's
// arrangement until one is hand-tuned — photography is not pixel-aligned, so a
// chest hit that is right on Shadow can read low on Cream — and these cards are
// where that difference becomes visible instead of theoretical.

export interface ColorwayCardsProps {
  blank: Blank;
  /** Selected colourways, master first. */
  selected: string[];
  master: string | null;
  /** This colourway's own arrangement — its adjustment, or the shared one. */
  placedFor: (colorName: string) => PlacedDesign[];
  adjusted: string[];
  designsById: Map<string, Design>;
  surface: "front" | "back";
  /** Make this the colourway the big canvas is showing. */
  onSelect: (name: string) => void;
  /** Show it on the canvas AND go to the placement step. */
  onEditPlacement: (name: string) => void;
  onRemove: (name: string) => void;
  onResetToShared: (name: string) => void;
  onToggle: (name: string) => void;
  /** Colours of this blank that are not in the run yet. */
  available: Array<{ id: string; name: string; hex: string | null; imageUrl: string | null }>;
}

export default function ColorwayCards({
  blank,
  selected,
  master,
  placedFor,
  adjusted,
  designsById,
  surface,
  onSelect,
  onEditPlacement,
  onRemove,
  onResetToShared,
  onToggle,
  available,
}: ColorwayCardsProps) {
  const [adding, setAdding] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const unpicked = available.filter((c) => !selected.includes(c.name));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {selected.map((name) => {
        const image = resolveBlankImage({ blank, colorName: name, surface });
        const isMaster = name === master;
        const isAdjusted = adjusted.includes(name);

        return (
          <div
            key={name}
            className={`overflow-hidden rounded-2xl border transition-all ${
              isMaster
                ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.05)]"
                : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.5)]"
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[12.5px] font-semibold text-[hsl(var(--ax-ink))]">{name}</span>
                {isMaster && (
                  <span
                    title="The colourway the canvas is showing, and the one the shared placement was made on"
                    className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] ring-1 ring-inset ring-[hsl(var(--ax-border))]"
                  >
                    Base
                  </span>
                )}
                {isAdjusted && (
                  <span
                    title="Hand-tuned for this colourway's photograph"
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[hsl(var(--ax-accent))]"
                  />
                )}
              </div>
              <Check className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-accent))]" aria-label="In this run" />
            </div>

            {/*
              The whole picture is the button. Clicking a colourway puts it on
              the big canvas — the fastest way to compare three garments is to
              flick between them full size.
            */}
            <button
              type="button"
              onClick={() => onSelect(name)}
              title={isMaster ? `${name} is on the canvas` : `Show ${name} on the canvas`}
              className="block w-full px-3 pb-2 pt-2"
            >
              <GarmentFrame
                url={image.url}
                alt={`${blank.name} ${name}`}
                className="aspect-square w-full rounded-xl bg-white"
                empty={<span className="text-[10px]">No {surface} photograph</span>}
                badge={
                  image.approximate ? (
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--ax-amber))]"
                      title="Not this colourway's own photograph"
                    />
                  ) : undefined
                }
              >
                <PlacedOverlay
                  placed={placedFor(name).filter((p) => p.surface === surface)}
                  designsById={designsById}
                />
              </GarmentFrame>
            </button>

            <div className="relative flex items-center gap-1.5 px-3 pb-3">
              <button
                type="button"
                onClick={() => onEditPlacement(name)}
                className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[hsl(var(--ax-border))] px-2 py-1.5 text-[11.5px] text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent)/0.6)] hover:text-[hsl(var(--ax-ink))]"
              >
                <Move className="h-3 w-3 shrink-0" />
                Edit placement
              </button>
              <button
                type="button"
                onClick={() => setMenuFor(menuFor === name ? null : name)}
                aria-label={`More for ${name}`}
                className="shrink-0 rounded-lg border border-[hsl(var(--ax-border))] px-2 py-1.5 text-[hsl(var(--ax-faint))] transition-colors hover:text-[hsl(var(--ax-ink))]"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>

              {menuFor === name && (
                <div className="absolute bottom-full right-3 z-20 mb-1 w-52 overflow-hidden rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-1 shadow-xl">
                  {isAdjusted && (
                    <MenuItem
                      icon={RotateCcw}
                      onClick={() => {
                        onResetToShared(name);
                        setMenuFor(null);
                      }}
                    >
                      Reset to shared placement
                    </MenuItem>
                  )}
                  {!isMaster && (
                    <MenuItem
                      icon={X}
                      tone="var(--ax-red)"
                      onClick={() => {
                        onRemove(name);
                        setMenuFor(null);
                      }}
                    >
                      Remove from this run
                    </MenuItem>
                  )}
                  {isMaster && (
                    <p className="px-3 py-2 text-[11px] leading-snug text-[hsl(var(--ax-faint))]">
                      This is the colourway the placement was made on. Show another one to remove this.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Add colourway — the tile that keeps the grid honest about what is left. */}
      <div className="rounded-2xl border border-dashed border-[hsl(var(--ax-border))]">
        {adding && unpicked.length > 0 ? (
          <div className="max-h-[340px] overflow-y-auto p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                Add colourway
              </span>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="text-[11px] text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]"
              >
                Done
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {unpicked.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onToggle(c.name)}
                  className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--ax-border))] px-2 py-1.5 text-left text-[11px] text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-ink))]"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-white/20"
                    style={{ background: c.hex ?? "hsl(var(--ax-card))" }}
                  />
                  <span className="min-w-0 truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={unpicked.length === 0}
            className="flex h-full min-h-[220px] w-full flex-col items-center justify-center gap-1.5 text-[12px] text-[hsl(var(--ax-faint))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {unpicked.length === 0 ? "Every colour is in the run" : "Add colorway"}
          </button>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  tone,
}: {
  icon: typeof RotateCcw;
  children: React.ReactNode;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[hsl(var(--ax-secondary))] hover:bg-white/5 hover:text-[hsl(var(--ax-ink))]"
      style={tone ? { color: `hsl(${tone})` } : undefined}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {children}
    </button>
  );
}
