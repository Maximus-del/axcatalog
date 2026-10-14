// Render a full garment mockup: the blank photo with the design composited
// into its print zone.
//
// Sibling to render-print-ready.ts, which crops to the zone for production.
// This one keeps the whole garment, because it becomes the product concept
// image an athlete actually looks at and approves. Same coordinate convention
// and the same object-contain fit, so what you see here is what gets printed.
import type { PrintZone } from "./print-zones";
import type { BoxPlacement } from "./render-print-ready";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image — check the bucket is public"));
    img.src = src;
  });
}

export interface MockupRequest {
  baseImageSrc: string;
  /** Either a File (freshly picked) or a URL (a design already in storage). */
  design: File | string;
  zone: PrintZone;
  placement?: Partial<BoxPlacement>;
  filename?: string;
  maxDim?: number;
}

const FILL: BoxPlacement = { x_pct: 0, y_pct: 0, w_pct: 1, h_pct: 1, rotation_deg: 0 };

export async function renderMockupPng(req: MockupRequest): Promise<File> {
  const placement: BoxPlacement = { ...FILL, ...req.placement };
  const maxDim = req.maxDim ?? 2000;

  const designSrc = typeof req.design === "string" ? req.design : URL.createObjectURL(req.design);
  const [base, design] = await Promise.all([loadImage(req.baseImageSrc), loadImage(designSrc)]);
  if (typeof req.design !== "string") URL.revokeObjectURL(designSrc);

  const scale = Math.min(1, maxDim / Math.max(base.naturalWidth, base.naturalHeight));
  const canvasW = Math.max(1, Math.round(base.naturalWidth * scale));
  const canvasH = Math.max(1, Math.round(base.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");

  ctx.drawImage(base, 0, 0, canvasW, canvasH);

  // Zone box in canvas pixels, then the placement rect inside that box.
  const zx = zoneAxis(req.zone.x, canvasW);
  const zy = zoneAxis(req.zone.y, canvasH);
  const zw = zoneAxis(req.zone.w, canvasW);
  const zh = zoneAxis(req.zone.h, canvasH);

  const rx = zx + placement.x_pct * zw;
  const ry = zy + placement.y_pct * zh;
  const rw = placement.w_pct * zw;
  const rh = placement.h_pct * zh;

  // object-contain, matching the editor preview exactly.
  const aspect = design.naturalWidth / design.naturalHeight;
  let drawW = rw;
  let drawH = rw / aspect;
  if (drawH > rh) {
    drawH = rh;
    drawW = rh * aspect;
  }
  const drawX = rx + (rw - drawW) / 2;
  const drawY = ry + (rh - drawH) / 2;

  ctx.save();
  // Artwork never escapes its zone, however it was dragged.
  ctx.beginPath();
  ctx.rect(zx, zy, zw, zh);
  ctx.clip();
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  ctx.translate(cx, cy);
  ctx.rotate((placement.rotation_deg * Math.PI) / 180);
  ctx.drawImage(design, drawX - cx, drawY - cy, drawW, drawH);
  ctx.restore();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"),
  );
  return new File([blob], req.filename ?? "mockup.png", { type: "image/png" });
}

function zoneAxis(fraction: number, total: number): number {
  return fraction * total;
}

// ---- Resolution -----------------------------------------------------------

export interface ResolutionCheck {
  dpi: number | null;
  ok: boolean;
  /** Plain-English problem, or null when it's fine. */
  warning: string | null;
}

/**
 * Is this artwork big enough for the area it's going into?
 *
 * 300 DPI is the print standard; below 150 it looks visibly soft on a garment.
 * Needs the zone's real-world size, which is why print_zones carries inches
 * as well as image fractions.
 */
export function checkResolution(input: {
  pixelWidth: number;
  pixelHeight: number;
  zoneWidthIn: number | null;
  zoneHeightIn: number | null;
}): ResolutionCheck {
  const { pixelWidth, pixelHeight, zoneWidthIn, zoneHeightIn } = input;
  if (!zoneWidthIn || !zoneHeightIn || !pixelWidth || !pixelHeight) {
    return { dpi: null, ok: true, warning: null };
  }
  // The tighter of the two axes decides — a wide-but-short file still prints soft.
  const dpi = Math.floor(Math.min(pixelWidth / zoneWidthIn, pixelHeight / zoneHeightIn));
  if (dpi >= 300) return { dpi, ok: true, warning: null };
  if (dpi >= 150) {
    return {
      dpi,
      ok: true,
      warning: `${dpi} DPI at ${zoneWidthIn}×${zoneHeightIn}in — usable, but 300 DPI prints noticeably sharper.`,
    };
  }
  return {
    dpi,
    ok: false,
    warning: `Only ${dpi} DPI at ${zoneWidthIn}×${zoneHeightIn}in. This will look soft — you want at least ${Math.ceil(zoneWidthIn * 300)}×${Math.ceil(zoneHeightIn * 300)}px.`,
  };
}
