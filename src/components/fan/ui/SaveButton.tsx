// Bookmark toggle used on products, content, camps, events, articles.
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { useSavedItems, useSaveActions, savedKey, type SaveInput } from "@/hooks/useSaved";
import { cn } from "@/lib/utils";

export function SaveButton({
  item,
  variant = "overlay",
  stopLink = true,
}: {
  item: SaveInput;
  variant?: "overlay" | "inline";
  stopLink?: boolean;
}) {
  const { session } = useAuth();
  const { keys } = useSavedItems();
  const { save, unsave } = useSaveActions();
  const saved = keys.has(savedKey(item.type, item.ref));
  const busy = save.isPending || unsave.isPending;

  async function toggle(e: React.MouseEvent) {
    if (stopLink) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!session) {
      toast.info("Sign in to save items.");
      return;
    }
    try {
      if (saved) await unsave.mutateAsync({ type: item.type, ref: item.ref });
      else {
        await save.mutateAsync(item);
        toast.success("Saved");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  }

  if (variant === "inline") {
    return (
      <button
        onClick={toggle}
        disabled={busy}
        className={cn(
          "h-10 px-4 rounded-xl border font-bold text-[13px] inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60",
          saved ? "border-accent/40 text-accent" : "border-border text-foreground",
        )}
      >
        <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
        {saved ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-label={saved ? "Unsave" : "Save"}
      className="h-7 w-7 rounded-full bg-black/55 backdrop-blur flex items-center justify-center"
    >
      <Bookmark className={cn("h-3.5 w-3.5 text-white", saved && "fill-accent text-accent")} />
    </button>
  );
}
