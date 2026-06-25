import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  SurfaceDef,
  SurfaceKey,
  garmentCategoryFor,
  surfacesFor,
} from "@/lib/print-zones";
import type { CartCustomization } from "@/pages/catalog/CartContext";
import { renderPrintReadyPng } from "@/lib/render-print-ready";
import { usePrintZones } from "@/hooks/usePrintZones";

interface ColorImage {
  color_name: string;
  image_url: string | null;
  image_url_back: string | null;
}

interface Props {
  garmentType: string | null | undefined;
  fallbackImage: string | null;
  selectedColor: ColorImage | null;
  /** Called whenever the editor has a valid (file + placement) state, or null. */
  onChange: (
    value: {
      file: File;
      placement: Omit<CartCustomization, "asset_path" | "asset_filename" | "asset_mime" | "preview_url">;
      previewUrl: string;
      /** Renders the print-ready PNG, clipped to the zone box, at zone pixel dimensions. */
      getPrintReadyFile: (filename?: string) => Promise<File>;
    } | null,
  ) => void;
}

/**
 * Placement is expressed as percentages of the print-zone BOX (0..1).
 * Values may be negative or greater than 1; the visual stage and the
 * exported print-ready PNG clip to the box.
 */
interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

type DragMode =
  | { kind: "move"; startX: number; startY: number; orig: Placement }
  | { kind: "scale"; corner: "nw" | "ne" | "sw" | "se"; startX: number; startY: number; orig: Placement }
  | { kind: "rotate"; centerX: number; centerY: number; startAngle: number; orig: Placement };

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

