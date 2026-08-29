// AX OS V2 — rendering a client-safe preview from production artwork.
//
// WHY THIS EXISTS
//
// Marking a design "visible as preview" has to actually produce something for
// the client to look at, and that something must not be the production file.
// The rendition made here differs from the production asset in three ways that
// all matter:
//
//   1. No alpha channel. It is composited onto an opaque background and encoded
//      as JPEG, so it cannot be dropped straight onto a garment mockup or sent
//      to a printer. Transparency is most of what makes a production PNG
//      valuable; removing it removes most of the incentive to take it.
//   2. Presentation resolution, not production resolution. Long edge capped at
//      PREVIEW_MAX_EDGE — comfortably sharp on a retina screen, useless for
//      apparel printing.
//   3. A different bucket, so storage policy can grant a client access to this
//      and nothing else.
//
// What it deliberately does NOT do is stamp a watermark across the artwork.
// A visible watermark tells a client you expect them to steal from you, which
// is a bad note to strike with someone you want to sell to — and it does not
// stop a determined person anyway. The protection here is that the valuable
// file is never handed over in the first place.
//
// Rendering happens in the operator's browser, using the session that is
// already authorised to read `design-files`. No edge function, no service key,
// no new infrastructure.

import { supabase } from "@/integrations/supabase/client";
import { getSignedUrl } from "@/lib/storage";

export const PREVIEW_BUCKET = "design-previews";

/** Long edge, in CSS pixels. Generous on screen, useless on a press. */
export const PREVIEW_MAX_EDGE = 1400;

/** Opaque ground the artwork is flattened onto. Neutral so it flatters nothing and distorts nothing. */
const PREVIEW_BACKGROUND = "#12131a";

const PREVIEW_QUALITY = 0.82;

export interface PreviewResult {
  path: string;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Render one design's artwork into a client-safe rendition and record it.
 *
 * Throws on failure — the caller decides how loudly to complain. Notably it
 * throws rather than falling back to the production file, because a silent
 * fallback here would quietly undo the entire separation.
 */
export async function generatePreview(
  designId: string,
  sourceBucket: string,
  sourcePath: string,
): Promise<PreviewResult> {
  const signed = await getSignedUrl(sourceBucket, sourcePath, 120);
  if (!signed) throw new Error("Could not read the source artwork");

  const image = await loadImage(signed);
  const { canvas, width, height } = drawFlattened(image);
  const blob = await canvasToBlob(canvas);

  // One live rendition per design. The timestamp keeps CDN and signed-URL
  // caches from serving the previous image after a re-render.
  const path = `${designId}/preview-${Date.now()}.jpg`;

  const upload = await supabase.storage
    .from(PREVIEW_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (upload.error) throw upload.error;

  // Replace rather than accumulate: stale rows would keep resolving to images
  // the operator believes they have replaced.
  await supabase
    .from("design_files" as never)
    .delete()
    .eq("design_id", designId)
    .eq("file_type", "preview");

  const insert = await supabase.from("design_files" as never).insert({
    design_id: designId,
    file_type: "preview",
    storage_bucket: PREVIEW_BUCKET,
    storage_path: path,
    file_name: path.split("/").pop() ?? "preview.jpg",
    file_extension: "jpg",
    file_size_bytes: blob.size,
    mime_type: "image/jpeg",
    is_primary: false,
    sort_order: 0,
    metadata: {
      generated_by: "admin-v2",
      source_bucket: sourceBucket,
      source_path: sourcePath,
      max_edge: PREVIEW_MAX_EDGE,
    },
  } as never);
  if (insert.error) throw insert.error;

  return { path, width, height, bytes: blob.size };
}

/* ----------------------------------------------------------------- internals */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Required, or the canvas is tainted and toBlob() throws a security error.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The artwork could not be loaded for rendering"));
    img.src = url;
  });
}

function drawFlattened(image: HTMLImageElement) {
  const sw = image.naturalWidth || image.width;
  const sh = image.naturalHeight || image.height;
  if (!sw || !sh) throw new Error("The artwork has no usable dimensions");

  // Only ever scale down. Upscaling a small asset would invent detail and make
  // the preview look worse than the artwork actually is.
  const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * scale));
  const height = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser could not render the preview");

  // Fill first: this is what removes the alpha channel.
  ctx.fillStyle = PREVIEW_BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, width, height);

  return { canvas, width, height };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The preview could not be encoded"))),
      "image/jpeg",
      PREVIEW_QUALITY,
    );
  });
}
