// Fill in a blank's photography one slot at a time.
//
// Every colourway gets a front and a back tile. An empty tile takes a file
// three ways — click to browse, drag one on, or hover it and hit Ctrl+V —
// because when you're working through 92 trucker colourways the fastest input
// is whichever one your hands are already doing.
import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, X, Check } from "lucide-react";
import { toast } from "sonner";
import {
  clearColorPhoto,
  colorSlug,
  isImportableImage,
  loadColorsFor,
  uploadColorPhoto,
  type ColorRow,
  type Surface,
} from "@/lib/ecosystem/blank-images";
import { cn } from "@/lib/utils";

export function BlankColorPhotoGrid({
  blankId, sku, onChanged,
}: {
  blankId: string;
  sku: string | null;
  onChanged?: () => void;
}) {
  const [colors, setColors] = useState<ColorRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"missing" | "all">("missing");
  // Ctrl+V needs a target; the tile under the cursor is the one you mean.
  const hovered = useRef<{ color: ColorRow; surface: Surface } | null>(null);

  async function load() {
    setColors(await loadColorsFor(blankId).catch(() => []));
  }
  useEffect(() => { void load(); }, [blankId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function put(color: ColorRow, surface: Surface, file: File) {
    if (!sku) { toast.error("This blank has no SKU, so photos have nowhere to go"); return; }
    if (!isImportableImage(file)) { toast.error("PNG, JPEG or WebP only"); return; }
    const key = `${color.id}:${surface}`;
    setBusy(key);
    try {
      await uploadColorPhoto({ sku, colorId: color.id, colorSlug: colorSlug(color.color_name), surface, file });
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(null); }
  }

  async function clear(color: ColorRow, surface: Surface) {
    const key = `${color.id}:${surface}`;
    setBusy(key);
    try {
      await clearColorPhoto(color.id, surface);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear");
    } finally { setBusy(null); }
  }

  // Paste anywhere on the page lands in whichever tile you're pointing at.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const target = hovered.current;
      if (!target) return;
      const file = Array.from(e.clipboardData?.files ?? [])[0];
      if (!file) return;
      e.preventDefault();
      void put(target.color, target.surface, file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [sku]); // eslint-disable-line react-hooks/exhaustive-deps

  if (colors === null) {
    return <div className="p-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }
  if (colors.length === 0) {
    return <p className="p-4 text-[12px] text-muted-foreground">No colourways on this blank yet.</p>;
  }

  const incomplete = colors.filter((c) => !c.image_url || !c.image_url_back);
  const shown = filter === "missing" && incomplete.length > 0 ? incomplete : colors;

  return (
    <div className="p-4 space-y-3 bg-[hsl(var(--ax-line)/0.35)]">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground">
          {incomplete.length === 0
            ? "Every colourway has both views."
            : `${incomplete.length} of ${colors.length} colourways still need a photo.`}
        </span>
        {incomplete.length > 0 && (
          <button
            onClick={() => setFilter((f) => (f === "missing" ? "all" : "missing"))}
            className="text-[11px] font-semibold text-[hsl(var(--ax-accent))] ml-auto"
          >
            {filter === "missing" ? `Show all ${colors.length}` : "Show only what's missing"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {shown.map((c) => (
          <div key={c.id} className="space-y-1">
            <div className="text-[11px] font-semibold truncate" title={c.color_name}>{c.color_name}</div>
            <div className="grid grid-cols-2 gap-1">
              {(["front", "back"] as Surface[]).map((surface) => (
                <Slot
                  key={surface}
                  color={c}
                  surface={surface}
                  url={surface === "back" ? c.image_url_back : c.image_url}
                  busy={busy === `${c.id}:${surface}`}
                  onFile={(f) => put(c, surface, f)}
                  onClear={() => clear(c, surface)}
                  onHover={(on) => { hovered.current = on ? { color: c, surface } : null; }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Slot({
  color, surface, url, busy, onFile, onClear, onHover,
}: {
  color: ColorRow;
  surface: Surface;
  url: string | null;
  busy: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
  onHover: (on: boolean) => void;
}) {
  const [over, setOver] = useState(false);
  const inputId = `slot-${color.id}-${surface}`;

  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => { onHover(false); setOver(false); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const file = Array.from(e.dataTransfer.files ?? [])[0];
        if (file) onFile(file);
      }}
      className="relative group"
      title={`${color.color_name} — ${surface}`}
    >
      <label
        htmlFor={inputId}
        className={cn(
          "block aspect-square rounded-md border cursor-pointer overflow-hidden transition-colors",
          over
            ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)]"
            : url
              ? "border-[hsl(var(--ax-border))] bg-white"
              : "border-dashed border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent))] bg-transparent",
        )}
      >
        {busy ? (
          <span className="h-full w-full flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </span>
        ) : url ? (
          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="h-full w-full flex flex-col items-center justify-center gap-0.5 text-[hsl(var(--ax-faint))]">
            <Upload className="h-3.5 w-3.5" />
            <span className="text-[9px] uppercase tracking-wider">{surface}</span>
          </span>
        )}
      </label>

      <input
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />

      {url && !busy && (
        <>
          <span className="absolute bottom-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] flex items-center justify-center">
            <Check className="h-2.5 w-2.5" />
          </span>
          <button
            type="button"
            onClick={onClear}
            aria-label={`Remove ${color.color_name} ${surface}`}
            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-black/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </>
      )}
    </div>
  );
}
