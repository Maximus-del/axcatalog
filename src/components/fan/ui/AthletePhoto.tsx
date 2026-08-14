// Athlete image with automatic gradient+initials fallback — used everywhere so
// imagery is consistent. Falls back gracefully if the photo fails to load.
import { useState } from "react";
import { athleteInitials, type PublicAthlete } from "@/lib/ecosystem/types";
import { gradientFor } from "@/lib/ecosystem/visual";
import { cn } from "@/lib/utils";

type AthleteLike = Pick<PublicAthlete, "slug" | "image_url" | "full_name" | "first_name" | "last_name">;

export function AthletePhoto({
  athlete,
  className,
  textClass = "text-sm",
}: {
  athlete: AthleteLike;
  className?: string; // size + shape (h/w/rounded)
  textClass?: string; // initials font size
}) {
  const [failed, setFailed] = useState(false);
  const showImage = athlete.image_url && !failed;

  return (
    <span
      className={cn("relative overflow-hidden flex items-center justify-center shrink-0", className)}
      style={{ background: gradientFor(athlete.slug) }}
    >
      {showImage ? (
        <img
          src={athlete.image_url!}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <span className={cn("font-black text-white/90", textClass)}>{athleteInitials(athlete)}</span>
      )}
    </span>
  );
}
