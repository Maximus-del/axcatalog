// Viewing artwork, not just confirming a file uploaded.
//
// Two things this exists for. Reference and design PNGs are usually transparent
// isolated artwork, which is invisible against a dark panel — so everything sits
// on a checkerboard. And a 100px thumbnail can't tell you whether a reference is
// any good, so any thumbnail opens full size.
import { useCallback, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

/** Standard transparency checkerboard, so alpha reads as alpha. */
export const CHECKERBOARD: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, #8a8a8a 25%, transparent 25%), linear-gradient(-45deg, #8a8a8a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #8a8a8a 75%), linear-gradient(-45deg, transparent 75%, #8a8a8a 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
  backgroundColor: "#b8b8b8",
};

export interface LightboxItem { id: string; url: string; title?: string | null }

export function ImageLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const count = items.length;
  const item = items[index];

  const step = useCallback(
    (delta: number) => {
      if (count === 0) return;
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, onClose]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/85 flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 p-4 text-white/80" onClick={(e) => e.stopPropagation()}>
        <div className="text-[13px] truncate">
          {item.title || "Reference"}
          {count > 1 && <span className="ml-2 text-white/50 tabular-nums">{index + 1} / {count}</span>}
        </div>
        <div className="flex items-center gap-3">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] inline-flex items-center gap-1 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open original
          </a>
          <button onClick={onClose} aria-label="Close" className="hover:text-white"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-6 gap-4" onClick={(e) => e.stopPropagation()}>
        {count > 1 && (
          <button onClick={() => step(-1)} aria-label="Previous" className="text-white/60 hover:text-white shrink-0">
            <ChevronLeft className="h-8 w-8" />
          </button>
        )}
        <div className="max-h-full max-w-[80vw] rounded-lg overflow-hidden" style={CHECKERBOARD}>
          <img src={item.url} alt={item.title ?? ""} className="max-h-[75vh] max-w-[80vw] object-contain block" />
        </div>
        {count > 1 && (
          <button onClick={() => step(1)} aria-label="Next" className="text-white/60 hover:text-white shrink-0">
            <ChevronRight className="h-8 w-8" />
          </button>
        )}
      </div>
    </div>
  );
}
