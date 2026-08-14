// Manage follows and access level (following → subscriber). No billing yet.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Star, Compass } from "lucide-react";
import { toast } from "sonner";
import { useFollows, useFollowActions } from "@/hooks/useFan";
import { useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { AthleteAvatar } from "@/components/fan/AthleteAvatar";
import { Skeleton } from "@/components/ui/skeleton";

export default function FanFollowing() {
  const { rows, byAthlete, followedIds, isLoading } = useFollows();
  const { data: athletes = [] } = useDiscoverAthletes();
  const { unfollow, setState } = useFollowActions();

  const followed = useMemo(
    () => (athletes as PublicAthlete[]).filter((a) => followedIds.has(a.id)),
    [athletes, followedIds],
  );

  if (isLoading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-accent/15 flex items-center justify-center mb-4">
          <Star className="h-7 w-7 text-accent" />
        </div>
        <h2 className="text-lg font-black">Not following anyone yet</h2>
        <Link to="/feed/discover" className="mt-4 inline-flex items-center gap-2 h-11 px-5 rounded-full bg-accent text-accent-foreground font-bold text-sm">
          <Compass className="h-4 w-4" /> Discover athletes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black tracking-tight">Following</h1>
      <ul className="space-y-2.5">
        {followed.map((a) => {
          const state = byAthlete.get(a.id)?.state ?? "following";
          const isSub = state === "subscriber" || state === "vip";
          return (
            <li key={a.id} className="rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center gap-3">
                <Link to={`/a/${a.slug}`} className="shrink-0">
                  <AthleteAvatar athlete={a} />
                </Link>
                <Link to={`/a/${a.slug}`} className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{athleteName(a)}</div>
                  <div className="text-[12px] text-muted-foreground truncate">
                    {isSub ? "Access member" : "Following"}
                  </div>
                </Link>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={async () => {
                    try {
                      await setState.mutateAsync({ athleteId: a.id, state: isSub ? "following" : "subscriber" });
                      toast.success(isSub ? "Access paused" : "Access on — exclusive drops unlocked");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  }}
                  className={
                    "flex-1 h-9 rounded-lg text-[13px] font-bold " +
                    (isSub ? "border border-border text-muted-foreground" : "bg-accent text-accent-foreground")
                  }
                >
                  {isSub ? "Access on" : "Get Access"}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await unfollow.mutateAsync(a.id);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed");
                    }
                  }}
                  className="h-9 px-4 rounded-lg border border-border text-[13px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  Unfollow
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-muted-foreground text-center pt-1">
        Paid Access &amp; VIP tiers are configurable per athlete. Billing hooks up later — for now Access is a free preview.
      </p>
    </div>
  );
}
