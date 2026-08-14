// Reusable athlete card — `featured` (large, gradient hero) and `compact`
// (horizontal-scroll tile) variants. Photography drops in later via image_url.
import { Link } from "react-router-dom";
import { athleteName, athleteInitials, type PublicAthlete } from "@/lib/ecosystem/types";
import { gradientFor } from "@/lib/ecosystem/visual";
import { FollowButton } from "@/components/fan/FollowButton";

function subtitle(a: PublicAthlete) {
  return [a.position, a.team_name, a.league].filter(Boolean).join(" · ") || "Athlete";
}

export function AthleteCardFeatured({ athlete }: { athlete: PublicAthlete }) {
  return (
    <div className="relative w-[260px] shrink-0 snap-start rounded-2xl overflow-hidden border border-border">
      <Link to={`/a/${athlete.slug}`} className="block h-40" style={{ background: gradientFor(athlete.slug) }}>
        <div className="h-full w-full flex items-center justify-center">
          <span className="text-4xl font-black text-white/85">{athleteInitials(athlete)}</span>
        </div>
      </Link>
      <div className="p-3 bg-card">
        <Link to={`/a/${athlete.slug}`}>
          <div className="font-bold truncate">{athleteName(athlete)}</div>
          <div className="text-[12px] text-muted-foreground truncate">{subtitle(athlete)}</div>
        </Link>
        <FollowButton athleteId={athlete.id} className="mt-3 w-full" />
      </div>
    </div>
  );
}

export function AthleteCardCompact({ athlete }: { athlete: PublicAthlete }) {
  return (
    <div className="w-[150px] shrink-0 snap-start rounded-2xl overflow-hidden border border-border bg-card">
      <Link to={`/a/${athlete.slug}`} className="block h-24" style={{ background: gradientFor(athlete.slug) }}>
        <div className="h-full w-full flex items-center justify-center">
          <span className="text-2xl font-black text-white/85">{athleteInitials(athlete)}</span>
        </div>
      </Link>
      <div className="p-2.5">
        <Link to={`/a/${athlete.slug}`}>
          <div className="font-semibold text-sm truncate">{athleteName(athlete)}</div>
          <div className="text-[11px] text-muted-foreground truncate">{subtitle(athlete)}</div>
        </Link>
        <FollowButton athleteId={athlete.id} className="mt-2 w-full h-8" />
      </div>
    </div>
  );
}

/** Full-width row used in the Athlete Library. */
export function AthleteRow({ athlete, note, children }: { athlete: PublicAthlete; note?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 flex items-center gap-3">
      <Link to={`/a/${athlete.slug}`} className="h-12 w-12 rounded-full shrink-0 flex items-center justify-center" style={{ background: gradientFor(athlete.slug) }}>
        <span className="font-black text-white/90 text-sm">{athleteInitials(athlete)}</span>
      </Link>
      <Link to={`/a/${athlete.slug}`} className="min-w-0 flex-1">
        <div className="font-semibold truncate">{athleteName(athlete)}</div>
        <div className="text-[12px] text-muted-foreground truncate">{note ?? subtitle(athlete)}</div>
      </Link>
      {children}
    </div>
  );
}
