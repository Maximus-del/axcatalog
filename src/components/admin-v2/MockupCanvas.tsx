import { useCallback, useEffect, useRef, useState } from "react";
import { Info, Ruler, Trash2 } from "lucide-react";
import {
  moveBox,
  resizeBox,
  type Box,
  type Handle,
  type PlacedDesign,
} from "@/lib/v2/placement-geometry";
import type { Design } from "@/lib/v2/types";
import { AssetImage } from "./primitives";

// The mockup canvas: artwork placed freely on a garment photograph.
//
// NO PRINT ZONES. The predefined zone system is gone from this surface. It was
// a rectangle-shaped answer to a question operators do not ask — they position
// by eye against the garment, not against a named box, and every zone chip was
// one more thing to read past. What replaced it is two movable alignment lines,
// one vertical and one horizontal, which the operator drags where they want a
// reference and which never touch the artwork. Guides guide; they do not
// constrain, snap, or clamp.
//
// The only production fact on screen is the maximum print size, stated once.
//
// Geometry lives in placement-geometry.ts and is unit-tested. This component
// owns exactly two things the tests cannot: converting pointer pixels into
// percentages, and measuring each artwork's natural aspect ratio so it can be
// scaled without distortion.

export interface Guides {
  /** Percentage across the garment box. */
  x: number;
  /** Percentage down the garment box. */
  y: number;
}

export const DEFAULT_GUIDES: Guides = { x: 50, y: 34 };

export const DRAG_MIME = "application/x-ax-design-id";

