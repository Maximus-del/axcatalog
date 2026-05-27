import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Rubber-band (marquee) selection for any grid.
 *
 * Attach `containerProps` to a scrollable container, and put
 * `data-marquee-id="<id>"` on each selectable child. The hook tracks
 * pointer-drag and reports which ids are currently inside the rectangle.
 *
 * - A drag must start on empty space inside the container (not on a
 *   selectable item, button, link, input, etc.) so normal clicks still work.
 * - Holding Shift adds to existing selection; otherwise selection is replaced.
 * - The marquee rectangle is rendered as an overlay element returned as
 *   `overlay` — render it inside the container (it's absolutely positioned).
 */
export function useMarqueeSelection(opts: {
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Called the first time a drag actually selects something. */
  onActivate?: () => void;
  /** Disable the marquee entirely (e.g. on mobile). */
  disabled?: boolean;
}) {
  const { selected, onChange, onActivate, disabled } = opts;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<{
    startX: number;
    startY: number;
    additive: boolean;
    baseline: Set<string>;
    active: boolean;
  } | null>(null);
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  const compute = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    const st = stateRef.current;
    if (!container || !st) return;
    const bounds = container.getBoundingClientRect();
    const curX = clientX - bounds.left + container.scrollLeft;
    const curY = clientY - bounds.top + container.scrollTop;
    const left = Math.min(st.startX, curX);
    const top = Math.min(st.startY, curY);
    const width = Math.abs(curX - st.startX);
    const height = Math.abs(curY - st.startY);

    // Only consider it a "drag" past a small threshold so single clicks pass through.
    if (!st.active && width < 4 && height < 4) return;
    if (!st.active) {
      st.active = true;
      onActivate?.();
    }

    setRect({ left, top, width, height });

    const right = left + width;
    const bottom = top + height;
    const items = container.querySelectorAll<HTMLElement>("[data-marquee-id]");
    const next = new Set(st.baseline);
    items.forEach((el) => {
      const id = el.dataset.marqueeId;
      if (!id) return;
      const r = el.getBoundingClientRect();
      const ix = r.left - bounds.left + container.scrollLeft;
      const iy = r.top - bounds.top + container.scrollTop;
      const ir = ix + r.width;
      const ib = iy + r.height;
      const intersects = ix < right && ir > left && iy < bottom && ib > top;
      if (intersects) {
        if (st.additive && st.baseline.has(id)) next.delete(id);
        else next.add(id);
      }
    });
    onChange(next);
  }, [onActivate, onChange]);

  useEffect(() => {
    if (disabled) return;
    function onMove(e: PointerEvent) {
      if (!stateRef.current) return;
      compute(e.clientX, e.clientY);
    }
    function onUp() {
      stateRef.current = null;
      setRect(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    function onDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const container = containerRef.current;
      if (!container) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Ignore drags that begin on interactive content
      if (
        target.closest(
          "[data-marquee-id], button, a, input, textarea, select, [role='button'], [data-no-marquee]",
        )
      ) {
        return;
      }
      const bounds = container.getBoundingClientRect();
      stateRef.current = {
        startX: e.clientX - bounds.left + container.scrollLeft,
        startY: e.clientY - bounds.top + container.scrollTop,
        additive: e.shiftKey || e.metaKey || e.ctrlKey,
        baseline: new Set(selected),
        active: false,
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp, { once: true });
    }
    const node = containerRef.current;
    if (!node) return;
    node.addEventListener("pointerdown", onDown);
    return () => {
      node.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [compute, disabled, selected]);

  return {
    containerRef,
    overlay: rect ? (
      <div
        aria-hidden
        className="pointer-events-none absolute z-30 rounded-sm border border-accent bg-accent/15"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }}
      />
    ) : null,
    isDragging: rect != null,
  };
}