export default function MockupEditor({
  garmentType,
  fallbackImage,
  selectedColor,
  onChange,
}: Props) {
  const surfaces = useMemo<SurfaceDef[]>(() => surfacesFor(garmentType), [garmentType]);
  const [surfaceKey, setSurfaceKey] = useState<SurfaceKey>(surfaces[0].key);
  const surface = surfaces.find((s) => s.key === surfaceKey) ?? surfaces[0];

  const baseSrc =
    (selectedColor && (selectedColor[surface.imageField] as string | null)) ??
    fallbackImage ??
    null;

  const category = useMemo(() => garmentCategoryFor(garmentType), [garmentType]);
  const { data: zonesBySurface } = usePrintZones(category);
  const zones = useMemo(
    () => zonesBySurface?.[surface.key] ?? [],
    [zonesBySurface, surface.key],
  );
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? "");
  const zone = zones.find((z) => z.id === zoneId) ?? zones[0];

  useEffect(() => {
    setZoneId(zones[0]?.id ?? "");
  }, [zones]);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Default: fill the box exactly.
  const [placement, setPlacement] = useState<Placement | null>(null);
  useEffect(() => {
    if (!zone) {
      setPlacement(null);
      return;
    }
    setPlacement({ x: 0, y: 0, w: 1, h: 1, rotation: 0 });
  }, [zone?.id]);

  useEffect(() => {
    if (!file || !previewUrl || !placement || !zone || !baseSrc) {
      onChange(null);
      return;
    }
    onChange({
      file,
      previewUrl,
      placement: {
        surface: surface.key,
        surface_label: surface.label,
        zone_id: zone.id,
        placement_label: zone.label,
        x_pct: round(placement.x),
        y_pct: round(placement.y),
        w_pct: round(placement.w),
        h_pct: round(placement.h),
        rotation_deg: Math.round(placement.rotation),
      },
      getPrintReadyFile: (filename = "design.png") =>
        renderPrintReadyPng({
          baseImageSrc: baseSrc,
          designFile: file,
          zone,
          placement: {
            x_pct: placement.x,
            y_pct: placement.y,
            w_pct: placement.w,
            h_pct: placement.h,
            rotation_deg: placement.rotation,
          },
          filename,
        }),
    });
  }, [file, previewUrl, placement, zone, baseSrc, surface.key, surface.label, onChange]);

  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragMode | null>(null);

  const handleFile = useCallback((f: File | null) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) {
      toast({ title: "Unsupported file", description: "Please upload an image (PNG recommended).", variant: "destructive" });
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      toast({ title: "File too large", description: "Max 8 MB.", variant: "destructive" });
      return;
    }
    setFile(f);
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !placement || !zone || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const boxPxW = Math.max(1, zone.w * rect.width);
    const boxPxH = Math.max(1, zone.h * rect.height);
    if (drag.kind === "move") {
      const dx = (e.clientX - drag.startX) / boxPxW;
      const dy = (e.clientY - drag.startY) / boxPxH;
      setPlacement({
        x: drag.orig.x + dx,
        y: drag.orig.y + dy,
        w: drag.orig.w,
        h: drag.orig.h,
        rotation: drag.orig.rotation,
      });
    } else if (drag.kind === "scale") {
      const aspect = drag.orig.w / drag.orig.h;
      const dx = (e.clientX - drag.startX) / boxPxW;
      const dy = (e.clientY - drag.startY) / boxPxH;
      const signW = drag.corner === "ne" || drag.corner === "se" ? 1 : -1;
      const signH = drag.corner === "sw" || drag.corner === "se" ? 1 : -1;
      const deltaPct = Math.max(signW * dx, signH * dy);
      const newW = Math.max(0.02, drag.orig.w + deltaPct);
      const newH = newW / aspect;
      let newX = drag.orig.x;
      let newY = drag.orig.y;
      if (signW < 0) newX = drag.orig.x + (drag.orig.w - newW);
      if (signH < 0) newY = drag.orig.y + (drag.orig.h - newH);
      setPlacement({ x: newX, y: newY, w: newW, h: newH, rotation: drag.orig.rotation });
    } else if (drag.kind === "rotate") {
      const angle =
        Math.atan2(e.clientY - drag.centerY, e.clientX - drag.centerX) * (180 / Math.PI);
      const delta = angle - drag.startAngle;
      setPlacement({ ...drag.orig, rotation: (drag.orig.rotation + delta + 360) % 360 });
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  if (!baseSrc) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
        Pick a color above to start mocking up your design.
      </div>
    );
  }

  // Convert box-% placement → stage-% rect for the unclipped interaction overlay.
  const stageRect = zone && placement
    ? {
        x: zone.x + placement.x * zone.w,
        y: zone.y + placement.y * zone.h,
        w: placement.w * zone.w,
        h: placement.h * zone.h,
      }
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Mock up your design</div>
        {file && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFile(null)}
            className="h-7 px-2 text-xs"
          >
            <X className="h-3.5 w-3.5 mr-1" /> Remove
          </Button>
        )}
      </div>

      {surfaces.length > 1 && (
        <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
          {surfaces.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSurfaceKey(s.key)}
              className={`px-3 py-1 rounded transition ${
                s.key === surfaceKey
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={stageRef}
        className="relative aspect-square w-full rounded-lg bg-white overflow-hidden select-none touch-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={baseSrc}
          alt="Mockup base"
          className="absolute inset-0 h-full w-full object-contain p-6 pointer-events-none"
          draggable={false}
        />

        {/* Clip layer: zone box with overflow:hidden so anything outside is cut. */}
        {zone && previewUrl && placement && (
          <div
            className="absolute overflow-hidden pointer-events-none"
            style={{
              left: `${zone.x * 100}%`,
              top: `${zone.y * 100}%`,
              width: `${zone.w * 100}%`,
              height: `${zone.h * 100}%`,
            }}
          >
            <img
              src={previewUrl}
              alt="Your design"
              draggable={false}
              className="absolute object-contain"
              style={{
                left: `${placement.x * 100}%`,
                top: `${placement.y * 100}%`,
                width: `${placement.w * 100}%`,
                height: `${placement.h * 100}%`,
                transform: `rotate(${placement.rotation}deg)`,
                transformOrigin: "center",
              }}
            />
          </div>
        )}

        {/* Zone outline guide */}
        {zone && (
          <div
            className="absolute border border-dashed border-foreground/50 pointer-events-none"
            style={{
              left: `${zone.x * 100}%`,
              top: `${zone.y * 100}%`,
              width: `${zone.w * 100}%`,
              height: `${zone.h * 100}%`,
            }}
          />
        )}

        {/* Interaction overlay: unclipped bounding rect with handles. */}
        {previewUrl && placement && zone && stageRect && (
          <div
            className="absolute"
            style={{
              left: `${stageRect.x * 100}%`,
              top: `${stageRect.y * 100}%`,
              width: `${stageRect.w * 100}%`,
              height: `${stageRect.h * 100}%`,
              transform: `rotate(${placement.rotation}deg)`,
              transformOrigin: "center",
            }}
          >
            <div
              className="absolute inset-0 cursor-move"
              style={{ touchAction: "none" }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as Element).setPointerCapture?.(e.pointerId);
                dragRef.current = {
                  kind: "move",
                  startX: e.clientX,
                  startY: e.clientY,
                  orig: placement,
                };
              }}
            />
            <div className="absolute inset-0 ring-1 ring-primary/70 pointer-events-none" />
            {(["nw", "ne", "sw", "se"] as const).map((corner) => (
              <div
                key={corner}
                className="absolute h-3 w-3 rounded-sm bg-background border border-primary"
                style={{
                  left: corner.includes("w") ? -6 : "auto",
                  right: corner.includes("e") ? -6 : "auto",
                  top: corner.includes("n") ? -6 : "auto",
                  bottom: corner.includes("s") ? -6 : "auto",
                  cursor: corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize",
                  touchAction: "none",
                }}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  dragRef.current = {
                    kind: "scale",
                    corner,
                    startX: e.clientX,
                    startY: e.clientY,
                    orig: placement,
                  };
                }}
              />
            ))}
            <div
              className="absolute left-1/2 -translate-x-1/2 -top-7 h-4 w-4 rounded-full bg-background border border-primary flex items-center justify-center"
              style={{ cursor: "grab", touchAction: "none" }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                (e.target as Element).setPointerCapture?.(e.pointerId);
                const stage = stageRef.current!.getBoundingClientRect();
                const sx = zone.x + (placement.x + placement.w / 2) * zone.w;
                const sy = zone.y + (placement.y + placement.h / 2) * zone.h;
                const cx = stage.left + sx * stage.width;
                const cy = stage.top + sy * stage.height;
                const startA =
                  Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
                dragRef.current = {
                  kind: "rotate",
                  centerX: cx,
                  centerY: cy,
                  startAngle: startA,
                  orig: placement,
                };
              }}
            >
              <RotateCcw className="h-2.5 w-2.5 text-primary" />
            </div>
          </div>
        )}

        {!previewUrl && (
          <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
            <div className="text-xs text-muted-foreground bg-background/80 rounded-full px-3 py-1">
              Upload a PNG to preview
            </div>
          </div>
        )}
      </div>

      {zones.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {zones.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setZoneId(z.id)}
              className={`text-xs rounded-full border px-2.5 py-1 transition ${
                z.id === zoneId
                  ? "border-foreground bg-foreground text-background"
                  : "border-border hover:border-foreground/50"
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>
      )}

      <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-border px-3 py-2 text-sm hover:bg-accent transition w-full justify-center">
        <Upload className="h-4 w-4" />
        {file ? "Replace design (PNG)" : "Upload your design (PNG)"}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </label>

      <p className="text-[11px] text-muted-foreground text-center">
        Drag, scale, and rotate freely — anything outside the dashed box is clipped and won't print.
      </p>
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 10000) / 10000;
}