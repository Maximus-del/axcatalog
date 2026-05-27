// Mobile-first. Test at 375px before merging.
import { useMemo, useState } from "react";
import { Check, EyeOff, Shirt, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PortalProduct } from "@/hooks/usePortalProducts";
import { ProductCard } from "./ProductCard";

interface Props {
  products: PortalProduct[];
  loading: boolean;
  hiddenIds: Set<string>;
  onHide: (ids: string[]) => Promise<void>;
  onUnhide: (ids: string[]) => Promise<void>;
}

export function MyProductsGrid({ products, loading, hiddenIds, onHide, onUnhide }: Props) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showHiddenTray, setShowHiddenTray] = useState(false);

  const visible = useMemo(
    () => products.filter((p) => !hiddenIds.has(p.id)),
    [products, hiddenIds],
  );
  const hidden = useMemo(
    () => products.filter((p) => hiddenIds.has(p.id)),
    [products, hiddenIds],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const hideSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      await onHide(ids);
      toast.success(`Hid ${ids.length} product${ids.length > 1 ? "s" : ""} from your portal`);
      exitSelect();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't hide");
    }
  };

  if (loading) {
    return (
      <div className="grid gap-3 grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!products.length) {
    return (
      <div className="ax-card p-12 text-center">
        <Shirt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">
          No products linked to you yet. Once your merch is live, it'll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Top-right multi-select bubble */}
      <div className="flex items-center justify-end gap-2 mb-3">
        {hidden.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHiddenTray((v) => !v)}
            className="text-xs text-muted-foreground hover:text-accent uppercase tracking-wider tap-target"
          >
            {showHiddenTray ? "Close" : `Hidden (${hidden.length})`}
          </button>
        )}
        {selectMode ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              onClick={hideSelected}
              disabled={selected.size === 0}
              className="h-8 text-xs"
            >
              <EyeOff className="h-3.5 w-3.5 mr-1.5" /> Hide
            </Button>
            <Button size="sm" variant="ghost" onClick={exitSelect} className="h-8 text-xs">
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectMode(true)}
            className="h-8 text-xs rounded-full"
          >
            <Check className="h-3.5 w-3.5 mr-1.5" /> Select
          </Button>
        )}
      </div>

      {showHiddenTray && hidden.length > 0 && (
        <div className="ax-card p-3 mb-4 bg-[hsl(var(--dark))]/40">
          <div className="ax-label mb-2">Hidden from your portal</div>
          <div className="flex flex-wrap gap-2">
            {hidden.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  onUnhide([p.id])
                    .then(() => toast.success("Restored"))
                    .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"))
                }
                className="group flex items-center gap-2 px-2 py-1.5 rounded-md border border-border hover:border-accent text-xs"
              >
                <Undo2 className="h-3 w-3 text-accent" />
                <span className="truncate max-w-[160px]">{p.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {visible.map((p, i) => {
          const isSelected = selected.has(p.id);
          return (
            <div
              key={p.id}
              className={cn(
                "stagger-fade relative",
                selectMode && "cursor-pointer",
              )}
              style={{ ["--i" as string]: i }}
              onClick={selectMode ? () => toggle(p.id) : undefined}
            >
              <div
                className={cn(
                  "rounded-xl transition-all",
                  selectMode && isSelected && "ring-2 ring-accent ring-offset-2 ring-offset-background",
                  selectMode && !isSelected && "opacity-80",
                )}
              >
                <div className={selectMode ? "pointer-events-none" : ""}>
                  <ProductCard product={p} />
                </div>
              </div>
              {selectMode && (
                <div
                  className={cn(
                    "absolute top-2 right-2 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                    isSelected
                      ? "bg-accent border-accent"
                      : "bg-background/80 border-border",
                  )}
                >
                  {isSelected && <Check className="h-3 w-3 text-accent-foreground" strokeWidth={3} />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="ax-card p-8 text-center text-sm text-muted-foreground">
          All products are hidden. Tap "Hidden" above to restore.
        </div>
      )}
    </div>
  );
}
