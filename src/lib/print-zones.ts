// Print-zone types + surface mapping. Zone data itself now lives in the
// `print_zones` table (publicly readable) and is fetched via
// `usePrintZones`. Only the surface→image-field mapping stays here.

export type SurfaceKey = "front" | "back";
export type GarmentCategory = "apparel" | "cap";

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

export function isCap(garmentType: string | null | undefined): boolean {
  return (garmentType ?? "").toLowerCase() === "hat";
}

export function garmentCategoryFor(
  garmentType: string | null | undefined,
): GarmentCategory {
  return isCap(garmentType) ? "cap" : "apparel";
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