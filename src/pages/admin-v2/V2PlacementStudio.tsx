import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Copy, Download, ExternalLink, Eye, EyeOff, ImagePlus, Images, Loader2, RotateCcw, RotateCw, Save, Shirt, ShoppingBag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBlanks, useEntities } from "@/lib/v2/data";
import { studioCode, type ArtItem } from "@/lib/v2/art-library";
import { MOCKUP_REVIEW_KEY } from "@/lib/v2/mockup-review";
import { ArtLibraryPanel } from "@/components/admin-v2/ArtLibraryPanel";
import { ShopifyPublishDialog, type PublishPlan } from "@/components/admin-v2/ShopifyPublishDialog";
import { linkProductToClient } from "@/lib/v2/studio-shopify";
import { corsSafeUrl, loadImage, downloadBlob } from "@/lib/v2/mockup-export";
import {
  BUILT_IN_PRESETS, MAX_PRINT, artRect, clamp, defaultCalibration, describe, hasWhiteSheet, heightForArt, knockOutWhite, mockupFilename, moveBy, normalizeDeg, oversize, presetRect, referenceFilename, resizeBy, toPreset,
  type Calibration, type Preset, type View,
} from "@/lib/v2/placement-studio";
import { PageHeader, Skeleton } from "@/components/admin-v2/primitives";

// PLACEMENT STUDIO — draw where the print goes, in inches, on the real blank,
// and export a PNG + one line of text to hand GPT ("print inside this box").
// Presets are saved per blank so every design prints in the same spot.
//
// Artwork is a LAYER on top of the garment, never a replacement for it: drop
// in one or more PNGs, drag the print to move it, pull the corner to size it,
// and every artwork uses the same placement. "Export mockups" renders the art
// on the blank (one file per artwork, optionally every colour).

type Art = {
  id: string; name: string; url: string; srcUrl: string; cleanUrl: string | null; cleaned: boolean; aspect: number;
  /** Set when the art came from a client's library: which file, which design (set). */
  fileId?: string; designId?: string; designTitle?: string;
};

/** Each side of the garment keeps its own art, placement and photo alignment. */
/**
 * Each side of the garment keeps its own art, placement and photo alignment.
 * `box` is the placement every colour uses; `overrides` holds the colours you
 * nudged one by one (their photos never line up perfectly).
 */
type Side = { box: Preset; calib: Calibration; arts: Art[]; idx: number; overrides: Record<string, Preset> };
const newSide = (v: View): Side => ({
  box: v === "front" ? BUILT_IN_PRESETS[1] : BUILT_IN_PRESETS.find((p) => p.view === "back")!,
  calib: defaultCalibration(v), arts: [], idx: 0, overrides: {},
});
/** The placement a colour actually uses on this side. */
const boxFor = (sd: Pick<Side, "box" | "overrides">, colourId: string | null | undefined): Preset => (colourId && sd.overrides?.[colourId]) || sd.box;

/** Read an uploaded image; if it sits on a white sheet, also make a version with that white removed. */
async function prepareArt(file: File, from?: Pick<Art, "fileId" | "designId" | "designTitle">): Promise<Art> {
  const srcUrl = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`Could not read ${file.name}`)); i.src = srcUrl; });
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
  let cleanUrl: string | null = null;
  try {
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h);
    if (hasWhiteSheet(px.data, w, h) && knockOutWhite(px.data, w, h) > 0) {
      ctx.putImageData(px, 0, 0);
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
      if (blob) cleanUrl = URL.createObjectURL(blob);
    }
  } catch { /* keep the original */ }
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name}`, name: file.name, srcUrl, cleanUrl, cleaned: !!cleanUrl, url: cleanUrl ?? srcUrl, aspect, ...from };
}

/** A library file (signed URL) -> the same Art an upload makes. */
async function artFromLibrary(item: ArtItem): Promise<Art> {
  const res = await fetch(corsSafeUrl(item.url!));
  if (!res.ok) throw new Error(`Could not open ${item.fileName}`);
  const blob = await res.blob();
  return prepareArt(new File([blob], item.fileName, { type: blob.type || "image/png" }), { fileId: item.fileId, designId: item.designId, designTitle: item.designTitle });
}

/** Draw artwork into its rect, turned about the rect's centre. */
function drawArt(ctx: CanvasRenderingContext2D, img: HTMLImageElement, rect: { x: number; y: number; w: number; h: number }, deg = 0) {
  if (!deg) { ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h); return; }
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(img, -rect.w / 2, -rect.h / 2, rect.w, rect.h);
  ctx.restore();
}
const turn = (deg: number | undefined, r: { x: number; y: number; w: number; h: number }) => (deg ? `rotate(${deg} ${r.x + r.w / 2} ${r.y + r.h / 2})` : undefined);

const pngBlob = (c: HTMLCanvasElement) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), "image/png"));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ACCENT = "#03AC13";
const label = "text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--ax-secondary))]";
const field = "mt-1 block w-full rounded-lg border border-[hsl(var(--ax-border))] bg-white px-2.5 py-1.5 text-[13px] font-normal normal-case tracking-normal text-[hsl(var(--ax-ink))]";
const pill = "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] disabled:opacity-40";
const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-[11.5px] ${on ? "border-[hsl(var(--ax-ink))] bg-[hsl(var(--ax-ink))] text-white" : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"}`;

function Slider({ name, value, min, max, step, unit = "in", onChange }: { name: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-[12px]"><span className="text-[hsl(var(--ax-secondary))]">{name}</span><span className="tabular-nums font-semibold">{Number(value.toFixed(2))}{unit}</span></span>
      <input type="range" className="w-full accent-[#03AC13]" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const PRESETS_KEY = ["v2", "placement-presets"] as const;

function useSavedPresets() {
  return useQuery({
    queryKey: PRESETS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("placement_presets" as never).select("*").order("name");
      if (error) {
        if ((error as { code?: string }).code === "42P01") return [] as Array<Preset & { blankStyle: string }>;
        throw new Error(error.message);
      }
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ ...toPreset(r), blankStyle: String(r.blank_style ?? "") }));
    },
  });
}

const CALIB_KEY = ["v2", "studio", "blank-calibrations"] as const;

/** Saved collar / body-edge positions per blank + side. */
function useBlankCalibrations() {
  return useQuery({
    queryKey: CALIB_KEY,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("studio_blank_calibrations" as never).select("*");
      if (error) return new Map<string, Calibration>(); // table not there yet -> defaults
      const m = new Map<string, Calibration>();
      for (const r of (data ?? []) as Array<Record<string, unknown>>) {
        m.set(`${r.blank_style}|${r.view}`, {
          collarX: Number(r.collar_x ?? 0.5), collarY: Number(r.collar_y), chestLeft: Number(r.chest_left),
          chestRight: Number(r.chest_right), chestWidthIn: Number(r.chest_width_in),
        });
      }
      return m;
    },
  });
}

