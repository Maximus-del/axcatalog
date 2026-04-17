export type DesignStatus =
  | "concept"
  | "in_progress"
  | "approved"
  | "production_ready"
  | "archived";

export const DESIGN_STATUSES: DesignStatus[] = [
  "concept",
  "in_progress",
  "approved",
  "production_ready",
  "archived",
];

export function formatDesignStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export function designStatusBadgeClass(status: DesignStatus): string {
  switch (status) {
    case "concept":
      return "bg-muted text-muted-foreground border-border";
    case "in_progress":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "approved":
      return "bg-accent/15 text-accent border-accent/30";
    case "production_ready":
      return "bg-accent/25 text-accent border-accent/50 ax-pulse";
    case "archived":
      return "bg-muted text-muted-foreground/60 border-border";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
