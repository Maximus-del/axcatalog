import type { ReactNode } from "react";
import { placementStyle, type PlacedDesign } from "@/lib/v2/placement-geometry";
import type { Design } from "@/lib/v2/types";
import { AssetImage } from "./primitives";

// ONE GARMENT, ONE ARRANGEMENT, ONE RENDERER.
//
// "Artwork positioned on a photograph of a blank" was being drawn in four
// places — the editing canvas, the colourway strip, the confirm-step preview
// and the mockup detail page — from four hand-written copies of the same
// percentage maths. A fifth copy lives in mockup-export.ts as canvas-2D
// drawing, which is the one that actually has to agree with the others.
//
// Four copies of a formula do not stay equal. They drift on the day someone
// fixes a rounding bug in one of them, and the symptom is a preview that does
// not match the exported file — after the client has approved the preview.
//
// So the maths is `placementStyle` and nothing computes it again. The editing
// canvas keeps its own frame element (it owns a ref, drop handlers and the
// alignment lines) but takes its geometry from here like everything else.

/**
 * The garment photograph, at a fixed square, with room for overlays.
 *
 * Square because every blank photograph in the library is square and a frame
 * that changes shape per garment makes a grid of colourways impossible to scan.
 */
export function GarmentFrame({
  url,
  alt,
  empty,
  badge,
  className = "mx-auto aspect-square w-full max-w-[460px] rounded-2xl border border-[hsl(var(--ax-border))]",
  children,
}: {
  url: string | null | undefined;
  alt: string;
  /** What to say when there is no photograph. Never left blank — silence reads as a broken image. */
  empty: ReactNode;
  /** Corner note, e.g. "not this colourway's own photograph". */
  badge?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden bg-white/[0.04] ${className}`}>
      {url ? (
        <img src={url} alt={alt} className="pointer-events-none h-full w-full object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-[hsl(var(--ax-faint))]">
          {empty}
        </div>
      )}
      {children}
      {badge && url && <div className="pointer-events-none absolute right-2 top-2">{badge}</div>}
    </div>
  );
}

/** Read-only artwork on a garment. The editing canvas draws its own, interactively. */
export function PlacedOverlay({
  placed,
  designsById,
}: {
  placed: PlacedDesign[];
  designsById: Map<string, Design>;
}) {
  return (
    <>
      {placed.map((p) => {
        const design = designsById.get(p.designId);
        return (
          <div key={p.id} className="pointer-events-none absolute" style={placementStyle(p)}>
            <AssetImage
              bucket={design?.fileBucket}
              path={design?.filePath}
              alt={design?.title ?? "Artwork"}
              className="h-full w-full"
              fit="contain"
            />
          </div>
        );
      })}
    </>
  );
}

/** The amber note that says a photograph is standing in for another. */
export function ApproximateBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-[hsl(var(--ax-amber)/0.92)] px-2 py-1 text-[10px] font-semibold text-black">
      {children}
    </span>
  );
}
