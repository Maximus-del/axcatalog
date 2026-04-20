// Mobile-first. Test at 375px before merging.
//
// Generic swipe-to-reveal-action wrapper. Drag left to expose a single
// destructive action on the right (iOS Mail style). Releasing past the
// commit threshold fires `onAction`. Touch-only — no-ops on desktop.

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  /** Hidden behind the row, revealed on swipe-left. */
  actionLabel: string;
  /** Fired when the user swipes past the commit threshold and lifts. */
  onAction: () => void;
  /** Disable on desktop or when in a multi-select mode. */
  disabled?: boolean;
  className?: string;
}

const COMMIT_PX = 96;
const MAX_PX = 140;

export function Swipeable({
  children,
  actionLabel,
  onAction,
  disabled = false,
  className,
}: Props) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const horizontal = useRef<boolean | null>(null);
  const [offset, setOffset] = useState(0);

  function reset() {
    startX.current = null;
    startY.current = null;
    horizontal.current = null;
    setOffset(0);
  }

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return;
    startX.current = e.touches[0]?.clientX ?? null;
    startY.current = e.touches[0]?.clientY ?? null;
    horizontal.current = null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (disabled || startX.current == null) return;
    const dx = (e.touches[0]?.clientX ?? 0) - startX.current;
    const dy = (e.touches[0]?.clientY ?? 0) - (startY.current ?? 0);
    // Lock direction on first significant movement so vertical scroll wins
    if (horizontal.current == null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      horizontal.current = Math.abs(dx) > Math.abs(dy);
      if (!horizontal.current) {
        startX.current = null;
        return;
      }
    }
    if (dx < 0) {
      setOffset(Math.max(dx, -MAX_PX));
    } else {
      setOffset(0);
    }
  }
  function onTouchEnd() {
    if (offset <= -COMMIT_PX) {
      onAction();
    }
    reset();
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Hidden action background */}
      {offset < -8 && (
        <div className="absolute inset-y-0 right-0 flex items-center justify-end pr-4 bg-destructive text-destructive-foreground text-sm font-semibold uppercase tracking-wider">
          {actionLabel}
        </div>
      )}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={reset}
        style={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 ? "transform 180ms ease-out" : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
