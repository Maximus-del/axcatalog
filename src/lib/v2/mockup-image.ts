// AX OS V2 — which picture IS the mockup.
//
// A mockup row carries two images and they are not interchangeable:
//
//   image_url                    the BLANK's photograph — the garment it was
//                                built on, usually a Google Drive link.
//   storage_bucket/storage_path  the COMPOSITE — that garment with the artwork
//                                flattened onto it, in the private `mockups`
//                                bucket.
//
// The composite is the mockup. The garment shot is what it was made from.
//
// AssetImage prefers a `url` over a bucket/path pair and only signs the pair
// when no url is given, so every surface that passed both — the library shelf,
// the folder covers, Creative's rails, the athlete overview — was showing the
// bare garment and never once reaching for the composite. Every mockup looked
// like an empty hoodie.
//
// One helper, so there is one answer.

export interface MockupCoverSource {
  imageUrl?: string | null;
  imageBucket?: string | null;
  imagePath?: string | null;
}

export interface MockupCover {
  url?: string | null;
  bucket?: string | null;
  path?: string | null;
  /** False when this is the bare garment because no composite has rendered yet. */
  isComposite: boolean;
}

/**
 * The image that represents a mockup, and whether it is the real thing.
 *
 * `url` is deliberately undefined when a composite exists — passing both would
 * hand AssetImage the garment again, which is the bug this exists to end.
 */
export function mockupCover(m: MockupCoverSource): MockupCover {
  if (m.imageBucket && m.imagePath) {
    return { url: undefined, bucket: m.imageBucket, path: m.imagePath, isComposite: true };
  }
  return { url: m.imageUrl ?? null, bucket: null, path: null, isComposite: false };
}

/** True when this mockup has never had its artwork flattened onto the garment. */
export function needsComposite(m: MockupCoverSource): boolean {
  return !(m.imageBucket && m.imagePath);
}

/**
 * When the image proxy went live.
 *
 * Before this moment, flattening a mockup could not draw the garment at all:
 * V2 blank photography is Google Drive, Drive sends no CORS header, and a
 * canvas that cannot read its own contents back saved artwork on a bare
 * background instead. So EVERY composite older than this is missing its
 * garment — not "might be", is. Anything newer was rendered by code that
 * refuses to save a garmentless composite at all.
 */
export const PREVIEW_FIX_SHIPPED_AT = "2026-09-01T00:50:00.000Z";

export interface StaleCheck extends MockupCoverSource {
  previewGeneratedAt?: string | null;
}

/**
 * Is this mockup showing a preview that was built before the garment could be
 * drawn?
 *
 * A mockup with no composite at all is NOT stale — it falls back to the
 * garment photograph, which is honest. Stale means it has a saved preview that
 * is known to be wrong.
 */
export function hasStalePreview(m: StaleCheck, cutoff = PREVIEW_FIX_SHIPPED_AT): boolean {
  if (needsComposite(m)) return false;
  // A composite with no timestamp predates the column being written, so it is
  // older than the fix by definition.
  if (!m.previewGeneratedAt) return true;
  const at = new Date(m.previewGeneratedAt).getTime();
  if (!Number.isFinite(at)) return true;
  return at < new Date(cutoff).getTime();
}
