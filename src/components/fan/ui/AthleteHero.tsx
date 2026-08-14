// Visual athlete hero for the profile page. Gradient stands in for photography.
import { athleteName, athleteInitials, type PublicAthlete } from "@/lib/ecosystem/types";
import { gradientFor } from "@/lib/ecosystem/visual";

export function AthleteHero({ athlete }: { athlete: PublicAthlete }) {
  const subtitle = [athlete.position, athlete.team_name, athlete.league].filter(Boolean).join(" · ") || "Athlete";
  return (
    <div className="relative rounded-3xl overflow-hidden border border-border">
      <div className="h-44 sm:h-56" style={{ background: gradientFor(athlete.slug) }}>
        <div className="h-full w-full flex items-center justify-center">
          <span className="text-6xl font-black text-white/80">{athleteInitials(athlete)}</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">{athleteName(athlete)}</h1>
        <p className="text-[13px] text-white/80">{subtitle}</p>
      </div>
    </div>
  );
}

export function AthleteStatBar({ followers, drops, posts }: { followers: string; drops: number; posts: number }) {
  return (
    <div className="grid grid-cols-3 gap-3 mt-3">
      {[
        { v: followers, l: "Followers" },
        { v: String(drops), l: "Drops" },
        { v: String(posts), l: "Access Posts" },
      ].map((s) => (
        <div key={s.l} className="rounded-2xl border border-border bg-card py-3 text-center">
          <div className="text-lg font-black text-accent">{s.v}</div>
          <div className="ax-label mt-0.5">{s.l}</div>
        </div>
      ))}
    </div>
  );
}
