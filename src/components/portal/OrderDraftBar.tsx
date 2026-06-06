import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrderDraft } from "./OrderDraftContext";

interface Props {
  onOpenSheet: () => void;
}

/**
 * Floating bottom-right bar shown when the order draft has items.
 */
export function OrderDraftBar({ onOpenSheet }: Props) {
  const { unitCount, itemCount, clear } = useOrderDraft();

  if (unitCount === 0) return null;

  return (
    <div
      className="fixed right-4 left-4 sm:left-auto z-40 ax-card border-accent/40 shadow-2xl flex items-center gap-3 p-3 bg-card/95 backdrop-blur bottom-[calc(env(safe-area-inset-bottom)+72px)] md:bottom-4"
    >
      <div className="h-10 w-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
        <ShoppingCart className="h-5 w-5 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold leading-none">
          {unitCount} unit{unitCount === 1 ? "" : "s"} in draft
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {itemCount} size{itemCount === 1 ? "" : "s"} across products
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={clear}
        className="text-xs text-muted-foreground hover:text-destructive"
      >
        Clear
      </Button>
      <Button
        size="sm"
        onClick={onOpenSheet}
        className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold uppercase tracking-wider"
      >
        Review
      </Button>
    </div>
  );
}
