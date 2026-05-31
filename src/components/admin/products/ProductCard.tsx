// Mobile-first. Test at 375px before merging.
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { Checkbox } from "@/components/ui/checkbox";
import { statusBadgeClass, formatStatus, type ProductStatus } from "@/lib/product-status";
import { ProductCardMenu } from "./ProductCardMenu";
import { Swipeable } from "@/components/mobile/Swipeable";
import { useIsMobile } from "@/hooks/use-mobile";
import { haptic } from "@/lib/haptics";

interface ProductCardProps {
  id: string;
  title: string;
  price: number | null;
  compareAtPrice: number | null;
  status: ProductStatus;
  imageUrl: string | null;
  isHidden?: boolean;
  hasImageWarning?: boolean;
  isAdmin?: boolean;
  bulkMode?: boolean;
  selected?: boolean;
  onClick: () => void;
  onToggleHidden?: () => void;
  onOpenTagPopover?: (anchor: HTMLElement) => void;
  onViewDetails?: () => void;
  onEditTitle?: () => void;
  onArchive?: () => void;
  /** Optional "Fetch image" quick action — typically passed when hasImageWarning is true. */
  onFetchImage?: () => void;
  fetchImageBusy?: boolean;
}

export function ProductCard({
  title,
  price,
  compareAtPrice,
  status,
  imageUrl,
  isHidden = false,
  hasImageWarning = false,
  isAdmin = false,
  bulkMode = false,
  selected = false,
  onClick,
  onToggleHidden,
  onOpenTagPopover,
  onViewDetails,
  onEditTitle,
  onArchive,
  onFetchImage,
  fetchImageBusy = false,
}: ProductCardProps) {
  const isMobile = useIsMobile();
  // Swipe-to-archive only makes sense for admins on touch devices,
  // when not already archived and not in bulk-select mode.
  const swipeEnabled =
    isMobile && isAdmin && !bulkMode && status !== "archived" && !!onArchive;

  const card = (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "group relative text-left bg-card border rounded-xl overflow-hidden transition-all duration-200 cursor-pointer pressable",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-accent ring-2 ring-accent/40 shadow-[0_8px_24px_-12px_hsl(var(--accent)/0.5)]"
          : "border-border hover:border-accent hover:shadow-[0_8px_24px_-12px_hsl(var(--accent)/0.4)] hover:-translate-y-0.5",
        isHidden && "opacity-50 saturate-50 hover:opacity-90",
      )}
    >
      {bulkMode && (
        <div
          className="absolute top-2 left-2 z-20 bg-background/80 backdrop-blur-sm rounded p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={onClick}
            aria-label={`Select ${title}`}
            className="h-5 w-5"
          />
        </div>
      )}

      <div className="relative aspect-square overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className="h-full w-full flex items-center justify-center text-3xl font-bold text-white"
            style={{ backgroundColor: avatarColorFor(title) }}
            aria-hidden
          >
            {initialsFor(title)}
          </div>
        )}

        {/* Hidden badge — top-left, only when applicable */}
        {isHidden && (
          <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-background/80 backdrop-blur-sm border border-border text-muted-foreground">
            <EyeOff className="h-3 w-3" /> Hidden
          </span>
        )}

        {/* Image warning — top-left (under Hidden if both) */}
        {hasImageWarning && (
          <span
            title="Some Shopify images are orphaned or failed to refresh"
            className={cn(
              "absolute z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]",
              "bg-destructive/15 text-destructive border border-destructive/40 backdrop-blur-sm",
              isHidden ? "top-9 left-2" : "top-2 left-2",
            )}
          >
            <AlertTriangle className="h-3 w-3" /> Image issue
          </span>
        )}

        {/* Status pill — bottom-left, subtle */}
        <span
          className={cn(
            "absolute bottom-2 left-2 z-10 inline-flex px-2 py-0.5 rounded-full text-[10px] border capitalize backdrop-blur-sm",
            statusBadgeClass(status),
          )}
        >
          {formatStatus(status)}
        </span>

        {/* 3-dot menu — always visible, top-right */}
        {!bulkMode && onViewDetails && onEditTitle && onOpenTagPopover && onToggleHidden && onArchive && (
          <ProductCardMenu
            isHidden={isHidden}
            isAdmin={isAdmin}
            isArchived={status === "archived"}
            onViewDetails={onViewDetails}
            onEditTitle={onEditTitle}
            onManageTags={onOpenTagPopover}
            onToggleHidden={onToggleHidden}
            onArchive={onArchive}
            onFetchImage={hasImageWarning && onFetchImage ? onFetchImage : undefined}
            fetchImageBusy={fetchImageBusy}
          />
        )}

        {/* Quick eye toggle — bottom-right.
            On desktop it's hover-only; on touch we leave it always visible
            so it's actually reachable (no hover state on a phone). */}
        {!bulkMode && isAdmin && onToggleHidden && (
          <button
            type="button"
            title={isHidden ? "Show on dashboard" : "Hide from dashboard"}
            aria-label={isHidden ? "Show on dashboard" : "Hide from dashboard"}
            onClick={(e) => {
              e.stopPropagation();
              haptic.tap();
              onToggleHidden();
            }}
            className={cn(
              "absolute bottom-2 right-2 z-10 h-9 w-9 inline-flex items-center justify-center rounded-md",
              "bg-background/80 backdrop-blur-sm border border-border",
              "text-muted-foreground hover:text-accent hover:border-accent",
              "md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity pressable",
            )}
          >
            {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-accent transition-colors">
          {title}
        </h3>
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-sm font-semibold text-foreground">
            {price != null ? `$${price.toFixed(2)}` : "—"}
          </span>
          {compareAtPrice != null && price != null && compareAtPrice > price && (
            <span className="text-xs text-muted-foreground line-through">
              ${compareAtPrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (swipeEnabled && onArchive) {
    return (
      <Swipeable
        actionLabel="Archive"
        onAction={() => {
          haptic.warn();
          onArchive();
        }}
        className="rounded-xl"
      >
        {card}
      </Swipeable>
    );
  }

  return card;
}
