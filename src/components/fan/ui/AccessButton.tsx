// Access (subscribe) toggle. No payment — flips follow state to `subscriber`.
// Access is a free preview until billing is wired up.
import { Star, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useFollows, useFollowActions } from "@/hooks/useFan";
import { cn } from "@/lib/utils";

export function AccessButton({ athleteId, className }: { athleteId: string; className?: string }) {
  const { byAthlete } = useFollows();
  const { setState } = useFollowActions();
  const state = byAthlete.get(athleteId)?.state;
  const isMember = state === "subscriber" || state === "vip";

  async function toggle() {
    try {
      await setState.mutateAsync({ athleteId, state: isMember ? "following" : "subscriber" });
      toast.success(isMember ? "Access paused" : "Access on — exclusive content unlocked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={setState.isPending}
      className={cn(
        "h-9 px-4 rounded-full text-[13px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60",
        isMember ? "border border-accent/40 text-accent" : "border border-border text-foreground hover:border-accent/40",
        className,
      )}
    >
      {setState.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isMember ? <Check className="h-4 w-4" /> : <Star className="h-4 w-4" />}
      {isMember ? "Access on" : "Get Access"}
    </button>
  );
}
