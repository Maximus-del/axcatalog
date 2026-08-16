// Reusable drag-and-drop file zone.
//
// Returns { isOver, dropProps } that you spread onto the wrapper element.
// We use a counter to avoid the "flicker" caused by dragenter/dragleave
// firing on every child element.
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

interface Options {
  /**
   * Called when files are dropped. Files are pre-filtered by `accept`
   * if provided.
   */
  onFiles: (files: File[]) => void;
  /**
   * Called when image URLs are dropped — i.e. an image dragged straight from
   * another browser tab, which arrives as a link rather than a file. Opt in by
   * providing this; without it, link drags are ignored exactly as before.
   */
  onUrls?: (urls: string[]) => void;
  /**
   * Optional MIME prefix(es) to accept (e.g. ["image/", "video/"]).
   * If omitted, all files pass through.
   */
  accept?: string[];
  /** Disable the drop zone entirely. */
  disabled?: boolean;
  /**
   * Also accept Ctrl/Cmd+V while mounted. Screenshots and AI output usually
   * arrive on the clipboard, never as a file on disk, so pasting is often the
   * fastest path in and the only one that doesn't require saving first.
   */
  paste?: boolean;
}

/**
 * Pull image URLs out of a link drag. Browsers describe the same drag several
 * ways; text/html is the reliable one for an <img> dragged from a page, since
 * uri-list sometimes carries the page link rather than the image.
 */
function extractUrls(dt: DataTransfer | null): string[] {
  if (!dt) return [];
  const urls: string[] = [];

  const html = dt.getData("text/html");
  if (html) {
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) urls.push(m[1]);
  }

  const uriList = dt.getData("text/uri-list");
  if (uriList) {
    for (const line of uriList.split(/\r?\n/)) {
      const t = line.trim();
      if (t && !t.startsWith("#")) urls.push(t);
    }
  }

  if (urls.length === 0) {
    const plain = dt.getData("text/plain")?.trim();
    if (plain && /^https?:\/\//i.test(plain)) urls.push(plain);
  }

  return Array.from(new Set(urls.filter((u) => /^https?:\/\//i.test(u) || u.startsWith("data:image/"))));
}

export function useFileDropZone({ onFiles, onUrls, accept, disabled, paste }: Options) {
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

  // A link drag only counts when the caller opted into URLs.
  const interesting = useCallback(
    (e: DragEvent) => {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      if (types.includes("Files")) return true;
      return !!onUrls && (types.includes("text/uri-list") || types.includes("text/html") || types.includes("text/plain"));
    },
    [onUrls],
  );

  const onDragEnter = useCallback(
    (e: DragEvent) => {
      if (disabled) return;
      if (!interesting(e)) return;
      e.preventDefault();
      counter.current += 1;
      setIsOver(true);
    },
    [disabled, interesting],
  );

  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (disabled) return;
      if (!interesting(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [disabled, interesting],
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
      if (filtered.length > 0) {
        onFiles(filtered);
        return;
      }
      // No files — this was a link drag from another tab.
      if (onUrls) {
        const urls = extractUrls(e.dataTransfer);
        if (urls.length > 0) onUrls(urls);
      }
    },
    [disabled, matchesAccept, onFiles, onUrls],
  );

  // Clipboard images. Ignored while typing in a text field, so pasting a prompt
  // into a textarea never gets mistaken for pasting an image.
  useEffect(() => {
    if (!paste || disabled) return;

    function onPaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      const items = Array.from(e.clipboardData?.items ?? []);
      const files = items
        .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter((f): f is File => !!f)
        .filter(matchesAccept)
        .map((f, idx) =>
          // Clipboard files are usually named "image.png" or nothing at all.
          f.name && f.name !== "image.png"
            ? f
            : new File([f], `pasted-${Date.now()}-${idx + 1}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: f.type }),
        );

      if (files.length > 0) {
        e.preventDefault();
        onFiles(files);
        return;
      }

      if (onUrls) {
        const text = e.clipboardData?.getData("text/plain")?.trim();
        if (text && /^https?:\/\/\S+\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(text)) {
          e.preventDefault();
          onUrls([text]);
        }
      }
    }

    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [paste, disabled, matchesAccept, onFiles, onUrls]);

  return {
    isOver,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop },
  };
}
