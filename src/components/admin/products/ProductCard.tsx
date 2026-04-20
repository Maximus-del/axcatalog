import { Edit3, Eye, EyeOff, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { Checkbox } from "@/components/ui/checkbox";
import { statusBadgeClass, formatStatus, type ProductStatus } from "@/lib/product-status";

interface ProductCardProps {
  id: string;
  title: string;
  price: number | null;
  compareAtPrice: number | null;
  status: ProductStatus;
  imageUrl: string | null;
  isHidden?: boolean;
  bulkMode?: boolean;
  selected?: boolean;
  onClick: () => void;
  onToggleHidden?: () => void;
  onOpenTagPopover?: (anchor: HTMLElement) => void;
  onEdit?: () => void;
}

export function ProductCard({
  title,
  price,
  compareAtPrice,
  status,
  imageUrl,
  isHidden = false,
  bulkMode = false,
  selected = false,
  onClick,
  onToggleHidden,
  onOpenTagPopover,
  onEdit,
}: ProductCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative text-left bg-card border rounded-xl overflow-hidden transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-accent ring-2 ring-accent/40 shadow-[0_8px_24px_-12px_hsl(var(--accent)/0.5)]"
          : "border-border hover:border-accent hover:shadow-[0_8px_24px_-12px_hsl(var(--accent)/0.4)] hover:-translate-y-0.5",
        isHidden && "opacity-50 hover:opacity-80",
      )}
    >
      {bulkMode && (
        <div
          className="absolute top-2 left-2 z-10 bg-background/80 backdrop-blur-sm rounded p-1"
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
        <span
          className={cn(
            "absolute top-2 right-2 inline-flex px-2 py-0.5 rounded-full text-[10px] border capitalize backdrop-blur-sm",
            statusBadgeClass(status),
          )}
        >
          {formatStatus(status)}
        </span>

        {/* Quick actions — visible on hover, hidden in bulk mode to reduce clutter */}
        {!bulkMode && (onToggleHidden || onOpenTagPopover || onEdit) && (
          <div className="absolute top-9 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onToggleHidden && (
              <IconBtn
                label={isHidden ? "Show on dashboard" : "Hide from dashboard"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleHidden();
                }}
              >
                {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </IconBtn>
            )}
            {onOpenTagPopover && (
              <IconBtn
                label="Edit tags"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenTagPopover(e.currentTarget);
                }}
              >
                <Tag className="h-3.5 w-3.5" />
              </IconBtn>
            )}
            {onEdit && (
              <IconBtn
                label="Edit product"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Edit3 className="h-3.5 w-3.5" />
              </IconBtn>
            )}
          </div>
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
    </button>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="bg-background/80 hover:bg-accent hover:text-accent-foreground backdrop-blur-sm border border-border rounded-md p-1.5 transition-colors"
    >
      {children}
    </button>
  );
}
