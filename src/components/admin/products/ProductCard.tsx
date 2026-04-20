import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { Checkbox } from "@/components/ui/checkbox";
import { statusBadgeClass, formatStatus, type ProductStatus } from "@/lib/product-status";
import { ProductCardMenu } from "./ProductCardMenu";

interface ProductCardProps {
  id: string;
  title: string;
  price: number | null;
  compareAtPrice: number | null;
  status: ProductStatus;
  imageUrl: string | null;
  isHidden?: boolean;
  isAdmin?: boolean;
  bulkMode?: boolean;
  selected?: boolean;
  onClick: () => void;
  onToggleHidden?: () => void;
  onOpenTagPopover?: (anchor: HTMLElement) => void;
  onViewDetails?: () => void;
  onEditTitle?: () => void;
  onArchive?: () => void;
}

export function ProductCard({
  title,
  price,
  compareAtPrice,
  status,
  imageUrl,
  isHidden = false,
  isAdmin = false,
  bulkMode = false,
  selected = false,
  onClick,
  onToggleHidden,
  onOpenTagPopover,
  onViewDetails,
  onEditTitle,
  onArchive,
}: ProductCardProps) {
  return (
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
        "group relative text-left bg-card border rounded-xl overflow-hidden transition-all duration-200 cursor-pointer",
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
          />
        </div>
      )}

      <div className="relative aspect-square overflow-hidden bg-muted">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
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
          />
        )}

        {/* Quick eye toggle — bottom-right, hover-only shortcut */}
        {!bulkMode && isAdmin && onToggleHidden && (
          <button
            type="button"
            title={isHidden ? "Show on dashboard" : "Hide from dashboard"}
            aria-label={isHidden ? "Show on dashboard" : "Hide from dashboard"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleHidden();
            }}
            className={cn(
              "absolute bottom-2 right-2 z-10 h-7 w-7 inline-flex items-center justify-center rounded-md",
              "bg-background/80 backdrop-blur-sm border border-border",
              "text-muted-foreground hover:text-accent hover:border-accent",
              "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity",
            )}
          >
            {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
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
}
