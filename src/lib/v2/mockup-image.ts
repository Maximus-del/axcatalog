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
