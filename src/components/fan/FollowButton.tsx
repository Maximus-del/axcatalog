// Follow / Following toggle used across discovery, profiles, and the feed.
import { Check, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useFollows, useFollowActions } from "@/hooks/useFan";
import { cn } from "@/lib/utils";

export function FollowButton({ athleteId, className }: { athleteId: string; className?: string }) {
  const { followedIds } = useFollows();
  const { follow, unfollow } = useFollowActions();
  const following = followedIds.has(athleteId);
  const busy = follow.isPending || unfollow.isPending;

  async function toggle() {
    try {
      if (following) await unfollow.mutateAsync(athleteId);
      else {
        await follow.mutateAsync(athleteId);
        toast.success("Following — new drops will show in your feed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={cn(
        "h-9 px-4 rounded-full text-[13px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60",
        following
          ? "border border-border text-muted-foreground hover:text-foreground"
          : "bg-accent text-accent-foreground",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : following ? (
        <>
          <Check className="h-4 w-4" /> Following
        </>
      ) : (
        <>
          <Plus className="h-4 w-4" /> Follow
        </>
      )}
    </button>
  );
}
