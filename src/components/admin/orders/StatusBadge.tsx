import { cn } from "@/lib/utils";
import { STATUS_BADGE_CLASS, STATUS_LABEL, type BulkOrderStatus } from "@/lib/order-status";

interface Props {
  status: BulkOrderStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StatusBadge({ status, size = "sm", className }: Props) {
  const sizeClass =
    size === "lg"
      ? "px-3 py-1.5 text-xs"
      : size === "md"
        ? "px-2.5 py-1 text-[11px]"
        : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-semibold uppercase tracking-wider border whitespace-nowrap",
        sizeClass,
        STATUS_BADGE_CLASS[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

interface PriorityProps {
  priority: string;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityProps) {
  if (!priority || priority === "normal") {
    return (
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border bg-muted text-muted-foreground border-border",
          className,
        )}
      >
        Normal
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-orange-500/20 text-orange-400 border-orange-500/40",
        className,
      )}
    >
      {priority}
    </span>
  );
}
