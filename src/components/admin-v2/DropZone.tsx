import { useCallback, useRef, useState, type ReactNode } from "react";
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
