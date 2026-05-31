// Mobile-first. Test at 375px before merging.
import { useRef, useState } from "react";
import { Archive, Download, Edit3, Eye, EyeOff, MoreHorizontal, Tag } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";

interface Props {
  isHidden: boolean;
  isAdmin: boolean;
  isArchived: boolean;
  onViewDetails: () => void;
  onEditTitle: () => void;
  onManageTags: (anchor: HTMLElement) => void;
  onToggleHidden: () => void;
  onArchive: () => void;
  /** When provided, shows a "Fetch image" action (used for products with image issues). */
  onFetchImage?: () => void;
  fetchImageBusy?: boolean;
}

/**
 * Always-visible 3-dot menu in the top-right of a product card.
 * - Desktop: dropdown menu
 * - Mobile (<768px): full-width bottom sheet with large 56px tap targets
 *
 * Click on trigger does NOT propagate so it never selects the card in
 * bulk mode or opens the detail drawer.
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
  onFetchImage,
  fetchImageBusy = false,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const triggerCls = cn(
    "absolute top-2 right-2 z-10 h-8 w-8 inline-flex items-center justify-center rounded-md",
    "bg-background/70 backdrop-blur-sm border border-border/50",
    "text-muted-foreground/80 hover:text-foreground hover:bg-background",
    "transition-colors pressable",
  );

  function callAndClose(fn: () => void) {
    setSheetOpen(false);
    haptic.tap();
    // Allow the sheet to start closing before mounting any anchored UI
    setTimeout(fn, 50);
  }

  if (isMobile) {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Product actions"
          onClick={(e) => {
            e.stopPropagation();
            haptic.tap();
            setSheetOpen(true);
          }}
          className={triggerCls}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
            <SheetHeader className="text-left">
              <SheetTitle>Product actions</SheetTitle>
            </SheetHeader>
            <ul className="mt-4 divide-y divide-border">
              <li>
                <button
                  type="button"
                  onClick={() => callAndClose(onViewDetails)}
                  className="pressable w-full h-14 flex items-center gap-3 px-1 text-base text-foreground"
                >
                  <Eye className="h-5 w-5 text-muted-foreground" />
                  View details
                </button>
              </li>
              {isAdmin && (
                <li>
                  <button
                    type="button"
                    onClick={() => callAndClose(onEditTitle)}
                    className="pressable w-full h-14 flex items-center gap-3 px-1 text-base text-foreground"
                  >
                    <Edit3 className="h-5 w-5 text-muted-foreground" />
                    Edit title
                  </button>
                </li>
              )}
              <li>
                <button
                  type="button"
                  onClick={() =>
                    callAndClose(() => triggerRef.current && onManageTags(triggerRef.current))
                  }
                  className="pressable w-full h-14 flex items-center gap-3 px-1 text-base text-foreground"
                >
                  <Tag className="h-5 w-5 text-muted-foreground" />
                  Manage tags
                </button>
              </li>
              {isAdmin && onFetchImage && (
                <li>
                  <button
                    type="button"
                    disabled={fetchImageBusy}
                    onClick={() => callAndClose(onFetchImage)}
                    className="pressable w-full h-14 flex items-center gap-3 px-1 text-base text-foreground disabled:opacity-60"
                  >
                    <Download className="h-5 w-5 text-muted-foreground" />
                    {fetchImageBusy ? "Fetching…" : "Fetch image"}
                  </button>
                </li>
              )}
              {isAdmin && (
                <>
                  <li>
                    <button
                      type="button"
                      onClick={() => callAndClose(onToggleHidden)}
                      className="pressable w-full h-14 flex items-center gap-3 px-1 text-base text-foreground"
                    >
                      {isHidden ? (
                        <Eye className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <EyeOff className="h-5 w-5 text-muted-foreground" />
                      )}
                      {isHidden ? "Show on dashboard" : "Hide from dashboard"}
                    </button>
                  </li>
                  {!isArchived && (
                    <li>
                      <button
                        type="button"
                        onClick={() => callAndClose(onArchive)}
                        className="pressable w-full h-14 flex items-center gap-3 px-1 text-base text-destructive"
                      >
                        <Archive className="h-5 w-5" />
                        Archive product
                      </button>
                    </li>
                  )}
                </>
              )}
            </ul>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Product actions"
          onClick={(e) => e.stopPropagation()}
          className={triggerCls}
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
          onSelect={() => {
            if (triggerRef.current) onManageTags(triggerRef.current);
          }}
        >
          <Tag className="h-4 w-4 mr-2" /> Manage tags
        </DropdownMenuItem>
        {isAdmin && onFetchImage && (
          <DropdownMenuItem
            disabled={fetchImageBusy}
            onSelect={onFetchImage}
          >
            <Download className="h-4 w-4 mr-2" />
            {fetchImageBusy ? "Fetching…" : "Fetch image"}
          </DropdownMenuItem>
        )}
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
