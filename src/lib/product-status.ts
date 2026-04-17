export type ProductStatus =
  | "draft"
  | "internal"
  | "published"
  | "archived"
  | "needs_review";

export const PRODUCT_STATUSES: ProductStatus[] = [
  "draft",
  "internal",
  "published",
  "archived",
  "needs_review",
];

export const PRODUCT_TYPES = [
  "athlete_merch",
  "team_merch",
  "blank_bulk",
  "pod",
  "other",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export function statusBadgeClass(status: ProductStatus): string {
  switch (status) {
    case "published":
      return "bg-accent/15 text-accent border-accent/30";
    case "internal":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "needs_review":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "archived":
      return "bg-muted text-muted-foreground/60 border-border";
    case "draft":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function formatType(type: string): string {
  return type.replace(/_/g, " ");
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}
