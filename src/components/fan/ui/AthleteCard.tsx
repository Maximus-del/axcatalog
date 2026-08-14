// Reusable athlete card — `featured` (large) and `compact` (scroll tile)
// variants, plus a full-width `AthleteRow`. Photos via AthletePhoto.
import { Link } from "react-router-dom";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { FollowButton } from "@/components/fan/FollowButton";
import { AthletePhoto } from "./AthletePhoto";

function subtitle(a: PublicAthlete) {
  return [a.position, a.team_name, a.league].filter(Boolean).join(" · ") || "Athlete";
}

export function AthleteCardFeatured({ athlete }: { athlete: PublicAthlete }) {
  return (
    <div className="relative w-[260px] shrink-0 snap-start rounded-2xl overflow-hidden border border-border">
      <Link to={`/a/${athlete.slug}`} className="block">
        <AthletePhoto athlete={athlete} className="h-40 w-full" textClass="text-4xl" />
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
      <Link to={`/a/${athlete.slug}`} className="block">
        <AthletePhoto athlete={athlete} className="h-24 w-full" textClass="text-2xl" />
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
      <Link to={`/a/${athlete.slug}`}>
        <AthletePhoto athlete={athlete} className="h-12 w-12 rounded-full" textClass="text-sm" />
      </Link>
      <Link to={`/a/${athlete.slug}`} className="min-w-0 flex-1">
        <div className="font-semibold truncate">{athleteName(athlete)}</div>
        <div className="text-[12px] text-muted-foreground truncate">{note ?? subtitle(athlete)}</div>
      </Link>
      {children}
    </div>
  );
}
