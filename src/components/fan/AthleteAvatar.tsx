// Initial-based avatar for athletes (no athlete photo column exists yet).
import { athleteInitials, type PublicAthlete } from "@/lib/ecosystem/types";
import { cn } from "@/lib/utils";

export function AthleteAvatar({
  athlete,
  size = "md",
}: {
  athlete: Pick<PublicAthlete, "full_name" | "first_name" | "last_name">;
  size?: "sm" | "md" | "lg";
}) {
  const dims = size === "lg" ? "h-16 w-16 text-lg" : size === "sm" ? "h-9 w-9 text-xs" : "h-12 w-12 text-sm";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full bg-accent/15 border border-accent/30 text-accent font-black flex items-center justify-center",
        dims,
      )}
      aria-hidden
    >
      {athleteInitials(athlete)}
    </span>
  );
}
