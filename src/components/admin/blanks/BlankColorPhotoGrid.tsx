// Fill in a blank's photography one slot at a time.
//
// Every colourway gets a front and a back tile. An empty tile takes a file
// three ways — click to browse, drag one on, or hover it and hit Ctrl+V —
// because when you're working through 92 trucker colourways the fastest input
// is whichever one your hands are already doing.
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Upload, X, Check, FolderOpen, LinkIcon, ExternalLink, Trash2, Maximize2, Replace } from "lucide-react";
import { toast } from "sonner";
import {
  clearColorPhoto,
  colorSlug,
  importMatchedFiles,
  isImportableImage,
  loadColorsFor,
  matchFilesToColors,
  planPhotoMove,
  applyColorPatches,
  normalizeUrl,
  hostOf,
  saveBlankUrl,
  uploadColorPhoto,
  type ColorRow,
  type SlotRef,
  type Surface,
} from "@/lib/ecosystem/blank-images";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { Input } from "@/components/ui/input";
import { ImageLightbox, type LightboxItem } from "@/components/admin/ecosystem/ImageLightbox";
import { cn } from "@/lib/utils";

export function BlankColorPhotoGrid({
  blankId, sku, styleNumber, productUrl, onChanged,
}: {
  blankId: string;
  sku: string | null;
  styleNumber?: string | null;
  productUrl?: string | null;
  onChanged?: () => void;
}) {
  const [colors, setColors] = useState<ColorRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"missing" | "all">("missing");
  // Ctrl+V needs a target; the tile under the cursor is the one you mean.
  const hovered = useRef<{ color: ColorRow; surface: Surface } | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [dragging, setDragging] = useState<SlotRef | null>(null);

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

  /** Drag a photo onto another slot: swap if occupied, move if empty. */
  async function movePhoto(from: SlotRef, to: SlotRef) {
    if (!colors) return;
    const patches = planPhotoMove(colors, from, to);
    if (patches.length === 0) return;
    setBusy(`${to.colorId}:${to.surface}`);
    try {
      await applyColorPatches(patches);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move that photo");
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

  // Everything currently on screen, so arrow keys walk the whole blank rather
  // than trapping you on one colourway.
  const photos: LightboxItem[] = shown.flatMap((c) => {
    const out: LightboxItem[] = [];
    if (c.image_url) out.push({ id: `${c.id}:front`, url: c.image_url, title: `${c.color_name} — front` });
    if (c.image_url_back) out.push({ id: `${c.id}:back`, url: c.image_url_back, title: `${c.color_name} — back` });
    return out;
  });

  return (
    <div className="p-4 space-y-4 bg-[hsl(var(--ax-line)/0.35)]">
      <ProductLinkRow blankId={blankId} url={productUrl ?? null} onSaved={onChanged} />

      <FolderDrop
        sku={sku}
        styleNumber={styleNumber}
        colors={colors}
        onDone={async () => { await load(); onChanged?.(); }}
      />

      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground">
          {incomplete.length === 0
            ? "Every colourway has both views."
            : `${incomplete.length} of ${colors.length} colourways still need a photo.`}
        </span>
        {/* Only offer the filter when it would actually change what's on
            screen. With every colourway missing, both states show the same
            tiles — a control that flips its own label while doing nothing is
            worse than no control. */}
        {incomplete.length > 0 && incomplete.length < colors.length && (
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
              {(["front", "back"] as Surface[]).map((surface) => {
                const url = surface === "back" ? c.image_url_back : c.image_url;
                return (
                  <Slot
                    key={surface}
                    color={c}
                    surface={surface}
                    url={url}
                    busy={busy === `${c.id}:${surface}`}
                    isDragging={dragging?.colorId === c.id && dragging.surface === surface}
                    onFile={(f) => put(c, surface, f)}
                    onClear={() => clear(c, surface)}
                    onHover={(on) => { hovered.current = on ? { color: c, surface } : null; }}
                    onPreview={() => {
                      const i = photos.findIndex((p) => p.id === `${c.id}:${surface}`);
                      if (i >= 0) setLightbox(i);
                    }}
                    onDragStartSlot={() => setDragging({ colorId: c.id, surface })}
                    onDragEndSlot={() => setDragging(null)}
                    onDropSlot={(from) => movePhoto(from, { colorId: c.id, surface })}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Only while something is in the air — a permanent bin invites accidents. */}
      {dragging && (
        <div
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
          onDrop={(e) => {
            e.preventDefault();
            const from = readSlotDrag(e.dataTransfer);
            setDragging(null);
            if (!from) return;
            const color = colors.find((x) => x.id === from.colorId);
            if (color) void clear(color, from.surface);
          }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 h-14 px-6 rounded-2xl border-2 border-dashed border-destructive bg-background/95 shadow-xl flex items-center gap-2 text-destructive font-semibold text-[13px]"
        >
          <Trash2 className="h-4 w-4" /> Drop here to remove
        </div>
      )}

      {lightbox !== null && photos.length > 0 && (
        <ImageLightbox
          items={photos}
          index={Math.min(lightbox, photos.length - 1)}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

/** Internal photo drags carry this, so a file drop is never mistaken for one. */
const SLOT_MIME = "application/x-ax-slot";

function readSlotDrag(dt: DataTransfer | null): SlotRef | null {
  const raw = dt?.getData(SLOT_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SlotRef;
    return parsed?.colorId ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Drop a whole folder for this one blank.
 *
 * Same matcher as the bulk importer, scoped to this blank's colourways — and
 * anything the matcher can't place is kept on screen with a dropdown rather
 * than discarded, so a vendor's odd naming costs one click instead of a
 * re-export.
 */
function FolderDrop({
  sku, styleNumber, colors, onDone,
}: {
  sku: string | null;
  styleNumber?: string | null;
  colors: ColorRow[];
  onDone: () => Promise<void> | void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [manual, setManual] = useState<Record<string, { colorId: string; surface: Surface }>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  function take(incoming: File[]) {
    const images = incoming.filter(isImportableImage);
    const skipped = incoming.length - images.length;
    if (skipped > 0) toast.error(`${skipped} non-image file${skipped === 1 ? "" : "s"} ignored`);
    if (images.length) setFiles((prev) => [...prev, ...images]);
  }

  const { isOver, dropProps } = useFileDropZone({
    onFiles: take,
    accept: ["image/"],
    folders: true,
  });

  const report = useMemo(
    () => (files.length ? matchFilesToColors(files, colors, [styleNumber ?? ""].filter(Boolean)) : null),
    [files, colors, styleNumber],
  );

  async function run() {
    if (!report || !sku) { toast.error("This blank has no SKU"); return; }

    // Auto-matched, plus anything assigned by hand.
    const assigned = report.unmatched
      .map((u) => {
        const pick = manual[u.fileName];
        if (!pick?.colorId) return null;
        const color = colors.find((c) => c.id === pick.colorId);
        if (!color) return null;
        return { ...u, color, surface: pick.surface, colorSlug: colorSlug(color.color_name) };
      })
      .filter(Boolean) as typeof report.matched;

    const all = [...report.matched, ...assigned];
    if (all.length === 0) return;

    setBusy(true);
    setProgress({ done: 0, total: all.length });
    try {
      const out = await importMatchedFiles(sku, all, (done, total) => setProgress({ done, total }));
      if (out.imported) toast.success(`${out.imported} photo${out.imported === 1 ? "" : "s"} added`);
      if (out.failed.length) toast.error(`${out.failed.length} failed — ${out.failed[0].error}`);
      setFiles([]);
      setManual({});
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const assignedCount = Object.values(manual).filter((m) => m.colorId).length;
  const total = (report?.matched.length ?? 0) + assignedCount;

  return (
    <div
      {...dropProps}
      className={cn(
        "rounded-lg border border-dashed p-3 transition-colors",
        isOver ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.1)]" : "border-[hsl(var(--ax-border))]",
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <FolderOpen className="h-4 w-4 text-[hsl(var(--ax-faint))] shrink-0" />
        <span className="text-[12px] text-muted-foreground">
          Drag a folder in — or individual images — and they'll be matched to these colourways.
        </span>
        <label className="text-[12px] font-semibold text-[hsl(var(--ax-accent))] cursor-pointer">
          browse folder
          <input
            type="file"
            className="hidden"
            multiple
            // @ts-expect-error non-standard, supported where it matters
            webkitdirectory=""
            onChange={(e) => { take(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          />
        </label>
        <span className="text-[hsl(var(--ax-faint))] text-[12px]">·</span>
        <label className="text-[12px] font-semibold text-[hsl(var(--ax-accent))] cursor-pointer">
          files
          <input
            type="file" accept="image/*" multiple className="hidden"
            onChange={(e) => { take(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          />
        </label>
        {files.length > 0 && (
          <button onClick={() => { setFiles([]); setManual({}); }} className="text-[12px] text-muted-foreground hover:text-foreground ml-auto">
            Clear
          </button>
        )}
      </div>

      {report && (
        <div className="mt-3 space-y-2">
          <div className="text-[12px]">
            <span className="font-semibold text-[hsl(var(--ax-accent))]">{report.matched.length} matched</span>
            {report.unmatched.length > 0 && (
              <span className="text-amber-600"> · {report.unmatched.length} need a colour</span>
            )}
          </div>

          {report.unmatched.length > 0 && (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {report.unmatched.map((u) => {
                const pick = manual[u.fileName] ?? { colorId: "", surface: u.surface };
                return (
                  <li key={u.fileName} className="flex items-center gap-2 text-[12px]">
                    <span className="flex-1 min-w-0 truncate" title={u.fileName}>{u.fileName}</span>
                    <select
                      value={pick.colorId}
                      onChange={(e) => setManual((m) => ({ ...m, [u.fileName]: { ...pick, colorId: e.target.value } }))}
                      className="h-7 rounded-md border border-[hsl(var(--ax-border))] bg-transparent px-1.5 text-[11px] max-w-[160px]"
                    >
                      <option value="">— skip —</option>
                      {colors.map((c) => <option key={c.id} value={c.id}>{c.color_name}</option>)}
                    </select>
                    <select
                      value={pick.surface}
                      onChange={(e) => setManual((m) => ({ ...m, [u.fileName]: { ...pick, surface: e.target.value as Surface } }))}
                      className="h-7 rounded-md border border-[hsl(var(--ax-border))] bg-transparent px-1.5 text-[11px]"
                    >
                      <option value="front">front</option>
                      <option value="back">back</option>
                    </select>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {progress ? `Uploading ${progress.done} of ${progress.total}…` : `${files.length} file${files.length === 1 ? "" : "s"} staged`}
            </span>
            <button
              onClick={run}
              disabled={busy || total === 0}
              className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Add {total}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Slot({
  color, surface, url, busy, isDragging, onFile, onClear, onHover,
  onPreview, onDragStartSlot, onDragEndSlot, onDropSlot,
}: {
  color: ColorRow;
  surface: Surface;
  url: string | null;
  busy: boolean;
  isDragging: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
  onHover: (on: boolean) => void;
  onPreview: () => void;
  onDragStartSlot: () => void;
  onDragEndSlot: () => void;
  onDropSlot: (from: SlotRef) => void;
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
        // A photo dragged from another tile, or a file from the desktop.
        const from = readSlotDrag(e.dataTransfer);
        if (from) { onDropSlot(from); return; }
        const file = Array.from(e.dataTransfer.files ?? [])[0];
        if (file) onFile(file);
      }}
      className={cn("relative group", isDragging && "opacity-40")}
      title={`${color.color_name} — ${surface}`}
    >
      {url && !busy ? (
        // Filled: click previews, drag moves. Replacing is its own small
        // button, because opening a file picker when someone wanted a closer
        // look is the more annoying way round to get it wrong.
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(SLOT_MIME, JSON.stringify({ colorId: color.id, surface }));
            e.dataTransfer.effectAllowed = "move";
            onDragStartSlot();
          }}
          onDragEnd={onDragEndSlot}
          onClick={onPreview}
          className={cn(
            "block w-full aspect-square rounded-md border overflow-hidden bg-white cursor-grab active:cursor-grabbing",
            over ? "border-[hsl(var(--ax-accent))] ring-2 ring-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))]",
          )}
        >
          <img src={url} alt="" loading="lazy" className="h-full w-full object-cover pointer-events-none" />
        </button>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "block aspect-square rounded-md border cursor-pointer overflow-hidden transition-colors",
            over
              ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)]"
              : "border-dashed border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent))] bg-transparent",
          )}
        >
          {busy ? (
            <span className="h-full w-full flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </span>
          ) : (
            <span className="h-full w-full flex flex-col items-center justify-center gap-0.5 text-[hsl(var(--ax-faint))]">
              <Upload className="h-3.5 w-3.5" />
              <span className="text-[9px] uppercase tracking-wider">{surface}</span>
            </span>
          )}
        </label>
      )}

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
          <span className="absolute bottom-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] flex items-center justify-center pointer-events-none">
            <Check className="h-2.5 w-2.5" />
          </span>
          <span className="absolute bottom-0.5 right-0.5 opacity-0 group-hover:opacity-100 text-white/90 pointer-events-none">
            <Maximize2 className="h-3 w-3 drop-shadow" />
          </span>
          <label
            htmlFor={inputId}
            title="Replace"
            className="absolute -top-1 -left-1 h-4 w-4 rounded-full bg-black/80 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer"
          >
            <Replace className="h-2.5 w-2.5" />
          </label>
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

/**
 * The vendor product page for this blank.
 *
 * Kept on the blank rather than in someone's bookmarks because it is the
 * source of truth for colourway names and photography — the thing you reopen
 * every time a colour doesn't match or a photo is missing.
 */
function ProductLinkRow({
  blankId, url, onSaved,
}: {
  blankId: string;
  url: string | null;
  onSaved?: () => void;
}) {
  const [value, setValue] = useState(url ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setValue(url ?? ""); }, [url]);

  const dirty = value.trim() !== (url ?? "");
  const host = hostOf(url);

  async function save(next: string) {
    const cleaned = next.trim() === "" ? null : normalizeUrl(next);
    if (next.trim() !== "" && !cleaned) {
      toast.error("That doesn't look like a web address");
      return;
    }
    setSaving(true);
    try {
      await saveBlankUrl(blankId, cleaned);
      setValue(cleaned ?? "");
      toast.success(cleaned ? "Product link saved" : "Product link cleared");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally { setSaving(false); }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <LinkIcon className="h-4 w-4 shrink-0 text-[hsl(var(--ax-faint))]" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        // Pasting a link is the whole interaction — commit it without
        // making someone find a button afterwards.
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text.trim()) {
            e.preventDefault();
            setValue(text.trim());
            void save(text);
          }
        }}
        onKeyDown={(e) => { if (e.key === "Enter") void save(value); }}
        onBlur={() => { if (dirty) void save(value); }}
        placeholder="Vendor product page — paste the link here"
        className="h-8 text-[12px] flex-1 min-w-[220px]"
      />
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {url && !saving && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1 shrink-0"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {host ?? "Open"}
        </a>
      )}
    </div>
  );
}
