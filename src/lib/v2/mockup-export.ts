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

import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/lib/storage";
import { planFor, proxiedUrl } from "./image-cors";

// The client module is generated and exports only the configured client, so
// the two public values the proxy URL needs are repeated here rather than
// re-derived from it. Both already ship in the browser bundle.
const SUPABASE_URL = "https://cuidofxidstqpgypxcop.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1aWRvZnhpZHN0cXBneXB4Y29wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzEwNzUsImV4cCI6MjA5MTk0NzA3NX0.1wSiRagMq_UROmq2vK7b7zxu8ZIcMyW4ensPwREWBQ8";
import type { PlacedDesign } from "./placement-geometry";
import type { Design } from "./types";

/** Long edge of the export. Generous on screen, useless on a press. */
export const EXPORT_SIZE = 1600;
const BACKGROUND = "#0f1116";
const QUALITY = 0.9;

function loadOnce(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    /*
      REQUIRED, AND THE REASON THE PROXY EXISTS.

      Without crossOrigin the image draws but the canvas is TAINTED and
      toBlob() throws, so there is no export at all. With it, the load fails
      outright unless the host sends Access-Control-Allow-Origin. There is no
      third option, which is why a host that sends no header has to be fetched
      through something that does.
    */
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url.slice(0, 80)}`));
    img.src = url;
  });
}

/**
 * Load an image in a state a canvas can be read back from.
 *
 * Google Drive — where all V2 blank photography lives — sends no CORS header,
 * so a direct load throws and the garment vanishes from the export. Those go
 * through the image-proxy edge function. An unknown host gets one direct
 * attempt and falls back to the proxy if it refuses, so a new photography host
 * works without a code change as long as the proxy will relay it.
 */
async function loadImage(url: string): Promise<HTMLImageElement> {
  const plan = planFor(url);
  if (plan.kind === "proxy") return loadOnce(proxiedUrl(url, SUPABASE_URL, SUPABASE_ANON_KEY));
  try {
    return await loadOnce(url);
  } catch (err) {
    if (plan.kind === "asis") throw err;
    return loadOnce(proxiedUrl(url, SUPABASE_URL, SUPABASE_ANON_KEY));
  }
}

/** Artwork lives in a private bucket, so it needs signing before it can be drawn. */
async function resolveArtworkUrl(design: Design | undefined): Promise<string | null> {
  if (!design) return null;
  if (design.fileBucket && design.filePath) {
    return getSignedUrl(design.fileBucket, design.filePath, 120);
  }
  return null;
}

export interface ExportResult {
  blob: Blob;
  /** How many placements could not be drawn. */
  skipped: number;
  /**
   * Did the garment actually make it into the image?
   *
   * False means what came out is artwork on a flat background. That used to be
   * swallowed, and the result was months of previews and downloads with no
   * garment in them that nobody could see was wrong from the file alone.
   */
  garmentDrawn: boolean;
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
export async function renderMockupJpeg(req: ExportRequest): Promise<ExportResult> {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_SIZE;
  canvas.height = EXPORT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not render the export");

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  let garmentDrawn = false;
  if (req.garmentUrl) {
    try {
      const garment = await loadImage(req.garmentUrl);
      // object-contain, matching how the canvas displays it.
      const scale = Math.min(EXPORT_SIZE / garment.naturalWidth, EXPORT_SIZE / garment.naturalHeight);
      const w = garment.naturalWidth * scale;
      const h = garment.naturalHeight * scale;
      ctx.drawImage(garment, (EXPORT_SIZE - w) / 2, (EXPORT_SIZE - h) / 2, w, h);
      garmentDrawn = true;
    } catch (err) {
      // Still produce the image — artwork alone is occasionally what someone
      // wants — but SAY SO. The caller decides whether that is acceptable.
      console.error("mockup export: the garment could not be drawn", err);
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
  return { blob, skipped, garmentDrawn };
}

/** Turn a mockup title into a filename someone can find again. */
export function exportFilename(title: string, surface: string): string {
  const base = title.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").toLowerCase() || "mockup";
  return `${base}-${surface}.jpg`;
}

/**
 * Render the composite and store it as the mockup's own image.
 *
 * WHY THIS EXISTS: a mockup card was showing the bare garment photograph,
 * because `image_url` held the blank's shot and nothing had ever flattened the
 * artwork onto it. So every card in the library looked like an empty hoodie and
 * you could not tell one mockup from another. The composite IS what the mockup
 * is; it should be what you see.
 *
 * Ordering is forced by the storage policy: the `mockups` bucket resolves the
 * first folder of the object path back to a mockup row, so the row must exist
 * before its image can be written. Hence mockupId is required, and this runs
 * after the insert rather than as part of it.
 *
 * Failure is deliberately soft. A mockup whose preview did not render is still
 * a saved mockup with a correct arrangement — it just falls back to the garment
 * shot until the next save. Losing the record over a canvas error would be a
 * much worse trade.
 */
export type StoreResult =
  | { ok: true; bucket: string; path: string }
  /** `garment` means the photograph could not be drawn; `render` is everything else. */
  | { ok: false; reason: "garment" | "render"; message?: string };

export async function storeMockupComposite(args: {
  mockupId: string;
  garmentUrl: string | null;
  placed: PlacedDesign[];
  designsById: Map<string, Design>;
}): Promise<StoreResult> {
  try {
    const { blob, garmentDrawn } = await renderMockupJpeg({
      garmentUrl: args.garmentUrl,
      placed: args.placed,
      designsById: args.designsById,
      filename: "composite.jpg",
    });

    /*
      A COMPOSITE WITHOUT THE GARMENT IS WORSE THAN NO COMPOSITE.

      Saving it makes it the mockup's cover, so the shelf fills with dark
      squares carrying a floating logo — strictly less informative than the
      bare garment photograph the card falls back to. Refusing to store it
      keeps the fallback and lets the caller say what went wrong.
    */
    if (!garmentDrawn) return { ok: false, reason: "garment" };

    const path = `${args.mockupId}/composite-${Date.now()}.jpg`;
    const up = await supabase.storage
      .from("mockups")
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw up.error;

    const patch = await supabase
      .from("mockups" as never)
      .update({
        storage_bucket: "mockups",
        storage_path: path,
        file_name: path.split("/").pop() ?? "composite.jpg",
        file_type: "image/jpeg",
        file_size: blob.size,
        preview_generated_at: new Date().toISOString(),
      } as never)
      .eq("id", args.mockupId);
    if (patch.error) throw patch.error;

    return { ok: true, bucket: "mockups", path };
  } catch (err) {
    console.error("mockup composite failed", err);
    return { ok: false, reason: "render", message: err instanceof Error ? err.message : undefined };
  }
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
