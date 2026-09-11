// Visual athlete hero for the profile page. Uses the athlete photo when present.
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { AthletePhoto } from "./AthletePhoto";

export function AthleteHero({ athlete }: { athlete: PublicAthlete }) {
  const subtitle = [athlete.position, athlete.team_name, athlete.league].filter(Boolean).join(" · ") || "Athlete";
  return (
    <div className="relative rounded-3xl overflow-hidden border border-border">
      <AthletePhoto athlete={athlete} className="h-52 sm:h-64 w-full" textClass="text-6xl" />
      <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/85 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">{athleteName(athlete)}</h1>
        <p className="text-[13px] text-white/80">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * `followers` is optional and currently never passed. It used to be a string
 * hashed from the athlete's slug — a fabricated public number like "142K" shown
 * to fans on the athlete's own page. A real count needs a public aggregate over
 * athlete_follows, which RLS does not expose (a fan may read only their own
 * rows), so the stat is omitted rather than invented.
 */
export function AthleteStatBar({ followers, drops, posts }: { followers?: string; drops: number; posts: number }) {
  const stats = [
    ...(followers ? [{ v: followers, l: "Followers" }] : []),
    { v: String(drops), l: "Drops" },
    { v: String(posts), l: "Access Posts" },
  ];
  return (
    <div className={`grid gap-3 mt-3 ${stats.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {stats.map((s) => (
        <div key={s.l} className="rounded-2xl border border-border bg-card py-3 text-center">
          <div className="text-lg font-black text-accent">{s.v}</div>
          <div className="ax-label mt-0.5">{s.l}</div>
        </div>
      ))}
    </div>
  );
}
