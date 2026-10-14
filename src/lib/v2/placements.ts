// AX OS V2 — print placement presets.
//
// CURRENTLY UNREFERENCED BY THE V2 INTERFACE, DELIBERATELY KEPT.
//
// V2 placement is freeform: the canvas offers two movable alignment lines and
// no zone chips, and the last path that forced a zone (uploading artwork
// straight onto the back) stopped doing so. Nothing in /admin-v2 reads these
// presets today.
//
// They stay because the contract they describe is still live: product_print_
// placements.zone_id/zone_label still exist and still hold values on older
// rows, V1's print-zone editor still maintains the `print_zones` table, and
// the unit-conversion bug fixed in toPercent() is the kind that comes back if
// the knowledge is deleted with the code. Reintroducing zones as SUGGESTIONS
// ("that's basically left chest", via nearestZone) is the likely next use.
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

export interface PrintZoneRow {
  garment_category: string;
  surface: string;
  zone_id: string;
  label: string;
  x: number | string;
  y: number | string;
  w: number | string;
  h: number | string;
}

/**
 * `print_zones` stores geometry as 0–1 fractions; the presets above are 0–100
 * percentages because that is what the preview overlay renders with.
 *
 * These two units met here and nothing converted between them, so every live
 * zone merged in at roughly x=0.26%, y=0.21% — every placement box collapsed
 * into the top-left corner of the garment. Normalising on the way in keeps the
 * percentage contract true for every consumer of a PlacementPreset.
 */
export function toPercent(box: { x: number; y: number; w: number; h: number }) {
  // A real placement never occupies ≤1% of the garment, so "everything ≤ 1"
  // is an unambiguous signal that these are fractions rather than percentages.
  const fractional = [box.x, box.y, box.w, box.h].every((n) => Number.isFinite(n) && Math.abs(n) <= 1);
  const k = fractional ? 100 : 1;
  return { x: box.x * k, y: box.y * k, w: box.w * k, h: box.h * k };
}

/**
 * Merge live print_zones rows over the presets. Live rows win on geometry and
 * label; presets supply anything the DB has not defined yet (e.g. oversized
 * front, which does not exist as a print_zones row today).
 */
export function mergeZones(live: PrintZoneRow[]): PlacementPreset[] {
  const geometry = (z: PrintZoneRow) =>
    toPercent({ x: Number(z.x), y: Number(z.y), w: Number(z.w), h: Number(z.h) });

  const out = PLACEMENT_PRESETS.map((p) => {
    const hit = live.find((z) => z.zone_id === p.zoneId);
    if (!hit) return p;
    return { ...p, label: hit.label || p.label, ...geometry(hit) };
  });
  for (const z of live) {
    if (out.some((p) => p.zoneId === z.zone_id)) continue;
    out.push({
      zoneId: z.zone_id,
      surface: (z.surface as PlacementPreset["surface"]) ?? "front",
      label: z.label,
      ...geometry(z),
      garmentCategory: z.garment_category === "cap" ? "cap" : "apparel",
    });
  }
  return out;
}
