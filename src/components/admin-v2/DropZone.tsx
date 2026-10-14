import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { filesFromDrop } from "@/lib/v2/drop-files";

// DROP A FOLDER ON A SECTION.
//
// Wraps a section rather than replacing it: the section keeps rendering what it
// always did, and a drag only reveals the target. A permanent dashed rectangle
// taking up space on a shelf that already has forty things on it is clutter
// pretending to be an affordance.
//
// dragenter/dragleave fire for every child element the pointer crosses, so the
// naive version flickers the overlay on and off as you move across a grid. A
// depth counter is the standard fix and the reason this is a component rather
// than four lines in each caller.
//
// AN INVISIBLE AFFORDANCE IS NOT AN AFFORDANCE.
//
// The first version only revealed itself once a drag was already in flight,
// which is useless: you cannot discover that a card accepts files by dragging
// files at every card to find out. `<DropTrigger>` is the visible half — a
// quiet control that says so and opens a file picker on click, so the feature
// also works for somebody who has the files in a dialog rather than a window,
// or who is on a device with no drag at all.

export default function DropZone({
  onFiles,
  disabled,
  label,
  busy,
  children,
  className = "",
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** What dropping here will do, e.g. "Add to Darnell's inspiration". */
  label: string;
  busy?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  const reset = useCallback(() => {
    depth.current = 0;
    setOver(false);
  }, []);

  if (disabled) return <div className={className}>{children}</div>;

  return (
    <div
      className={`relative ${className}`}
      onDragEnter={(e) => {
        // Only react to a drag carrying files. Dragging a mockup card around
        // the shelf must not light up every upload target on the page.
        if (!Array.from(e.dataTransfer.types ?? []).includes("Files")) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types ?? []).includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!Array.from(e.dataTransfer.types ?? []).includes("Files")) return;
        e.preventDefault();
        depth.current -= 1;
        if (depth.current <= 0) reset();
      }}
      onDrop={(e) => {
        if (!Array.from(e.dataTransfer.types ?? []).includes("Files")) return;
        e.preventDefault();
        reset();
        void filesFromDrop(e.dataTransfer).then((files) => {
          if (files.length > 0) onFiles(files);
        });
      }}
    >
      {children}

      {(over || busy) && (
        <div
          className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed backdrop-blur-[1px] transition-colors ${
            busy
              ? "border-[hsl(var(--ax-accent)/0.5)] bg-[hsl(var(--ax-canvas)/0.75)]"
              : "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]"
          }`}
        >
          <div className="flex items-center gap-2 rounded-full bg-[hsl(var(--ax-card))] px-4 py-2 text-[12px] font-semibold text-[hsl(var(--ax-ink))] shadow-lg">
            <Upload className={`h-3.5 w-3.5 text-[hsl(var(--ax-accent))] ${busy ? "animate-pulse" : ""}`} />
            {busy ? "Uploading…" : label}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The visible half of a drop zone.
 *
 * Deliberately small and quiet — it sits in a section header, not across the
 * middle of a shelf. Clicking opens a plain multi-file picker; folders still
 * need a drag, because no browser exposes a directory through a file input in
 * a way that works everywhere, and the label says which is which rather than
 * pretending otherwise.
 */
export function DropTrigger({
  onFiles,
  busy,
  children = "Add files",
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  children?: ReactNode;
}) {
  const inputId = useId();
  return (
    <label
      htmlFor={inputId}
      title="Click to pick files, or drag a folder onto this section"
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[11.5px] text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent)/0.6)] hover:text-[hsl(var(--ax-ink))] ${
        busy ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <Upload className={`h-3 w-3 ${busy ? "animate-pulse" : ""}`} />
      {busy ? "Uploading…" : children}
      <input
        id={inputId}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Reset so picking the same folder twice in a row still fires.
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </label>
  );
}
