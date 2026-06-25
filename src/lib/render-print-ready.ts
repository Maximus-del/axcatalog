import type { PrintZone } from "./print-zones";

/** Placement expressed as percentages of the print-zone box (0..1). May be negative or >1 — outside parts get clipped. */
export interface BoxPlacement {
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  rotation_deg: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Composites the design onto a canvas sized to the print zone in base-image
 * pixels, clipped to the zone rectangle. Returns the exported PNG as a File.
 *
 * The design is fit (object-contain) inside the placement rect — matching the
 * editor preview — then rotated about its center.
 */
export async function renderPrintReadyPng(opts: {
  baseImageSrc: string;
  designFile: File;
  zone: PrintZone;
  placement: BoxPlacement;
  filename: string;
  maxDim?: number;
}): Promise<File> {
  const { baseImageSrc, designFile, zone, placement, filename } = opts;
  const maxDim = opts.maxDim ?? 4096;

  const [base, design] = await Promise.all([
    loadImage(baseImageSrc),
    loadImage(URL.createObjectURL(designFile)),
  ]);

  // Canvas at zone pixel dimensions (relative to base image natural size).
  let canvasW = Math.max(1, Math.round(zone.w * base.naturalWidth));
  let canvasH = Math.max(1, Math.round(zone.h * base.naturalHeight));
  const scaleDown = Math.min(1, maxDim / Math.max(canvasW, canvasH));
  canvasW = Math.max(1, Math.round(canvasW * scaleDown));
  canvasH = Math.max(1, Math.round(canvasH * scaleDown));

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");

  // Placement rect inside the canvas (box coords → canvas pixels).
  const rx = placement.x_pct * canvasW;
  const ry = placement.y_pct * canvasH;
  const rw = placement.w_pct * canvasW;
  const rh = placement.h_pct * canvasH;

  // object-contain fit of the design inside (rw, rh).
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
  // Clip to canvas (zone) bounds — anything outside is cut off.
  ctx.beginPath();
  ctx.rect(0, 0, canvasW, canvasH);
  ctx.clip();

  // Rotate around the placement rect's center.
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  ctx.translate(cx, cy);
  ctx.rotate((placement.rotation_deg * Math.PI) / 180);
  ctx.drawImage(design, drawX - cx, drawY - cy, drawW, drawH);
  ctx.restore();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/png",
    ),
  );
  return new File([blob], filename, { type: "image/png" });
}