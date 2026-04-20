// Reusable drag-and-drop file zone.
//
// Returns { isOver, dropProps } that you spread onto the wrapper element.
// We use a counter to avoid the "flicker" caused by dragenter/dragleave
// firing on every child element.
import { useCallback, useRef, useState, type DragEvent } from "react";

interface Options {
  /**
   * Called when files are dropped. Files are pre-filtered by `accept`
   * if provided.
   */
  onFiles: (files: File[]) => void;
  /**
   * Optional MIME prefix(es) to accept (e.g. ["image/", "video/"]).
   * If omitted, all files pass through.
   */
  accept?: string[];
  /** Disable the drop zone entirely. */
  disabled?: boolean;
}

export function useFileDropZone({ onFiles, accept, disabled }: Options) {
  const [isOver, setIsOver] = useState(false);
  const counter = useRef(0);

  const matchesAccept = useCallback(
    (file: File) => {
      if (!accept || accept.length === 0) return true;
      const type = file.type || "";
      return accept.some((a) => type.startsWith(a));
    },
    [accept],
  );

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (disabled) return;
      // Only react if the drag actually contains files
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      counter.current += 1;
      setIsOver(true);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (disabled) return;
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [disabled],
  );

  const onDragLeave = useCallback(
    (e: DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      counter.current = Math.max(0, counter.current - 1);
      if (counter.current === 0) setIsOver(false);
    },
    [disabled],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (disabled) return;
      e.preventDefault();
      counter.current = 0;
      setIsOver(false);
      const all = Array.from(e.dataTransfer?.files ?? []);
      const filtered = all.filter(matchesAccept);
      if (filtered.length > 0) onFiles(filtered);
    },
    [disabled, matchesAccept, onFiles],
  );

  return {
    isOver,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
