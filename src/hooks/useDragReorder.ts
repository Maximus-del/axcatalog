// Drag to reorder a grid, using native HTML5 drag events — no dependency.
//
// The list is reordered optimistically as you drag over a target, so the grid
// shows the result before you drop rather than after. Persistence happens once,
// on drop, with the final order.
import { useCallback, useRef, useState } from "react";

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export interface DragReorder<T> {
  items: T[];
  draggingIndex: number | null;
  overIndex: number | null;
  /** Spread onto each grid item. */
  itemProps: (index: number) => {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

/**
 * `source` is the server order; local state only diverges while dragging, so an
 * external refresh doesn't fight the user mid-drag.
 */
export function useDragReorder<T>(
  source: T[],
  onCommit: (ordered: T[]) => void | Promise<void>,
  options: { disabled?: boolean } = {},
): DragReorder<T> {
  const [working, setWorking] = useState<T[] | null>(null);
  const dragging = useRef<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const items = working ?? source;

  const itemProps = useCallback(
    (index: number) => ({
      draggable: !options.disabled,
      onDragStart: (e: React.DragEvent) => {
        if (options.disabled) return;
        dragging.current = index;
        setDraggingIndex(index);
        setWorking(source.slice());
        e.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag without data set.
        e.dataTransfer.setData("text/plain", String(index));
      },
      onDragEnter: (e: React.DragEvent) => {
        if (options.disabled || dragging.current === null) return;
        e.preventDefault();
        setOverIndex(index);
        setWorking((prev) => {
          const base = prev ?? source;
          const from = dragging.current!;
          if (from === index) return base;
          const next = moveItem(base, from, index);
          dragging.current = index;
          setDraggingIndex(index);
          return next;
        });
      },
      onDragOver: (e: React.DragEvent) => {
        if (options.disabled || dragging.current === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDragEnd: () => {
        dragging.current = null;
        setDraggingIndex(null);
        setOverIndex(null);
        setWorking(null);
      },
      onDrop: (e: React.DragEvent) => {
        if (options.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        const finalOrder = working;
        dragging.current = null;
        setDraggingIndex(null);
        setOverIndex(null);
        setWorking(null);
        if (finalOrder) void onCommit(finalOrder);
      },
    }),
    [source, working, onCommit, options.disabled],
  );

  return { items, draggingIndex, overIndex, itemProps };
}
