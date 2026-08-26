// AX OS V2 — print placement presets.
//
// Speed + consistency, not Illustrator. The seven live `print_zones` rows are
// the source of truth; these presets are the fallback and the ordering/grouping
// the operator sees. A placement is a preset choice, never a freehand transform.

export interface PlacementPreset {
  zoneId: string;
  surface: "front" | "back" | "sleeve";
  label: string;
  /** Percent box on the garment image — drives the concept preview overlay. */
  x: number;
  y: number;
  w: number;
  h: number;
  garmentCategory: "apparel" | "cap";
}

export const PLACEMENT_PRESETS: PlacementPreset[] = [
  // FRONT
  { zoneId: "left_chest", surface: "front", label: "Left chest", x: 58, y: 26, w: 16, h: 12, garmentCategory: "apparel" },
  { zoneId: "center_chest", surface: "front", label: "Center", x: 30, y: 30, w: 40, h: 28, garmentCategory: "apparel" },
  { zoneId: "front_oversized", surface: "front", label: "Oversized", x: 18, y: 24, w: 64, h: 46, garmentCategory: "apparel" },
  // BACK
  { zoneId: "center_back", surface: "back", label: "Standard", x: 28, y: 26, w: 44, h: 34, garmentCategory: "apparel" },
  { zoneId: "full_16x20", surface: "back", label: "Oversized", x: 16, y: 20, w: 68, h: 52, garmentCategory: "apparel" },
  { zoneId: "high_back", surface: "back", label: "High back", x: 30, y: 14, w: 40, h: 12, garmentCategory: "apparel" },
  { zoneId: "low_back", surface: "back", label: "Low back", x: 34, y: 62, w: 32, h: 14, garmentCategory: "apparel" },
  // CAP
  { zoneId: "cap_front", surface: "front", label: "Front panel", x: 30, y: 34, w: 40, h: 26, garmentCategory: "cap" },
];

/** Blank garment_type -> which placement family applies. */
export function categoryForGarment(garmentType: string | null | undefined): "apparel" | "cap" {
  return garmentType === "hat" || garmentType === "cap" ? "cap" : "apparel";
}

export function presetsFor(garmentType: string | null | undefined): PlacementPreset[] {
  const cat = categoryForGarment(garmentType);
  return PLACEMENT_PRESETS.filter((p) => p.garmentCategory === cat);
}

export function presetById(zoneId: string | null | undefined): PlacementPreset | null {
  if (!zoneId) return null;
  return PLACEMENT_PRESETS.find((p) => p.zoneId === zoneId) ?? null;
}

/**
 * Merge live print_zones rows over the presets. Live rows win on geometry and
 * label; presets supply anything the DB has not defined yet (e.g. oversized
 * front, which does not exist as a print_zones row today).
 */
export function mergeZones(
  live: { garment_category: string; surface: string; zone_id: string; label: string; x: number; y: number; w: number; h: number }[],
): PlacementPreset[] {
  const out = PLACEMENT_PRESETS.map((p) => {
    const hit = live.find((z) => z.zone_id === p.zoneId);
    if (!hit) return p;
    return { ...p, label: hit.label || p.label, x: Number(hit.x), y: Number(hit.y), w: Number(hit.w), h: Number(hit.h) };
  });
  for (const z of live) {
    if (out.some((p) => p.zoneId === z.zone_id)) continue;
    out.push({
      zoneId: z.zone_id,
      surface: (z.surface as PlacementPreset["surface"]) ?? "front",
      label: z.label,
      x: Number(z.x),
      y: Number(z.y),
      w: Number(z.w),
      h: Number(z.h),
      garmentCategory: z.garment_category === "cap" ? "cap" : "apparel",
    });
  }
  return out;
}
