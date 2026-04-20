// Mobile-first. Test at 375px before merging.
//
// Lightweight pull-to-refresh. Attaches to window touch events and only
// engages when the page is scrolled to the very top. Calls onRefresh
// when the user pulls past `threshold` (px) and releases.
//
// Returns `pullPx` so the caller can render an indicator if desired.
// Skip entirely on non-touch / desktop.

import { useEffect, useRef, useState } from "react";

interface Options {
  enabled?: boolean;
  threshold?: number; // distance to trigger refresh
  onRefresh: () => void | Promise<void>;
}

export function usePullToRefresh({
  enabled = true,
  threshold = 70,
  onRefresh,
}: Options) {
  const startY = useRef<number | null>(null);
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    // Skip on devices without touch — keeps desktop alone.
    if (!("ontouchstart" in window)) return;

    function onStart(e: TouchEvent) {
      if (window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0]?.clientY ?? null;
    }
    function onMove(e: TouchEvent) {
      if (startY.current == null) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy > 0 && window.scrollY <= 0) {
        // Resistance curve — feels native
        setPullPx(Math.min(dy * 0.5, threshold * 1.5));
      }
    }
    async function onEnd() {
      if (startY.current == null) return;
      const triggered = pullPx >= threshold && !refreshing;
      startY.current = null;
      setPullPx(0);
      if (triggered) {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [enabled, threshold, onRefresh, pullPx, refreshing]);

  return { pullPx, refreshing };
}