export default function MockupCanvas({
  garmentUrl,
  garmentLabel,
  approximate,
  approximateNote,
  placed,
  designsById,
  surface,
  guides,
  onGuidesChange,
  onChange,
  onDropDesign,
}: {
  garmentUrl: string | null;
  garmentLabel: string;
  approximate: boolean;
  approximateNote: string;
  placed: PlacedDesign[];
  designsById: Map<string, Design>;
  surface: "front" | "back";
  guides: Guides;
  onGuidesChange: (next: Guides) => void;
  onChange: (next: PlacedDesign[]) => void;
  onDropDesign: (designId: string, xPct: number, yPct: number, aspect: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showGuides, setShowGuides] = useState(true);
  const [dragGuide, setDragGuide] = useState<"x" | "y" | null>(null);
  const [dropHint, setDropHint] = useState<{ x: number; y: number } | null>(null);

  // Natural aspect per design, measured from the decoded image. Until a design
  // has loaded it is assumed square, which is only ever briefly visible.
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const aspectOf = (designId: string) => aspects[designId] ?? 1;

  const noteAspect = useCallback((designId: string, aspect: number) => {
    setAspects((prev) => (prev[designId] === aspect ? prev : { ...prev, [designId]: aspect }));
  }, []);

  const mine = placed.filter((p) => p.surface === surface);
  const selectedItem = mine.find((p) => p.id === selected) ?? null;

  /** Pointer pixels → percentage of the garment frame. */
  const pctDelta = (dxPx: number, dyPx: number) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { dx: 0, dy: 0 };
    return { dx: (dxPx / r.width) * 100, dy: (dyPx / r.height) * 100 };
  };

  const pointAt = (clientX: number, clientY: number) => {
    const r = frameRef.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return { x: 50, y: 50 };
    return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
  };

  const update = (id: string, box: Box, zone: { zoneId: string | null; zoneLabel: string | null } | null) => {
    onChange(
      placed.map((p) =>
        p.id === id
          ? { ...p, box, ...(zone ? { zoneId: zone.zoneId, zoneLabel: zone.zoneLabel } : {}) }
          : p,
      ),
    );
  };

  const remove = (id: string) => {
    onChange(placed.filter((p) => p.id !== id));
    setSelected(null);
  };

  /* ------------------------------------------------------------ dragging */

  const startDrag = (e: React.PointerEvent, item: PlacedDesign, handle: Handle | null) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(item.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const startBox = item.box;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const { dx, dy } = pctDelta(ev.clientX - startX, ev.clientY - startY);
      const next = handle
        ? resizeBox(startBox, handle, dx, dy, aspectOf(item.designId))
        : moveBox(startBox, dx, dy);
      // Moving by hand releases the zone label — the artwork is wherever the
      // operator put it, and claiming otherwise would be a lie on the record.
      update(item.id, next, { zoneId: null, zoneLabel: null });
    };
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  /**
   * Dragging an alignment line.
   *
   * Kept separate from artwork dragging so a guide can never be picked up by
   * accident while positioning a design — the two live at different z-levels
   * and the guide handle is the only thing that starts this.
   */
  const startGuideDrag = (e: React.PointerEvent, axis: "x" | "y") => {
    e.preventDefault();
    e.stopPropagation();
    setDragGuide(axis);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const at = pointAt(ev.clientX, ev.clientY);
      onGuidesChange(
        axis === "x"
          ? { ...guides, x: Math.min(100, Math.max(0, at.x)) }
          : { ...guides, y: Math.min(100, Math.max(0, at.y)) },
      );
    };
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setDragGuide(null);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  /* ----------------------------------------------------- keyboard nudging */

  useEffect(() => {
    if (!selectedItem) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remove(selectedItem.id);
        return;
      }
      const step = e.shiftKey ? 5 : 0.5;
      const nudges: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const d = nudges[e.key];
      if (!d) return;
      e.preventDefault();
      update(selectedItem.id, moveBox(selectedItem.box, d[0], d[1]), { zoneId: null, zoneLabel: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------------------------------------------------------------- render */

  return (
    <div className="space-y-2.5">
      <div
        ref={frameRef}
        onPointerDown={() => setSelected(null)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
          e.preventDefault();
          setDropHint(pointAt(e.clientX, e.clientY));
        }}
        onDragLeave={() => setDropHint(null)}
        onDrop={(e) => {
          const designId = e.dataTransfer.getData(DRAG_MIME);
          setDropHint(null);
          if (!designId) return;
          e.preventDefault();
          const at = pointAt(e.clientX, e.clientY);
          onDropDesign(designId, at.x, at.y, aspectOf(designId));
        }}
        className="relative mx-auto aspect-square w-full max-w-[460px] select-none overflow-hidden rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.04]"
      >
        {garmentUrl ? (
          <img src={garmentUrl} alt={garmentLabel} className="pointer-events-none h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-[hsl(var(--ax-faint))]">
            No {surface} photograph for this colourway yet. You can still place artwork — the geometry is saved either
            way.
          </div>
        )}

        {/* Alignment lines. Movable references — they never touch the artwork. */}
        {showGuides && (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 border-l border-dashed"
              style={{
                left: `${guides.x}%`,
                borderColor: `hsl(var(--ax-accent) / ${dragGuide === "x" ? 0.95 : 0.5})`,
              }}
            />
            <span
              className="pointer-events-none absolute inset-x-0 border-t border-dashed"
              style={{
                top: `${guides.y}%`,
                borderColor: `hsl(var(--ax-accent) / ${dragGuide === "y" ? 0.95 : 0.5})`,
              }}
            />
            {/* Handles sit on the edges so they never overlap the artwork. */}
            <span
              onPointerDown={(e) => startGuideDrag(e, "x")}
              role="presentation"
              title="Drag to move the vertical alignment line"
              className="absolute top-0 z-20 h-4 w-4 -translate-x-1/2 cursor-ew-resize touch-none rounded-b-md border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-canvas))]"
              style={{ left: `${guides.x}%` }}
            />
            <span
              onPointerDown={(e) => startGuideDrag(e, "y")}
              role="presentation"
              title="Drag to move the horizontal alignment line"
              className="absolute left-0 z-20 h-4 w-4 -translate-y-1/2 cursor-ns-resize touch-none rounded-r-md border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-canvas))]"
              style={{ top: `${guides.y}%` }}
            />
          </>
        )}

        {mine.map((item) => {
          const design = designsById.get(item.designId);
          const isSelected = item.id === selected;
          return (
            <div
              key={item.id}
              onPointerDown={(e) => startDrag(e, item, null)}
              className={`absolute cursor-move touch-none ${isSelected ? "ring-1 ring-[hsl(var(--ax-accent))]" : ""}`}
              style={{
                left: `${item.box.x}%`,
                top: `${item.box.y}%`,
                width: `${item.box.w}%`,
                height: `${item.box.h}%`,
                transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
              }}
            >
              <AssetImage
                bucket={design?.fileBucket}
                path={design?.filePath}
                alt={design?.title ?? "Artwork"}
                className="pointer-events-none h-full w-full"
                fit="contain"
                onNaturalSize={(a) => noteAspect(item.designId, a)}
              />
              {isSelected &&
                (["nw", "ne", "se", "sw"] as Handle[]).map((h) => (
                  <span
                    key={h}
                    onPointerDown={(e) => startDrag(e, item, h)}
                    role="presentation"
                    className="absolute h-3 w-3 touch-none rounded-full border-2 border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-canvas))]"
                    style={{
                      left: h === "nw" || h === "sw" ? -6 : undefined,
                      right: h === "ne" || h === "se" ? -6 : undefined,
                      top: h === "nw" || h === "ne" ? -6 : undefined,
                      bottom: h === "sw" || h === "se" ? -6 : undefined,
                      cursor: h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize",
                    }}
                  />
                ))}
            </div>
          );
        })}

        {dropHint && (
          <span
            className="pointer-events-none absolute -ml-4 -mt-4 h-8 w-8 rounded-full border-2 border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.2)]"
            style={{ left: `${dropHint.x}%`, top: `${dropHint.y}%` }}
          />
        )}

        {approximate && garmentUrl && (
          <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-[hsl(var(--ax-amber)/0.92)] px-2 py-1 text-[10px] font-semibold text-black">
            {approximateNote}
          </span>
        )}

        {mine.length === 0 && garmentUrl && (
          <span className="pointer-events-none absolute inset-x-6 bottom-4 rounded-lg bg-black/55 px-3 py-2 text-center text-[11px] text-white/85">
            Drag a design here to place it on the {surface}
          </span>
        )}
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setShowGuides((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition-colors ${
            showGuides
              ? "bg-[hsl(var(--ax-accent)/0.16)] text-[hsl(var(--ax-accent))]"
              : "text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-secondary))]"
          }`}
        >
          <Ruler className="h-3 w-3" /> Alignment lines
        </button>
        <button
          type="button"
          onClick={() => onGuidesChange(DEFAULT_GUIDES)}
          className="rounded-full border border-[hsl(var(--ax-border))] px-2.5 py-1 text-[11px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
        >
          Recentre lines
        </button>

        {selectedItem && (
          <button
            type="button"
            onClick={() => remove(selectedItem.id)}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] text-[hsl(var(--ax-amber))] hover:brightness-125"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[hsl(var(--ax-faint))]">
          {selectedItem
            ? `${Math.round(selectedItem.box.w)}% of garment width. Corner handles keep the artwork's proportions; arrow keys nudge.`
            : "Drag artwork anywhere. The dashed lines are references only — nothing snaps to them."}
        </p>
        <span
          className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-[hsl(var(--ax-secondary))]"
          title="Guidance for the operator. Artwork is not automatically restricted to this size."
        >
          <Info className="h-3 w-3" aria-hidden />
          Maximum print size: 16&quot; &times; 20&quot;
        </span>
      </div>
    </div>
  );
}
