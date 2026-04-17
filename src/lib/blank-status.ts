export type GarmentType =
  | "tee"
  | "long_sleeve"
  | "hoodie"
  | "crewneck"
  | "zip_hoodie"
  | "tank"
  | "polo"
  | "jersey"
  | "shorts"
  | "sweatpants"
  | "hat"
  | "beanie"
  | "other";

export const GARMENT_TYPES: GarmentType[] = [
  "tee",
  "long_sleeve",
  "hoodie",
  "crewneck",
  "zip_hoodie",
  "tank",
  "polo",
  "jersey",
  "shorts",
  "sweatpants",
  "hat",
  "beanie",
  "other",
];

export type BlankAvailability =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "discontinued"
  | "preorder";

export const BLANK_AVAILABILITIES: BlankAvailability[] = [
  "in_stock",
  "low_stock",
  "out_of_stock",
  "discontinued",
  "preorder",
];

export function formatGarmentType(t: string): string {
  return t.replace(/_/g, " ");
}

export function formatAvailability(a: string): string {
  return a.replace(/_/g, " ");
}

export function availabilityBadgeClass(a: BlankAvailability): string {
  switch (a) {
    case "in_stock":
      return "bg-accent/15 text-accent border-accent/30";
    case "low_stock":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "out_of_stock":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "discontinued":
      return "bg-muted text-muted-foreground/60 border-border";
    case "preorder":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
