// AX OS V2 — flattening a mockup into a shareable image.
//
// Composites the garment photograph and every placement into one JPEG, using
// the same percentage geometry the canvas renders from, so what downloads is
// what the operator arranged.
//
// This is a PRESENTATION export, not a production file: opaque, screen
// resolution, JPEG. It is the thing you drop into a text message or a deck. The
// production artwork stays where it is — see blank-image.ts and the client
// visibility work for why that separation is load-bearing.

import { getSignedUrl } from "@/lib/storage";
import type { PlacedDesign } from "./placement-geometry";
import type { Design } from "./types";

/** Long edge of the export. Generous on screen, useless on a press. */
export const EXPORT_SIZE = 1600;
const BACKGROUND = "#0f1116";
const QUALITY = 0.9;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be loaded for export"));
    img.src = url;
  });
}

/** Artwork lives in a private bucket, so it needs signing before it can be drawn. */
async function resolveArtworkUrl(design: Design | undefined): Promise<string | null> {
  if (!design) return null;
  if (design.fileBucket && design.filePath) {
    return getSignedUrl(design.fileBucket, design.filePath, 120);
  }
  return null;
}

export interface ExportRequest {
  garmentUrl: string | null;
  placed: PlacedDesign[];
  designsById: Map<string, Design>;
  filename: string;
}

/**
 * Draw the composition and hand back a JPEG blob.
 *
 * Artwork that cannot be loaded is skipped rather than aborting the whole
 * export — a mockup with one unreadable file should still produce the rest of
 * the image, and the caller reports how many were missed.
 */
export async function renderMockupJpeg(req: ExportRequest): Promise<{ blob: Blob; skipped: number }> {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_SIZE;
  canvas.height = EXPORT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not render the export");

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (req.garmentUrl) {
    try {
      const garment = await loadImage(req.garmentUrl);
      // object-contain, matching how the canvas displays it.
      const scale = Math.min(EXPORT_SIZE / garment.naturalWidth, EXPORT_SIZE / garment.naturalHeight);
      const w = garment.naturalWidth * scale;
      const h = garment.naturalHeight * scale;
      ctx.drawImage(garment, (EXPORT_SIZE - w) / 2, (EXPORT_SIZE - h) / 2, w, h);
    } catch {
      // A missing garment shot still leaves a usable artwork-only export.
    }
  }

  let skipped = 0;
  for (const p of req.placed) {
    const url = await resolveArtworkUrl(req.designsById.get(p.designId));
    if (!url) {
      skipped += 1;
      continue;
    }
    try {
      const art = await loadImage(url);
      const x = (p.box.x / 100) * EXPORT_SIZE;
      const y = (p.box.y / 100) * EXPORT_SIZE;
      const w = (p.box.w / 100) * EXPORT_SIZE;
      const h = (p.box.h / 100) * EXPORT_SIZE;

      ctx.save();
      if (p.rotation) {
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.translate(-(x + w / 2), -(y + h / 2));
      }
      // Preserve the artwork's own aspect inside its box, as the canvas does.
      const aspect = art.naturalWidth / art.naturalHeight;
      const boxAspect = w / h;
      const drawW = aspect > boxAspect ? w : h * aspect;
      const drawH = aspect > boxAspect ? w / aspect : h;
      ctx.drawImage(art, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH);
      ctx.restore();
    } catch {
      skipped += 1;
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The export could not be encoded"))), "image/jpeg", QUALITY),
  );
  return { blob, skipped };
}

/** Turn a mockup title into a filename someone can find again. */
export function exportFilename(title: string, surface: string): string {
  const base = title.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase() || "mockup";
  return `${base}-${surface}.jpg`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
