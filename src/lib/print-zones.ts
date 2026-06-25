// Print-zone configuration. Coordinates are PERCENTAGES of the base image
// (0..1). These are the editable defaults; admins will tune them later.

export type SurfaceKey = "front" | "back";

export interface PrintZone {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SurfaceDef {
  key: SurfaceKey;
  label: string;
  /** Field on `blank_colors` to read the base image from. */
  imageField: "image_url" | "image_url_back";
}

const APPAREL_ZONES: Record<SurfaceKey, PrintZone[]> = {
  front: [
    { id: "left_chest", label: "Left chest", x: 0.4, y: 0.3, w: 0.16, h: 0.12 },
    { id: "center_chest", label: "Center chest", x: 0.34, y: 0.3, w: 0.32, h: 0.22 },
  ],
  back: [
    { id: "high_back", label: "High back", x: 0.32, y: 0.22, w: 0.36, h: 0.1 },
    { id: "center_back", label: "Center back", x: 0.3, y: 0.3, w: 0.4, h: 0.3 },
    { id: "low_back", label: "Low back", x: 0.32, y: 0.55, w: 0.36, h: 0.18 },
    { id: "full_16x20", label: "16×20 back", x: 0.28, y: 0.26, w: 0.44, h: 0.55 },
  ],
};

const CAP_ZONES: Record<"front", PrintZone[]> = {
  front: [
    { id: "cap_front", label: "Front panel", x: 0.34, y: 0.4, w: 0.32, h: 0.16 },
  ],
};

export function isCap(garmentType: string | null | undefined): boolean {
  return (garmentType ?? "").toLowerCase() === "hat";
}

/**
 * Surfaces available to decorate for this garment.
 *
 * Caps store their straight-on (decoratable) front in `image_url_back` —
 * the primary `image_url` is the angled marketing shot.
 */
export function surfacesFor(garmentType: string | null | undefined): SurfaceDef[] {
  if (isCap(garmentType)) {
    return [{ key: "front", label: "Front", imageField: "image_url_back" }];
  }
  return [
    { key: "front", label: "Front", imageField: "image_url" },
    { key: "back", label: "Back", imageField: "image_url_back" },
  ];
}

export function zonesFor(
  garmentType: string | null | undefined,
  surface: SurfaceKey,
): PrintZone[] {
  if (isCap(garmentType)) return CAP_ZONES.front;
  return APPAREL_ZONES[surface] ?? [];
}

/** Clamp a placement rect (all in 0..1 percentages) inside a zone. */
export function clampToZone(
  rect: { x: number; y: number; w: number; h: number },
  zone: PrintZone,
): { x: number; y: number; w: number; h: number } {
  const w = Math.min(rect.w, zone.w);
  const h = Math.min(rect.h, zone.h);
  const x = Math.min(Math.max(rect.x, zone.x), zone.x + zone.w - w);
  const y = Math.min(Math.max(rect.y, zone.y), zone.y + zone.h - h);
  return { x, y, w, h };
}