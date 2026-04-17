import { cn } from "@/lib/utils";

interface WordmarkProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * ATHLETE XCLUSIVE wordmark.
 * White text, single "X" rendered in accent green.
 * Used in every header per brand spec.
 */
export function Wordmark({ className, size = "md" }: WordmarkProps) {
  const sizes = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-2xl",
  };

  return (
    <div
      className={cn(
        "font-bold uppercase tracking-wordmark text-foreground select-none",
        sizes[size],
        className,
      )}
      aria-label="Athlete Xclusive"
    >
      ATHLETE <span className="text-accent">X</span>CLUSIVE
    </div>
  );
}