export default function V2PlacementStudio() {
  const blanks = useBlanks();
  const saved = useSavedPresets();
  const qc = useQueryClient();

  const [blankId, setBlankId] = useState<string>("");
  const [colorId, setColorId] = useState<string>("");
  const [view, setView] = useState<View>("front");
  const [ownImage, setOwnImage] = useState<string | null>(null);
  const [sides, setSides] = useState<Record<View, Side>>(() => ({ front: newSide("front"), back: newSide("back") }));
  const [lockSquare, setLockSquare] = useState(true);
  const [aspect, setAspect] = useState(1);
  const [exporting, setExporting] = useState(false);
  const entities = useEntities();
  const [clientId, setClientId] = useState<string | null>(() => { try { return localStorage.getItem("ax.studio.client"); } catch { return null; } });
  const [autoPair, setAutoPair] = useState(true);
  const [productName, setProductName] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [price, setPrice] = useState("45");
  const [viaReview, setViaReview] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  /** Colours unticked in the every-colour strip: not saved, not downloaded, not on Shopify. */
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  /** Who a drag / slider change applies to while checking colours one by one. */
  const [scope, setScope] = useState<"all" | "single">("all");
  const [showGuides, setShowGuides] = useState(true);
  const [everyColour, setEveryColour] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const artRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ mode: "move" | "resize" | "collar"; x: number; y: number; start: Preset; startCollarY?: number } | null>(null);

  // The side being edited, plus setters that write to it.
  const side = sides[view];
  const { calib, arts, idx: artIdx } = side;
  // Placement for the colour on screen: its own if you nudged it, otherwise the shared one.
  const box = boxFor(side, ownImage ? null : colorId);
  const hasOwn = !ownImage && !!colorId && !!side.overrides[colorId];
  const art = arts[artIdx] ?? null;
  type Up<T> = T | ((prev: T) => T);
  const patch = (v: View, fn: (s: Side) => Side) => setSides((all) => ({ ...all, [v]: fn(all[v]) }));
  const apply = <T,>(u: Up<T>, prev: T) => (typeof u === "function" ? (u as (p: T) => T)(prev) : u);
  /**
   * "Move all colours": edits the shared placement (colours you nudged keep theirs).
   * "This colour only": edits just the colour on screen.
   */
  const setBox = (u: Up<Preset>) => patch(view, (s) => {
    if (scope === "single" && everyColour && colorId && !ownImage) {
      const cur = s.overrides[colorId] ?? s.box;
      return { ...s, overrides: { ...s.overrides, [colorId]: apply(u, cur) } };
    }
    return { ...s, box: apply(u, s.box) };
  });
  const resetColour = () => colorId && patch(view, (s) => { const o = { ...s.overrides }; delete o[colorId]; return { ...s, overrides: o }; });
  /** This colour's placement becomes everyone's, and every one-off nudge is cleared. */
  const copyToAll = () => patch(view, (s) => ({ ...s, box: boxFor(s, colorId), overrides: {} }));
  const setCalib = (u: Up<Calibration>) => patch(view, (s) => ({ ...s, calib: apply(u, s.calib) }));
  const setArtIdx = (i: number) => patch(view, (s) => ({ ...s, idx: i }));
  const pickClient = (id: string | null) => { setClientId(id); try { if (id) localStorage.setItem("ax.studio.client", id); else localStorage.removeItem("ax.studio.client"); } catch { /* private mode */ } };

  const list = useMemo(() => (blanks.data ?? []).filter((b) => b.colors.some((c) => c.imageUrl)), [blanks.data]);
  useEffect(() => {
    if (blankId || !list.length) return;
    const axism = list.find((b) => (b.styleNumber ?? "").includes("7010")) ?? list[0];
    setBlankId(axism.id);
  }, [list, blankId]);
  const blank = list.find((b) => b.id === blankId) ?? null;
  const colors = useMemo(() => (blank?.colors ?? []).filter((c) => (view === "back" ? c.imageUrlBack ?? c.imageUrl : c.imageUrl)), [blank, view]);
  useEffect(() => {
    if (!colors.length) return;
    if (!colors.some((c) => c.id === colorId)) setColorId((colors.find((c) => /^black$/i.test(c.name)) ?? colors[0]).id);
  }, [colors, colorId]);
  const color = colors.find((c) => c.id === colorId) ?? null;
  const photo = ownImage ?? (color ? (view === "back" ? color.imageUrlBack ?? color.imageUrl : color.imageUrl) : null);
  useEffect(() => { setExcluded(new Set()); }, [blankId]);
  const toggleColour = (id: string) => setExcluded((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const blankName = blank ? [blank.brand, blank.styleNumber].filter(Boolean).join(" ") || blank.displayName || blank.name : "Any tee";

  // Each blank remembers where its collar / body edges are (saved once, used by every design).
  const calibrations = useBlankCalibrations();
  useEffect(() => {
    if (!calibrations.data) return;
    setSides((all) => {
      const next = { ...all };
      for (const v of ["front", "back"] as const) next[v] = { ...all[v], calib: calibrations.data!.get(`${blankName}|${v}`) ?? defaultCalibration(v) };
      return next;
    });
  }, [blankName, calibrations.data]);

  const presets = useMemo(() => {
    const mine = (saved.data ?? []).filter((p) => p.view === view && (p.blankStyle === blankName || p.blankStyle === "Any tee"));
    return [...mine, ...BUILT_IN_PRESETS.filter((p) => p.view === view)];
  }, [saved.data, view, blankName]);

  const W = 1000;
  const H = W / aspect;
  const r = presetRect(box, calib, W, H);
  const ppi = r.w / Math.max(box.widthIn, 0.01);
  const tooBig = oversize(box);
  const line = describe(box, blankName);

  const setDim = (key: "widthIn" | "heightIn", v: number) =>
    setBox((b) => {
      // With artwork, the box keeps the art's proportions whichever slider moves.
      if (art) return key === "widthIn" ? { ...b, widthIn: v, heightIn: heightForArt(v, art.aspect), builtIn: false } : { ...b, heightIn: v, widthIn: Math.min(MAX_PRINT.widthIn, Math.round(v * art.aspect * 8) / 8), builtIn: false };
      return lockSquare && b.widthIn === b.heightIn ? { ...b, widthIn: v, heightIn: v, builtIn: false } : { ...b, [key]: v, builtIn: false };
    });

  // Switching artwork keeps width + position; height follows the new art.
  useEffect(() => {
    if (!art) return;
    // New art: every colour's box (shared + one-offs) takes the art's proportions.
    const fit = (b: Preset) => (b.heightIn === heightForArt(b.widthIn, art.aspect) ? b : { ...b, heightIn: heightForArt(b.widthIn, art.aspect) });
    patch(view, (s) => ({ ...s, box: fit(s.box), overrides: Object.fromEntries(Object.entries(s.overrides).map(([k, b]) => [k, fit(b)])) }));
  }, [art, view]);

  /**
   * Put art on a side. The first art on a side lands big and centred (a full
   * print); a LOGO lands as a 4-inch centre-chest mark instead.
   */
  const placeArt = (v: View, added: Art[], asLogo = false) => {
    if (!added.length) return;
    patch(v, (s) => {
      let bx = s.box;
      if (!s.arts.length || asLogo) {
        const widthIn = asLogo ? 4 : v === "back" ? 12 : 10;
        bx = { ...bx, name: asLogo ? "Center chest logo" : v === "back" ? "Full back" : "Full front", widthIn, heightIn: Math.min(MAX_PRINT.heightIn, heightForArt(widthIn, added[0].aspect)), topIn: asLogo ? 3 : v === "back" ? 4 : 3, centerXIn: 0, builtIn: false };
      }
      return { ...s, box: bx, arts: [...s.arts, ...added], idx: s.arts.length, overrides: !s.arts.length || asLogo ? {} : s.overrides };
    });
    setShowGuides(false);
    if (added.some((a) => a.cleaned)) toast.success("Removed the white background so it sits on the shirt. Untick “Remove white background” to undo.");
  };
  const addArt = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: Art[] = [];
    for (const f of Array.from(files)) {
      try { added.push(await prepareArt(f)); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not read that file"); }
    }
    placeArt(view, added);
  };
  /** From the client library: fronts/backs go to their own side, logos to the side you're on. */
  const pickFromLibrary = async (item: ArtItem, pair: ArtItem | null) => {
    try {
      const target: View = item.role === "back" ? "back" : item.role === "front" ? "front" : view;
      const [a, b] = await Promise.all([artFromLibrary(item), pair ? artFromLibrary(pair) : Promise.resolve(null)]);
      placeArt(target, [a], item.role === "logo");
      if (b && pair) placeArt(pair.role === "back" ? "back" : "front", [b]);
      setView(target);
      if (!productName.trim()) setProductName(item.designTitle);
      if (b) toast.success(`Loaded ${item.designTitle} front + back`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load that art");
    }
  };
  const toggleClean = (on: boolean) =>
    patch(view, (s) => ({ ...s, arts: s.arts.map((a, i) => (i === s.idx && a.cleanUrl ? { ...a, cleaned: on, url: on ? a.cleanUrl : a.srcUrl } : a)) }));
  const removeArt = (i: number) =>
    patch(view, (s) => ({ ...s, arts: s.arts.filter((_, j) => j !== i), idx: s.idx > i ? s.idx - 1 : s.idx === i ? Math.max(0, i - 1) : s.idx }));
  const activeFileIds = useMemo(() => new Set([sides.front, sides.back].map((sd) => sd.arts[sd.idx]?.fileId).filter((x): x is string => !!x)), [sides]);

  // Canvas dragging: body moves the print, corner handle resizes it.
  const toImage = () => { const rect = svgRef.current?.getBoundingClientRect(); return rect && rect.width ? W / rect.width : 1; };
  const startDrag = (mode: "move" | "resize" | "collar") => (e: ReactPointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, y: e.clientY, start: box, startCollarY: calib.collarY };
  };
  const onDrag = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const k = toImage();
    const dx = (e.clientX - d.x) * k;
    const dy = (e.clientY - d.y) * k;
    if (d.mode === "collar") {
      // Up / down only: the collar is the 0" line every placement measures from.
      setCalib((c) => ({ ...c, collarY: clamp((d.startCollarY ?? c.collarY) + dy / H, 0.02, 0.6) }));
      return;
    }
    setBox({ ...(d.mode === "move" ? moveBy(d.start, dx, dy, ppi) : resizeBy(d.start, dx, dy, ppi, art?.aspect ?? null)), builtIn: false });
  };
  const endDrag = () => { drag.current = null; };
  const rotation = box.rotationDeg ?? 0;
  const setRotation = (deg: number) => setBox((b) => ({ ...b, rotationDeg: normalizeDeg(deg), builtIn: false }));
  const nudge = (e: ReactKeyboardEvent) => {
    if (e.key === "[" || e.key === "]") { e.preventDefault(); setRotation(rotation + (e.key === "]" ? 1 : -1) * (e.shiftKey ? 15 : 1)); return; }
    const step = (e.shiftKey ? 1 : 0.125) * ppi;
    const m: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const v = m[e.key];
    if (!v) return;
    e.preventDefault();
    setBox((b) => ({ ...moveBy(b, v[0], v[1], ppi), builtIn: false }));
  };

  const savedCalib = calibrations.data?.get(`${blankName}|${view}`) ?? null;
  // "Moved" = differs from what's saved for this blank (or from the starting guess when nothing is saved yet).
  const calibBase = savedCalib ?? defaultCalibration(view);
  const calibDirty = (["collarX", "collarY", "chestLeft", "chestRight", "chestWidthIn"] as const).some((k) => Math.abs(calibBase[k] - calib[k]) > 0.0005);
  const saveCalib = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("studio_blank_calibrations" as never).upsert({
        blank_style: blankName, view, collar_x: calib.collarX, collar_y: calib.collarY, chest_left: calib.chestLeft,
        chest_right: calib.chestRight, chest_width_in: calib.chestWidthIn, updated_at: new Date().toISOString(),
      } as never, { onConflict: "blank_style,view" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success(`Collar + guides saved for ${blankName} (${view})`); void qc.invalidateQueries({ queryKey: CALIB_KEY }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save the guides"),
  });

  const savePreset = useMutation({
    mutationFn: async () => {
      const name = box.name.trim() || "Preset";
      const { error } = await supabase.from("placement_presets" as never).upsert({
        blank_style: blankName, view, name, width_in: box.widthIn, height_in: box.heightIn, top_in: box.topIn, center_x_in: box.centerXIn, notes: box.notes ?? null,
        // Only sent when used, so presets keep saving before the rotation column exists.
        ...(rotation ? { rotation_deg: rotation } : {}),
      } as never, { onConflict: "blank_style,view,name" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success(`Saved “${box.name}” for ${blankName}`); void qc.invalidateQueries({ queryKey: PRESETS_KEY }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const deletePreset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("placement_presets" as never).delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: PRESETS_KEY }),
  });

  const exportPng = async () => {
    if (!photo) return;
    setExporting(true);
    try {
      const img = await loadImage(photo);
      const outW = 1600;
      const outH = Math.round(outW / (img.naturalWidth / img.naturalHeight));
      const footer = 150;
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH + footer;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, outW, outH);
      const k = outW / W;
      const rr = presetRect(box, calib, outW, outH);
      if (art) {
        // The artwork in place, so GPT sees exactly what goes where.
        const artImg = await loadImage(art.url);
        const ar = artRect(rr, artImg.naturalWidth / artImg.naturalHeight);
        drawArt(ctx, artImg, ar, rotation);
      }
      const inch = rr.w / box.widthIn;
      // inch grid inside the box
      ctx.strokeStyle = "rgba(3,172,19,0.35)";
      ctx.lineWidth = 1;
      for (let x = rr.x + inch; x < rr.x + rr.w - 0.5; x += inch) { ctx.beginPath(); ctx.moveTo(x, rr.y); ctx.lineTo(x, rr.y + rr.h); ctx.stroke(); }
      for (let y = rr.y + inch; y < rr.y + rr.h - 0.5; y += inch) { ctx.beginPath(); ctx.moveTo(rr.x, y); ctx.lineTo(rr.x + rr.w, y); ctx.stroke(); }
      // the box
      ctx.fillStyle = "rgba(3,172,19,0.10)";
      ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
      ctx.setLineDash([14 * k, 8 * k]);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 5 * k;
      ctx.strokeRect(rr.x, rr.y, rr.w, rr.h);
      ctx.setLineDash([]);
      // collar marker + centre line
      const cx = calib.collarX * outW;
      const cy = calib.collarY * outH;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 2 * k;
      ctx.beginPath(); ctx.moveTo(cx, cy - 18 * k); ctx.lineTo(cx, outH); ctx.stroke();
      ctx.fillStyle = ACCENT;
      ctx.beginPath(); ctx.arc(cx, cy, 7 * k, 0, Math.PI * 2); ctx.fill();
      // dimension label
      const tag = `${box.widthIn} × ${box.heightIn} in`;
      ctx.font = `600 ${Math.round(28 * k)}px Inter, system-ui, sans-serif`;
      const tw = ctx.measureText(tag).width;
      ctx.fillStyle = ACCENT;
      ctx.fillRect(rr.x, rr.y - 44 * k, tw + 24 * k, 38 * k);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(tag, rr.x + 12 * k, rr.y - 16 * k);
      // footer
      ctx.fillStyle = "#111111";
      ctx.fillRect(0, outH, outW, footer);
      ctx.fillStyle = "#ffffff";
      ctx.font = "600 30px Inter, system-ui, sans-serif";
      ctx.fillText(`${blankName} · ${view.toUpperCase()} · ${box.name}`, 32, outH + 52);
      ctx.font = "400 24px Inter, system-ui, sans-serif";
      const rest = line.split(": ").slice(1).join(": ");
      const words = rest.split(" ");
      let cur = "", yy = outH + 92;
      for (const w of words) {
        if (ctx.measureText(`${cur} ${w}`).width > outW - 64) { ctx.fillText(cur, 32, yy); cur = w; yy += 32; }
        else cur = cur ? `${cur} ${w}` : w;
      }
      if (cur) ctx.fillText(cur, 32, yy);
      const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), "image/png"));
      downloadBlob(blob, referenceFilename(blankName, box));
      toast.success("Placement reference downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not export");
    } finally {
      setExporting(false);
    }
  };

  // Art on the blank, no guides — a real mockup file.
  const renderMockup = async (garmentUrl: string, a: Art, sd: Pick<Side, "box" | "calib"> = side): Promise<Blob> => {
    const [img, artImg] = await Promise.all([loadImage(garmentUrl), loadImage(a.url)]);
    const outW = 1600;
    const outH = Math.round(outW / (img.naturalWidth / img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, outW, outH);
    const ar = artRect(presetRect(sd.box, sd.calib, outW, outH), artImg.naturalWidth / artImg.naturalHeight);
    drawArt(ctx, artImg, ar, sd.box.rotationDeg ?? 0);
    return pngBlob(canvas);
  };

  const garmentOf = (c: { imageUrl: string | null; imageUrlBack?: string | null }, v: View = view) => (v === "back" ? c.imageUrlBack ?? c.imageUrl : c.imageUrl);

  // ------------------------------------------------ save to Mockup Review
  const client = (entities.data ?? []).find((e) => e.id === clientId) ?? null;
  const sidesWithArt = (["front", "back"] as const).filter((v) => sides[v].arts[sides[v].idx]);
  const saveColours = useMemo(() => {
    const all = blank?.colors ?? [];
    const usable = all.filter((c) => sidesWithArt.every((v) => garmentOf(c, v)));
    return everyColour ? usable.filter((c) => !excluded.has(c.id)) : usable.filter((c) => c.id === colorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blank, everyColour, colorId, sides, excluded]);
  const codeFor = (name: string) => (client && name.trim() ? studioCode(client.slug || client.name, name) : null);
  const code = codeFor(productName);

  /**
   * Render + store the ticked colours and record them. Unticked colours that were
   * saved before are archived, so they come off Shopify on the next sync.
   * Returns false when nothing was saved.
   */
  type Colour = NonNullable<typeof blank>["colors"][number];
  /** Everything one mockup set needs to render + save, independent of what's on screen. */
  interface SetJob {
    clientId: string; name: string; blankName: string; productType: string; skuPrefix: string;
    sides: Record<View, Side>; colours: Colour[]; droppedNames: string[];
  }

  /** The set on screen right now. */
  const currentJob = (name = productName): SetJob | null =>
    client && name.trim() && sidesWithArt.length && saveColours.length
      ? {
          clientId: client.id, name: name.trim(), blankName, productType, skuPrefix,
          sides: { front: { ...sides.front }, back: { ...sides.back } }, colours: [...saveColours],
          droppedNames: everyColour ? (blank?.colors ?? []).filter((c) => excluded.has(c.id)).map((c) => c.name) : [],
        }
      : null;

  /**
   * Render + store a set's colours and record them. Unticked colours that were
   * saved before are archived, so they come off Shopify on the next sync.
   * Returns the product code, or null when nothing was saved.
   */
  const saveSet = async (job: SetJob, approved: boolean, progress: (s: string) => void): Promise<string | null> => {
    const ent = (entities.data ?? []).find((e) => e.id === job.clientId);
    const code = ent ? studioCode(ent.slug || ent.name, job.name) : null;
    const withArt = (["front", "back"] as const).filter((v) => job.sides[v].arts[job.sides[v].idx]);
    if (!code || !withArt.length || !job.colours.length) return null;
    const rows: Record<string, unknown>[] = [];
    let n = 0;
    for (const c of job.colours) {
      progress(`${job.name}: ${++n} / ${job.colours.length}`);
      const urls: Partial<Record<View, string>> = {};
      for (const v of withArt) {
        const sd = job.sides[v];
        const g = garmentOf(c, v);
        if (!g) continue;
        const blob = await renderMockup(g, sd.arts[sd.idx], { box: boxFor(sd, c.id), calib: sd.calib });
        const path = `${job.clientId}/${code}/${c.name.replace(/[^A-Za-z0-9]+/g, "-")}-${v}-${Date.now()}.png`;
        const up = await supabase.storage.from("studio-mockups").upload(path, blob, { contentType: "image/png", upsert: true });
        if (up.error) throw up.error;
        urls[v] = supabase.storage.from("studio-mockups").getPublicUrl(path).data.publicUrl;
      }
      rows.push({
        athlete_id: job.clientId, design_code: code, design_name: job.name, product_title: job.name,
        garment: job.blankName, blank_style: job.blankName, color: c.name,
        front_url: urls.front ?? null, back_url: urls.back ?? null, front_drive_id: null, back_drive_id: null,
        // Straight to approved unless it should go through Mockup Review first.
        review_state: approved ? "approved" : "pending", review_note: null, reviewed_at: approved ? new Date().toISOString() : null, reviewed_by: null, updated_at: new Date().toISOString(),
      });
    }
    const { error } = await supabase.from("mockup_reviews" as never).upsert(rows as never, { onConflict: "design_code,garment,color" });
    if (error) throw error;
    if (job.droppedNames.length) {
      await supabase.from("mockup_reviews" as never).update({ review_state: "archived", review_note: "Unticked in Placement Studio", updated_at: new Date().toISOString() } as never)
        .eq("design_code", code).eq("garment", job.blankName).in("color", job.droppedNames).neq("review_state", "archived");
    }
    void qc.invalidateQueries({ queryKey: MOCKUP_REVIEW_KEY });
    return code;
  };

  /** "Save mockups" for the set on screen. */
  const saveMockups = async (opts: { name?: string; approved?: boolean } = {}): Promise<boolean> => {
    const job = currentJob(opts.name);
    if (!job) return false;
    const approved = opts.approved ?? !viaReview;
    try {
      const saved = await saveSet(job, approved, setSaving);
      if (!saved) return false;
      toast.success(`${job.colours.length} mockup${job.colours.length === 1 ? "" : "s"} of ${job.name} saved${approved ? "" : " for review"}`, {
        action: { label: "Open", onClick: () => { window.location.href = `/admin-v2/mockups-review?design=${encodeURIComponent(saved)}&tab=${approved ? "approved" : "pending"}`; } },
      });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
      return false;
    } finally {
      setSaving(null);
    }
  };

  // ------------------------------------------------ batch: several sets, one save
  interface BatchItem extends SetJob { id: string; aspect: number; code: string | null; status: "ready" | "saving" | "saved" | "error"; error?: string }
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const [batchSaving, setBatchSaving] = useState<string | null>(null);
  const [publishTarget, setPublishTarget] = useState<BatchItem | null>(null);

  const addToBatch = () => {
    const job = currentJob();
    if (!job) { toast.error("Pick a client, name the product, add art and at least one colour first."); return; }
    const clash = batch.find((b) => b.name.toLowerCase() === job.name.toLowerCase() && b.blankName === job.blankName && b.colours.some((c) => job.colours.some((x) => x.name === c.name)));
    if (clash) { toast.error(`"${job.name}" on ${job.blankName} is already in the batch with some of the same colours — give this one its own name (e.g. "${job.name} — All Red").`); return; }
    setBatch((list) => [...list, { ...job, id: `${Date.now()}`, aspect, code: null, status: "ready" }]);
    toast.success(`Added "${job.name}" (${job.colours.length} colour${job.colours.length === 1 ? "" : "s"}) — swap the art or blank for the next one`);
  };
  const loadFromBatch = (item: BatchItem) => {
    const b = list.find((x) => x.name === item.blankName || [x.brand, x.styleNumber].filter(Boolean).join(" ") === item.blankName);
    if (b) setBlankId(b.id);
    setSides({ front: { ...item.sides.front }, back: { ...item.sides.back } });
    setProductName(item.name);
    pickClient(item.clientId);
    setBatch((all) => all.filter((x) => x.id !== item.id));
    toast.message(`"${item.name}" is back on the canvas — add it to the batch again when it's right`);
  };
  const saveBatch = async () => {
    const todo = batch.filter((b) => b.status !== "saved");
    if (!todo.length) return;
    let done = 0;
    for (const item of todo) {
      setBatch((all) => all.map((x) => (x.id === item.id ? { ...x, status: "saving" } : x)));
      try {
        const saved = await saveSet(item, !viaReview, setBatchSaving);
        setBatch((all) => all.map((x) => (x.id === item.id ? { ...x, status: saved ? "saved" : "error", code: saved, error: saved ? undefined : "Nothing to save" } : x)));
        if (saved) done++;
      } catch (e) {
        setBatch((all) => all.map((x) => (x.id === item.id ? { ...x, status: "error", error: e instanceof Error ? e.message : "Couldn't save" } : x)));
      }
    }
    setBatchSaving(null);
    toast.success(`${done} of ${todo.length} set${todo.length === 1 ? "" : "s"} saved — now add each to Shopify`);
  };

  const invokeSync = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("mockup-review-sync", { body });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      const b = ctx ? await ctx.json().catch(() => null) : null;
      throw new Error(b?.error ?? error.message);
    }
    const r = data as { added?: string[]; removed?: string[]; note?: string; error?: string; product_gid?: string; title?: string; created?: boolean; collection?: { title: string } | null };
    if (r.error) throw new Error(r.error);
    return r;
  };

  /**
   * The last step for one set (on screen, or a batch item): save its colours,
   * then create / update the Shopify product, collection and tags.
   */
  const publish = async (plan: PublishPlan) => {
    const target = publishTarget;
    const name = plan.target.kind === "new" ? plan.target.title : plan.target.product.title;
    const base = target ? { ...target, name } : currentJob(name);
    const ent = (entities.data ?? []).find((e) => e.id === (target?.clientId ?? clientId));
    if (!base || !ent) { toast.error("Pick a client and add art + colours first."); return; }
    const job: SetJob = { ...base, clientId: ent.id, name };
    try {
      setPublishing("Saving mockups…");
      if (!target && name !== productName) setProductName(name);
      const pCode = await saveSet(job, true, setPublishing);
      if (!pCode) { toast.error("Nothing to save — add art and tick at least one colour."); return; }
      if (target) setBatch((all) => all.map((x) => (x.id === target.id ? { ...x, status: "saved", code: pCode, name, clientId: ent.id } : x)));
      if (plan.target.kind === "existing") {
        await supabase.from("mockup_reviews" as never).update({ shopify_product_gid: plan.target.product.shopifyGid, product_title: name } as never).eq("design_code", pCode);
      }
      setPublishing("Sending to Shopify…");
      const r = await invokeSync({
        design_code: pCode, product_type: job.productType, price: plan.price.toFixed(2), sku_prefix: job.skuPrefix,
        title: plan.target.kind === "new" ? name : undefined, tags: plan.tags,
        collection_id: plan.collection.kind === "existing" ? plan.collection.id : undefined,
        new_collection_title: plan.collection.kind === "new" ? plan.collection.title : undefined,
      });
      if (r.created && r.product_gid) {
        setPublishing("Linking to the client…");
        await linkProductToClient({ shopifyGid: r.product_gid, title: r.title ?? name, clientId: ent.id, price: plan.price, colors: job.colours.map((c) => c.name) });
      }
      void qc.invalidateQueries({ queryKey: MOCKUP_REVIEW_KEY });
      void qc.invalidateQueries({ queryKey: ["v2", "studio", "client-products", ent.id] });
      void qc.invalidateQueries({ queryKey: ["v2", "studio", "shopify-collections"] });
      setPublishOpen(false);
      setPublishTarget(null);
      toast.success(
        `${name}: ${r.created ? "created on Shopify (draft)" : "updated on Shopify"} · ${r.added?.length ?? 0} colour${r.added?.length === 1 ? "" : "s"} added${r.removed?.length ? ` · ${r.removed.length} removed` : ""}${r.collection ? ` · in ${r.collection.title}` : ""}`,
        { duration: 8000 },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Shopify didn't take it");
    } finally {
      setPublishing(null);
    }
  };
  const openHref = code ? `/admin-v2/mockups-review?design=${encodeURIComponent(code)}&tab=${viaReview ? "pending" : "approved"}` : "/admin-v2/mockups-review";
  const productType = blank ? (blank.garmentType || "tee").replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "Tee";
  const skuPrefix = blank ? `AX${(blank.styleNumber ?? blank.name ?? "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase().slice(0, 10)}` : "AX";

  const mockupJobs = useMemo(() => {
    if (!arts.length) return [] as Array<{ art: Art; colour: string; url: string; colourId: string | null }>;
    const targets = everyColour
      ? colors.filter((c) => !excluded.has(c.id)).map((c) => ({ colour: c.name, url: garmentOf(c), colourId: c.id as string | null })).filter((t): t is { colour: string; url: string; colourId: string | null } => !!t.url)
      : photo ? [{ colour: ownImage ? "Custom" : color?.name ?? "Colour", url: photo, colourId: ownImage ? null : colorId }] : [];
    return arts.flatMap((a) => targets.map((t) => ({ art: a, ...t })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arts, everyColour, colors, photo, ownImage, color, view, excluded, colorId]);

  const exportMockups = async () => {
    if (!mockupJobs.length) return;
    setExporting(true);
    let done = 0;
    try {
      for (const j of mockupJobs) {
        const blob = await renderMockup(j.url, j.art, { box: boxFor(side, j.colourId), calib });
        downloadBlob(blob, mockupFilename(j.art.name, blankName, j.colour, view));
        done++;
        if (mockupJobs.length > 1) await pause(350); // browsers drop rapid back-to-back downloads
      }
      toast.success(`${done} mockup${done === 1 ? "" : "s"} downloaded`);
    } catch (e) {
      toast.error(`${done} done, then: ${e instanceof Error ? e.message : "export failed"}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Releases · Placement studio"
        title="Where the print goes"
        subtitle="Add your artwork, drag it into place (pull the corner to size it), then export mockups — or export the placement guide and copy the line for GPT."
      />
      {blanks.isLoading ? <Skeleton className="h-[60vh]" /> : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <ArtLibraryPanel
              entities={entities.data ?? []}
              clientId={clientId}
              onClientChange={pickClient}
              autoPair={autoPair}
              onAutoPairChange={setAutoPair}
              onPick={(item, pair) => void pickFromLibrary(item, pair)}
              activeFileIds={activeFileIds}
            />
            <div tabIndex={0} onKeyDown={nudge} aria-label="Placement canvas — drag the print, arrow keys nudge 1/8 in (Shift: 1 in)"
              className="relative mx-auto w-full max-w-[760px] overflow-hidden rounded-2xl bg-[#f3f3f1] outline-none focus-visible:ring-2 focus-visible:ring-[#03AC13]" style={{ aspectRatio: String(aspect) }}>
              {photo ? (
                <img src={photo} alt={`${blankName} ${view}`} className="absolute inset-0 h-full w-full object-fill" referrerPolicy="no-referrer"
                  onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight); }} />
              ) : <div className="absolute inset-0 grid place-items-center text-[13px] text-[hsl(var(--ax-faint))]">No photo for this blank — use your own image.</div>}
              <svg ref={svgRef} className="absolute inset-0 h-full w-full touch-none select-none" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
                onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
                {art && (() => { const a = artRect(r, art.aspect); return <image href={art.url} x={a.x} y={a.y} width={a.w} height={a.h} preserveAspectRatio="none" transform={turn(rotation, a)} style={{ pointerEvents: "none" }} />; })()}
                {showGuides && <g style={{ pointerEvents: "none" }}>
                {/* guides: collar, centre line, chest edges */}
                <line x1={calib.chestLeft * W} x2={calib.chestLeft * W} y1={0} y2={H} stroke="#2563eb" strokeOpacity="0.35" strokeDasharray="6 6" strokeWidth="2" />
                <line x1={calib.chestRight * W} x2={calib.chestRight * W} y1={0} y2={H} stroke="#2563eb" strokeOpacity="0.35" strokeDasharray="6 6" strokeWidth="2" />
                <line x1={calib.collarX * W} x2={calib.collarX * W} y1={calib.collarY * H - 14} y2={H} stroke="#000" strokeOpacity="0.2" strokeWidth="1.5" />
                {/* inch grid */}
                {Array.from({ length: Math.max(0, Math.floor(box.widthIn) ) }, (_, i) => i + 1).filter((i) => i < box.widthIn).map((i) => (
                  <line key={`v${i}`} x1={r.x + i * ppi} x2={r.x + i * ppi} y1={r.y} y2={r.y + r.h} stroke={ACCENT} strokeOpacity="0.35" strokeWidth="1" />
                ))}
                {Array.from({ length: Math.max(0, Math.floor(box.heightIn)) }, (_, i) => i + 1).filter((i) => i < box.heightIn).map((i) => (
                  <line key={`h${i}`} x1={r.x} x2={r.x + r.w} y1={r.y + i * ppi} y2={r.y + i * ppi} stroke={ACCENT} strokeOpacity="0.35" strokeWidth="1" />
                ))}
                </g>}
                <g transform={turn(rotation, r)}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={ACCENT} fillOpacity={art ? 0.001 : showGuides ? 0.1 : 0.001} stroke={tooBig ? "#dc2626" : ACCENT} strokeOpacity={showGuides ? 1 : 0.5} strokeWidth="3" strokeDasharray="10 6"
                  style={{ cursor: "move" }} onPointerDown={startDrag("move")} />
                <rect x={r.x + r.w - 11} y={r.y + r.h - 11} width="22" height="22" rx="4" fill="#fff" stroke={ACCENT} strokeWidth="3" style={{ cursor: "nwse-resize" }} onPointerDown={startDrag("resize")} />
                </g>
                {/* collar point: drag up / down to sit it on the collar seam of this blank */}
                <g style={{ cursor: "ns-resize" }} onPointerDown={startDrag("collar")}>
                  <line x1={calib.collarX * W - 40} x2={calib.collarX * W + 40} y1={calib.collarY * H} y2={calib.collarY * H} stroke={ACCENT} strokeOpacity="0.7" strokeWidth="2" strokeDasharray="4 4" />
                  <circle cx={calib.collarX * W} cy={calib.collarY * H} r="18" fill="transparent" />
                  <circle cx={calib.collarX * W} cy={calib.collarY * H} r="8" fill={ACCENT} stroke="#fff" strokeWidth="3" />
                </g>
                <text x={r.x} y={r.y - 8} fontSize="20" fontWeight="600" fill={tooBig ? "#dc2626" : ACCENT} style={{ pointerEvents: "none" }}>{box.widthIn} × {box.heightIn} in · {box.topIn} in below collar{rotation ? ` · ${rotation}°` : ""}{everyColour && scope === "single" && !ownImage ? ` · ${color?.name ?? "this colour"} only` : ""}</text>
              </svg>
            </div>
            {everyColour && colors.length > 0 && (
              <div className="mx-auto mt-3 max-w-[760px]">
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--ax-secondary))]">Every colour · {colors.length - colors.filter((c) => excluded.has(c.id)).length} of {colors.length} in</p>
                  <span className="text-[11px] text-[hsl(var(--ax-faint))]">Click to check up close · untick the ones that don't look right</span>
                  <span className="ml-auto flex gap-2 text-[11px]">
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => setExcluded(new Set())}>All in</button>
                    <button type="button" className="underline-offset-2 hover:underline" onClick={() => setExcluded(new Set(colors.map((c) => c.id)))}>None</button>
                  </span>
                </div>
                {art && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg bg-[hsl(var(--ax-ink)/0.04)] px-2.5 py-1.5">
                    <span className="text-[11.5px] text-[hsl(var(--ax-secondary))]">Dragging moves</span>
                    <div className="flex overflow-hidden rounded-full border border-[hsl(var(--ax-border))] text-[11.5px] font-semibold">
                      <button type="button" className={`px-2.5 py-1 ${scope === "all" ? "bg-[hsl(var(--ax-ink))] text-white" : ""}`} onClick={() => setScope("all")}>All colours</button>
                      <button type="button" className={`px-2.5 py-1 ${scope === "single" ? "bg-[#03AC13] text-white" : ""}`} onClick={() => setScope("single")}>Only {color?.name ?? "this colour"}</button>
                    </div>
                    {hasOwn && <button type="button" className="text-[11.5px] underline-offset-2 hover:underline" onClick={resetColour}>Reset {color?.name}</button>}
                    {Object.keys(side.overrides).length > 0 && (
                      <span className="text-[11px] text-[hsl(var(--ax-faint))]">{Object.keys(side.overrides).length} adjusted on their own</span>
                    )}
                    <button type="button" className="ml-auto text-[11.5px] font-semibold underline-offset-2 hover:underline" onClick={copyToAll}
                      title="Every colour gets this colour's placement; one-off adjustments are cleared">Copy this placement to all</button>
                  </div>
                )}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {colors.map((c) => {
                    const g = garmentOf(c);
                    const cb = boxFor(side, c.id);
                    const a = art ? artRect(presetRect(cb, calib, W, H), art.aspect) : null;
                    const own = !!side.overrides[c.id];
                    const on = !ownImage && c.id === colorId;
                    const out = excluded.has(c.id);
                    return (
                      <div key={c.id} className={`relative w-[92px] shrink-0 overflow-hidden rounded-lg border-2 bg-[#f3f3f1] ${on ? "border-[#03AC13]" : "border-transparent hover:border-[hsl(var(--ax-border))]"} ${out ? "opacity-40" : ""}`}>
                      <label className="absolute right-1 top-1 z-10 grid h-5 w-5 cursor-pointer place-items-center rounded bg-white/90 shadow" title={out ? `Put ${c.name} back in` : `Leave ${c.name} out`}>
                        <input type="checkbox" className="h-3.5 w-3.5 accent-[#03AC13]" checked={!out} onChange={() => toggleColour(c.id)} aria-label={`Include ${c.name}`} />
                      </label>
                      {own && <span className="absolute left-1 top-1 z-10 rounded bg-[#03AC13] px-1 text-[9px] font-bold uppercase leading-4 text-white" title="Placement adjusted for this colour">Own</span>}
                      <button type="button" onClick={() => { setColorId(c.id); setOwnImage(null); if (art) setScope("single"); }} title={c.name} className="block w-full text-left">
                        <span className="relative block w-full" style={{ aspectRatio: String(aspect) }}>
                          {g && <img src={g} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-fill" />}
                          {a && art && (
                            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                              <image href={art.url} x={a.x} y={a.y} width={a.w} height={a.h} preserveAspectRatio="none" transform={turn(cb.rotationDeg, a)} />
                            </svg>
                          )}
                        </span>
                        <span className={`block truncate px-1.5 py-1 text-[10.5px] ${out ? "line-through" : ""}`}>{c.name}</span>
                      </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mx-auto mt-3 flex max-w-[760px] flex-wrap items-center gap-2">
              {arts.map((a, i) => (
                <span key={a.id} className={`group relative h-14 w-14 overflow-hidden rounded-lg border-2 bg-[#2b2b2b] ${i === artIdx ? "border-[#03AC13]" : "border-transparent"}`}>
                  <button type="button" className="h-full w-full" title={a.name} onClick={() => setArtIdx(i)}><img src={a.url} alt={a.name} className="h-full w-full object-contain" /></button>
                  <button type="button" aria-label={`Remove ${a.name}`} className="absolute right-0.5 top-0.5 hidden rounded-full bg-black/70 p-0.5 text-white group-hover:block" onClick={() => removeArt(i)}><X className="h-3 w-3" /></button>
                </span>
              ))}
              <button type="button" className={`${pill} h-14`} onClick={() => artRef.current?.click()}><ImagePlus className="h-3.5 w-3.5" />{arts.length ? "Add more artwork" : "Add artwork (PNG)"}</button>
              <input ref={artRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void addArt(e.target.files); e.target.value = ""; }} />
              {calibDirty && !ownImage && (
                <button type="button" className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#03AC13] bg-[#03AC13]/10 px-3 py-1.5 text-[12px] font-semibold" disabled={saveCalib.isPending}
                  onClick={() => saveCalib.mutate()} title="Locks this collar position (and body edges) to this blank, for every design">
                  <Save className="h-3.5 w-3.5" />{savedCalib ? "Collar moved — save for this blank" : `Save collar for ${blankName}`}
                </button>
              )}
              <button type="button" className={`${pill} ${calibDirty && !ownImage ? "" : "ml-auto"}`} onClick={() => setShowGuides((g) => !g)}>{showGuides ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{showGuides ? "Hide guides" : "Show guides"}</button>
            </div>
            <p className="mx-auto mt-2 max-w-[760px] text-[11.5px] text-[hsl(var(--ax-faint))]">Drag the print to move it · pull the white corner to size it · arrow keys nudge ⅛ in (Shift = 1 in) · [ and ] rotate 1° (Shift = 15°) · drag the green dot to the collar. Every artwork uses the same placement.</p>
            <p className="mx-auto mt-2 max-w-[760px] rounded-lg bg-[hsl(var(--ax-ink)/0.04)] px-3 py-2 text-[12.5px]">{line}</p>

            {batch.length > 0 && (
              <section className="ax-card mx-auto mt-4 max-w-[760px] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--ax-secondary))]">This batch · {batch.length} set{batch.length === 1 ? "" : "s"} · {batch.reduce((n, b) => n + b.colours.length, 0)} mockups</p>
                  <button type="button" className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#03AC13] px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                    disabled={!!batchSaving || batch.every((b) => b.status === "saved")} onClick={() => void saveBatch()}>
                    {batchSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {batchSaving ? `Saving ${batchSaving}…` : `Save all${viaReview ? " for review" : ""}`}
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {batch.map((b) => {
                    const ent = (entities.data ?? []).find((e) => e.id === b.clientId);
                    const withArt = (["front", "back"] as const).filter((v) => b.sides[v].arts[b.sides[v].idx]);
                    const v0 = withArt[0] ?? "front";
                    const sd = b.sides[v0];
                    const bw = 1000, bh = 1000 / b.aspect;
                    const bArt = sd.arts[sd.idx];
                    return (
                      <div key={b.id} className="rounded-xl border border-[hsl(var(--ax-border))] p-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold">{b.name}</span>
                          <span className="text-[11.5px] text-[hsl(var(--ax-faint))]">{ent?.name ?? "Client"} · {b.blankName} · {withArt.map((v) => (v === "front" ? "Front" : "Back")).join(" + ")} · {b.colours.length} colour{b.colours.length === 1 ? "" : "s"}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${b.status === "saved" ? "bg-[#03AC13]/15 text-[#03AC13]" : b.status === "error" ? "bg-red-500/15 text-red-500" : "bg-[hsl(var(--ax-ink)/0.06)]"}`} title={b.error}>
                            {b.status === "saved" ? "Saved" : b.status === "saving" ? "Saving…" : b.status === "error" ? "Didn't save" : "Not saved yet"}
                          </span>
                          <span className="ml-auto flex gap-1.5">
                            <button type="button" className={pill} onClick={() => { setPublishTarget(b); setPublishOpen(true); }}><ShoppingBag className="h-3.5 w-3.5" />Add to Shopify…</button>
                            {b.status !== "saved" && <button type="button" className={pill} onClick={() => loadFromBatch(b)} title="Put this set back on the canvas to change it">Edit</button>}
                            <button type="button" className={pill} aria-label={`Remove ${b.name} from the batch`} onClick={() => setBatch((all) => all.filter((x) => x.id !== b.id))}><X className="h-3.5 w-3.5" /></button>
                          </span>
                        </div>
                        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                          {b.colours.map((c) => {
                            const g = garmentOf(c, v0);
                            const cbx = boxFor(sd, c.id);
                            const car = bArt ? artRect(presetRect(cbx, sd.calib, bw, bh), bArt.aspect) : null;
                            return (
                              <span key={c.id} className="relative w-[64px] shrink-0 overflow-hidden rounded-md bg-[#f3f3f1]" title={c.name} style={{ aspectRatio: String(b.aspect) }}>
                                {g && <img src={g} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-fill" />}
                                {car && bArt && (
                                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${bw} ${bh}`} preserveAspectRatio="none" aria-hidden="true">
                                    <image href={bArt.url} x={car.x} y={car.y} width={car.w} height={car.h} preserveAspectRatio="none" transform={turn(cbx.rotationDeg, car)} />
                                  </svg>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11.5px] text-[hsl(var(--ax-faint))]">Keep going: swap the art (or the blank), tick the colours, and press <b>Add to batch</b> again. Nothing is saved until you press Save all.</p>
              </section>
            )}
            {tooBig && <p className="mx-auto mt-2 max-w-[760px] text-[12px] text-[hsl(var(--ax-red))]">Over the {MAX_PRINT.widthIn} × {MAX_PRINT.heightIn} in max print size.</p>}
          </div>

          <aside className="ax-card flex flex-col gap-4 self-start p-5">
            <div className="grid grid-cols-2 gap-2">
              <label className={`${label} col-span-2`}>Blank
                <select className={field} value={blankId} onChange={(e) => { setBlankId(e.target.value); setOwnImage(null); }}>
                  {list.map((b) => <option key={b.id} value={b.id}>{[b.brand, b.styleNumber].filter(Boolean).join(" ") || b.displayName || b.name}</option>)}
                </select>
              </label>
              <label className={label}>Colour
                <select className={field} value={colorId} onChange={(e) => { setColorId(e.target.value); setOwnImage(null); }}>
                  {colors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <div className={label}>View
                <div className="mt-1 flex gap-1">
                  {(["front", "back"] as const).map((v) => (
                    <button key={v} type="button" className={`${chip(view === v)} inline-flex items-center gap-1`} onClick={() => setView(v)}>
                      {v === "front" ? "Front" : "Back"}
                      {sides[v].arts.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-[#03AC13]" aria-label="has art" />}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#03AC13] px-3.5 py-2.5 text-[13px] font-semibold text-white" onClick={() => artRef.current?.click()}><ImagePlus className="h-4 w-4" />{arts.length ? "Upload more artwork" : "Upload artwork"}</button>
              {art?.cleanUrl && <label className="col-span-2 flex items-center gap-2 text-[12px] text-[hsl(var(--ax-secondary))]"><input type="checkbox" checked={art.cleaned} onChange={(e) => toggleClean(e.target.checked)} />Remove white background</label>}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setOwnImage(URL.createObjectURL(f)); e.target.value = ""; }} />
            </div>

            <div>
              <p className={label}>Presets</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <span key={`${p.id ?? "b"}-${p.name}`} className="inline-flex items-center">
                    <button type="button" className={chip(box.name === p.name && box.widthIn === p.widthIn && box.topIn === p.topIn)} onClick={() => setBox({ ...p, heightIn: art ? heightForArt(p.widthIn, art.aspect) : p.heightIn })}>{p.name}</button>
                    {p.id && <button type="button" aria-label={`Delete ${p.name}`} className="ml-0.5 text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-red))]" onClick={() => deletePreset.mutate(p.id!)}><Trash2 className="h-3 w-3" /></button>}
                  </span>
                ))}
              </div>
              {box.notes && <p className="mt-1.5 text-[11.5px] text-[hsl(var(--ax-faint))]">{box.notes}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <p className={label}>Print box</p>
              <Slider name="Width" value={box.widthIn} min={1} max={16} step={0.25} onChange={(v) => setDim("widthIn", v)} />
              <Slider name="Height" value={box.heightIn} min={0.5} max={20} step={0.25} onChange={(v) => setDim("heightIn", v)} />
              <label className="flex items-center gap-2 text-[12px] text-[hsl(var(--ax-secondary))]"><input type="checkbox" checked={lockSquare} onChange={(e) => setLockSquare(e.target.checked)} />Keep square while it is square</label>
              <Slider name="Top edge below collar" value={box.topIn} min={0} max={14} step={0.25} onChange={(v) => setBox((b) => ({ ...b, topIn: v, builtIn: false }))} />
              <Slider name="Left / right of centre" value={box.centerXIn} min={-8} max={8} step={0.25} onChange={(v) => setBox((b) => ({ ...b, centerXIn: v, builtIn: false }))} />
              <Slider name="Rotate" unit="°" value={rotation} min={-180} max={180} step={0.5} onChange={setRotation} />
              <div className="flex gap-1.5">
                <button type="button" className={pill} onClick={() => setRotation(rotation - 15)} aria-label="Rotate 15° left"><RotateCcw className="h-3.5 w-3.5" />15°</button>
                <button type="button" className={pill} onClick={() => setRotation(rotation + 15)} aria-label="Rotate 15° right"><RotateCw className="h-3.5 w-3.5" />15°</button>
                <button type="button" className={pill} disabled={!rotation} onClick={() => setRotation(0)}>Straighten</button>
              </div>
            </div>

            <details className="rounded-lg border border-[hsl(var(--ax-border))] px-3 py-2">
              <summary className="cursor-pointer text-[12px] font-semibold">Line the guides up with this photo</summary>
              <p className="mt-1 text-[11.5px] text-[hsl(var(--ax-faint))]">Drag the green dot up or down onto the collar seam; blue lines on the body edges at the armpits. Set the chest width of the sample, then save it for this blank.</p>
              <button type="button" className={`${pill} mt-2`} disabled={saveCalib.isPending || (!calibDirty && !!savedCalib) || !!ownImage} onClick={() => saveCalib.mutate()}>
                <Save className="h-3.5 w-3.5" />{calibDirty || !savedCalib ? `Save guides for ${blankName} (${view})` : `Saved for ${blankName} (${view})`}
              </button>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button type="button" className={pill} onClick={() => fileRef.current?.click()}><Shirt className="h-3.5 w-3.5" />{ownImage ? "Swap shirt photo" : "Use a different shirt photo"}</button>
                {ownImage && <button type="button" className={pill} onClick={() => setOwnImage(null)}><RotateCcw className="h-3.5 w-3.5" />Back to blank</button>}
              </div>
              <div className="mt-2 flex flex-col gap-2">
                <Slider name="Chest width (flat)" value={calib.chestWidthIn} min={16} max={30} step={0.5} onChange={(v) => setCalib((c) => ({ ...c, chestWidthIn: v }))} />
                <Slider name="Collar height" unit="%" value={Math.round(calib.collarY * 100)} min={5} max={45} step={0.5} onChange={(v) => setCalib((c) => ({ ...c, collarY: v / 100 }))} />
                <Slider name="Left body edge" unit="%" value={Math.round(calib.chestLeft * 100)} min={2} max={48} step={0.5} onChange={(v) => setCalib((c) => ({ ...c, chestLeft: clamp(v / 100, 0, c.chestRight - 0.05) }))} />
                <Slider name="Right body edge" unit="%" value={Math.round(calib.chestRight * 100)} min={52} max={98} step={0.5} onChange={(v) => setCalib((c) => ({ ...c, chestRight: clamp(v / 100, c.chestLeft + 0.05, 1) }))} />
              </div>
            </details>

            <label className={label}>Preset name
              <input className={field} value={box.name} onChange={(e) => setBox((b) => ({ ...b, name: e.target.value, builtIn: false }))} />
            </label>

            <div className="flex flex-wrap gap-2">
              <label className="flex w-full items-center gap-2 text-[12px] text-[hsl(var(--ax-secondary))]"><input type="checkbox" checked={everyColour} onChange={(e) => setEveryColour(e.target.checked)} />Every colour of this blank ({blank?.colors.length ?? 0}) — otherwise just {color?.name ?? "this colour"}</label>
              <div className="flex w-full flex-col gap-2 rounded-lg border-2 border-[#03AC13]/40 bg-[#03AC13]/[0.04] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--ax-secondary))]">Save to {client ? client.name : "a client"}</p>
                <div className="flex gap-2">
                  <input className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--ax-border))] bg-white px-2.5 py-1.5 text-[13px]" placeholder="Product name, e.g. Ice Man Tee" value={productName} onChange={(e) => setProductName(e.target.value)} />
                  <label className="flex w-[86px] items-center rounded-lg border border-[hsl(var(--ax-border))] bg-white px-2 text-[13px]" title="Retail price for Shopify">
                    $<input className="w-full bg-transparent py-1.5 pl-0.5 outline-none" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Price" />
                  </label>
                </div>
                <p className="text-[11.5px] text-[hsl(var(--ax-faint))]">
                  {!client ? "Pick a client in Client art above." : !sidesWithArt.length ? "Add art to the front or back first." : `${sidesWithArt.map((v) => (v === "front" ? "Front" : "Back")).join(" + ")} · ${saveColours.length} colour${saveColours.length === 1 ? "" : "s"} · ${blankName}`}
                </p>
                <button type="button" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#03AC13] px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                  disabled={!code || !sidesWithArt.length || !saveColours.length || !!saving || !!ownImage} onClick={() => void saveMockups()}
                  title={ownImage ? "Switch back to the blank photo to save — custom shirt photos aren't part of the blank library" : undefined}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {saving ? `Saving ${saving}…` : `Save ${saveColours.length > 1 ? `${saveColours.length} mockups` : "mockup"}`}
                </button>
                <button type="button" className={`${pill} justify-center`} disabled={!code || !sidesWithArt.length || !saveColours.length || !!ownImage} onClick={addToBatch}
                  title="Keep this set and start the next one (other art, other colours, another blank) — save them all at the end">
                  <Images className="h-3.5 w-3.5" />Add to batch{batch.length ? ` (${batch.length})` : ""}
                </button>
                <label className="flex items-center gap-2 text-[11.5px] text-[hsl(var(--ax-secondary))]"><input type="checkbox" checked={viaReview} onChange={(e) => setViaReview(e.target.checked)} />Send through Mockup Review first</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <Link to={openHref} className={`${pill} justify-center ${code ? "" : "pointer-events-none opacity-40"}`}><ExternalLink className="h-3.5 w-3.5" />Open mockups</Link>
                  <button type="button" className={`${pill} justify-center`} disabled={!sidesWithArt.length || !saveColours.length || !!ownImage} onClick={() => setPublishOpen(true)}
                    title="Pick the product, client and collection, then save + send to Shopify in one go">
                    <ShoppingBag className="h-3.5 w-3.5" />Add to Shopify…
                  </button>
                </div>
              </div>
              <div className="flex w-full flex-col gap-1.5 rounded-lg border border-[hsl(var(--ax-border))] p-2.5">
                <button type="button" className={`${pill} justify-center`} disabled={!mockupJobs.length || exporting} onClick={() => void exportMockups()}>
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Images className="h-3.5 w-3.5" />}
                  {arts.length ? `Download ${mockupJobs.length} mockup${mockupJobs.length === 1 ? "" : "s"}` : "Add artwork to download mockups"}
                </button>
              </div>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-ink))] px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" disabled={!photo || exporting} onClick={() => void exportPng()}>
                <Download className="h-3.5 w-3.5" />Placement guide
              </button>
              <button type="button" className={pill} onClick={() => { void navigator.clipboard.writeText(line).then(() => toast.success("Copied for GPT")); }}><Copy className="h-3.5 w-3.5" />Copy line</button>
              <button type="button" className={pill} disabled={savePreset.isPending} onClick={() => savePreset.mutate()}><Save className="h-3.5 w-3.5" />Save preset</button>
            </div>
          </aside>
        </div>
      )}
      <ShopifyPublishDialog
        open={publishOpen}
        onClose={() => { setPublishOpen(false); setPublishTarget(null); }}
        entities={entities.data ?? []}
        clientId={publishTarget?.clientId ?? clientId}
        onClientChange={(id) => { if (publishTarget) { setPublishTarget({ ...publishTarget, clientId: id }); setBatch((all) => all.map((x) => (x.id === publishTarget.id ? { ...x, clientId: id } : x))); } else pickClient(id); }}
        productName={publishTarget?.name ?? productName}
        price={price}
        productType={publishTarget?.productType ?? productType}
        summary={publishTarget ? `${publishTarget.name} · ${publishTarget.colours.length} colour${publishTarget.colours.length === 1 ? "" : "s"} (${publishTarget.colours.slice(0, 6).map((c) => c.name).join(", ")}${publishTarget.colours.length > 6 ? "…" : ""}) · ${publishTarget.blankName}` : `${sidesWithArt.map((v) => (v === "front" ? "Front" : "Back")).join(" + ") || "No art yet"} · ${saveColours.length} colour${saveColours.length === 1 ? "" : "s"}${saveColours.length ? ` (${saveColours.slice(0, 6).map((c) => c.name).join(", ")}${saveColours.length > 6 ? "…" : ""})` : ""} · ${blankName}`}
        busy={publishing ?? (saving ? `Saving ${saving}…` : null)}
        onPublish={(plan) => void publish(plan)}
      />
    </>
  );
}
