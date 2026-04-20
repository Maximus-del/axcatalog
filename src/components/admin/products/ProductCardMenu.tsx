import { Archive, Edit3, Eye, EyeOff, MoreHorizontal, Tag } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface Props {
  isHidden: boolean;
  isAdmin: boolean;
  isArchived: boolean;
  onViewDetails: () => void;
  onEditTitle: () => void;
  onManageTags: (anchor: HTMLElement) => void;
  onToggleHidden: () => void;
  onArchive: () => void;
}

/**
 * Always-visible 3-dot menu in the top-right of a product card.
 * Clicking the trigger does NOT propagate (so it never selects the card
 * in bulk mode or opens the detail drawer).
 */
export function ProductCardMenu({
  isHidden,
  isAdmin,
  isArchived,
  onViewDetails,
  onEditTitle,
  onManageTags,
  onToggleHidden,
  onArchive,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Product actions"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute top-2 right-2 z-10 h-7 w-7 inline-flex items-center justify-center rounded-md",
            "bg-background/70 backdrop-blur-sm border border-border/50",
            "text-muted-foreground/80 hover:text-foreground hover:bg-background",
            "transition-colors",
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={onViewDetails}>
          <Eye className="h-4 w-4 mr-2" /> View details
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onSelect={onEditTitle}>
            <Edit3 className="h-4 w-4 mr-2" /> Edit title
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={(e) => {
            // We need the trigger's bounding rect for the popover anchor.
            const trigger = (e.target as HTMLElement)
              ?.closest("[role='menu']")
              ?.parentElement?.querySelector("button[aria-label='Product actions']") as HTMLElement | null;
            if (trigger) onManageTags(trigger);
          }}
        >
          <Tag className="h-4 w-4 mr-2" /> Manage tags
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onToggleHidden}>
              {isHidden ? (
                <>
                  <Eye className="h-4 w-4 mr-2" /> Show on dashboard
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4 mr-2" /> Hide from dashboard
                </>
              )}
            </DropdownMenuItem>
            {!isArchived && (
              <DropdownMenuItem
                onSelect={onArchive}
                className="text-destructive focus:text-destructive"
              >
                <Archive className="h-4 w-4 mr-2" /> Archive product
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
