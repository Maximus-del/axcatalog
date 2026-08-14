// Athlete recommendations from the follow graph. Deterministic today
// (position/league affinity); this is the seam where a real recommendation
// service would plug in later. PREPARE FOR: behavioral ranking.
import { athleteName, type PublicAthlete } from "./types";

export interface Recommendation {
  athlete: PublicAthlete;
  reason: string;
}

export function recommendAthletes(
  all: PublicAthlete[],
  followedIds: Set<string>,
  limit = 10,
): Recommendation[] {
  const followed = all.filter((a) => followedIds.has(a.id));
  const candidates = all.filter((a) => !followedIds.has(a.id));

  if (followed.length === 0) {
    // Cold start: surface a varied slice as "New to Goat Farm".
    return candidates.slice(0, limit).map((athlete) => ({ athlete, reason: "New to Goat Farm" }));
  }

  const byPosition = new Map<string, PublicAthlete>();
  const byLeague = new Map<string, PublicAthlete>();
  for (const f of followed) {
    if (f.position && !byPosition.has(f.position)) byPosition.set(f.position, f);
    if (f.league && !byLeague.has(f.league)) byLeague.set(f.league, f);
  }

  const scored = candidates.map((athlete) => {
    let score = 0;
    let reason = "Recommended for you";
    const posMatch = athlete.position && byPosition.get(athlete.position);
    const lgMatch = athlete.league && byLeague.get(athlete.league);
    if (posMatch) {
      score += 3;
      reason = `Because you follow ${athleteName(posMatch)}`;
    } else if (lgMatch) {
      score += 1;
      reason = `More from the ${athlete.league}`;
    }
    return { athlete, reason, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || athleteName(a.athlete).localeCompare(athleteName(b.athlete)))
    .slice(0, limit)
    .map(({ athlete, reason }) => ({ athlete, reason }));
}
