// Mobile-first. Test at 375px before merging.
//
// Placement options. Mirrors the design_placement Postgres enum exactly.
// If you add an enum value in a migration, also add it here.
export type DesignPlacement =
  | "front"
  | "back"
  | "left_sleeve"
  | "right_sleeve"
  | "hem"
  | "chest"
  | "pocket"
  | "hood"
  | "sleeve_wrap"
  | "all_over"
  | "other";

export const PLACEMENT_OPTIONS: Array<{ value: DesignPlacement; label: string }> = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "chest", label: "Chest" },
  { value: "pocket", label: "Pocket" },
  { value: "hood", label: "Hood" },
  { value: "left_sleeve", label: "Left sleeve" },
  { value: "right_sleeve", label: "Right sleeve" },
  { value: "sleeve_wrap", label: "Sleeve wrap" },
  { value: "hem", label: "Hem" },
  { value: "all_over", label: "All-over print" },
  { value: "other", label: "Other" },
];

export function formatPlacement(p: string): string {
  return PLACEMENT_OPTIONS.find((o) => o.value === p)?.label ?? p.replace(/_/g, " ");
}
