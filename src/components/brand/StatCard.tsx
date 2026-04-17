import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  className?: string;
}

export function StatCard({ label, value, hint, accent, className }: StatCardProps) {
  return (
    <div className={cn("ax-card", className)}>
      <div className="ax-label mb-3">{label}</div>
      <div className={cn("ax-stat", accent && "text-accent")}>{value}</div>
      {hint && <div className="mt-2 text-sm text-muted-foreground">{hint}</div>}
    </div>
  );
}
