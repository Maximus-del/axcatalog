// AX OS V2 — the Mockup Studio's working session.
//
// THE RULE THIS MODULE EXISTS TO ENFORCE:
// A PLACEMENT BELONGS TO A PRODUCT, NOT TO A SESSION.
//
// Placement geometry is percentages of the garment box, which is exactly why
// it transfers between COLOURWAYS of one garment — a chest hit sits on the
// chest whether the hoodie is Cream or Shadow, because it is the same
// photograph in a different colour. It is also exactly why it does NOT
// transfer between GARMENTS: 22% down a hoodie is the chest, 22% down a pair
// of sweatpants is the thigh.
//
// The builder used to hold one `placed[]` and apply it to every variant,
// including variants on entirely different blanks. The interface offered a
// grid of "other blanks" right under the colourways, which made copying a
// hoodie's placement onto pants look like the intended workflow. It was not;
// it was a bug with a UI in front of it.
//
// So the session is a list of PRODUCTS, each owning its own arrangement, and
// colourways live underneath their product:
//
//     ATHLETE
//       └── PRODUCT A ── placement A ── Cream, Black, Shadow
//       └── PRODUCT B ── placement B ── Black, Cream
//
// Everything here is pure. The builder holds one StudioSession in state and
// this module answers every question about it.

import type { Guides, PlacedDesign } from "./placement-geometry";
import { DEFAULT_GUIDES } from "./placement-geometry";
import type { Blank } from "./types";

export interface StudioProduct {
  /**
   * Stable local id. Not the blank id: the same blank can legitimately appear
   * twice in a session with two different arrangements.
   */
  key: string;
  blankId: string;
  /** The colourway the canvas shows and the placement is judged against. */
  masterColor: string | null;
  /** Every colourway to create. The master is always in here. */
  colorNames: string[];
  /**
   * THIS product's SHARED arrangement — what a colourway shows when it has not
   * been adjusted. Never read from or written to another product.
   */
  placed: PlacedDesign[];
  /**
   * Colourways that have been hand-tuned away from the shared arrangement.
   *
   * WHY THIS EXISTS: colourway photography is not pixel-aligned. The same
   * hoodie shot in Cream and in Shadow can sit a couple of percent apart in
   * frame, so a chest hit that is perfect on one reads slightly low on the
   * other. Percentages transfer the INTENT between colours; they do not
   * guarantee the result, and the operator is the one who can see the
   * difference.
   *
   * Keyed by colour name. Absent means "inherit the shared arrangement", which
   * is why a colourway added later still gets the placement made before it
   * existed.
   */
  overrides: Record<string, PlacedDesign[]>;
  guides: Record<string, Guides>;
  /**
   * Colourways of this product that have already been written to the library.
   *
   * The studio does not close when you save, so without this a second Save
   * would create every mockup again. Saved colourways stay visible in the
   * session strip with a tick — they are what you just made — but they are no
   * longer work waiting to happen.
   *
   * A product saved with no colourway at all records SAVED_NO_COLOR.
   */
  saved: string[];
}

/** Stand-in key for "saved without a colourway", so the list stays strings. */
export const SAVED_NO_COLOR = "\u0000none";

export interface StudioSession {
  entityId: string;
  products: StudioProduct[];
  /** Which product the editor is currently showing. */
  activeKey: string | null;
}

let counter = 0;
/** Local only, and never stored anywhere a collision would matter. */
export function productKey(): string {
  counter += 1;
  return `p${Date.now().toString(36)}${counter}`;
}

export function emptySession(entityId: string): StudioSession {
  return { entityId, products: [], activeKey: null };
}

export function newProduct(input: {
  blankId: string;
  colorName?: string | null;
  placed?: PlacedDesign[];
  guides?: Record<string, Guides>;
  key?: string;
}): StudioProduct {
  const master = input.colorName ?? null;
  return {
    key: input.key ?? productKey(),
    blankId: input.blankId,
    masterColor: master,
    colorNames: master ? [master] : [],
    placed: input.placed ?? [],
    overrides: {},
    guides: input.guides ?? { front: DEFAULT_GUIDES, back: DEFAULT_GUIDES },
    saved: [],
  };
}

/** Nothing left to write for this product. */
export function isFullySaved(product: StudioProduct): boolean {
  const names = product.colorNames.length > 0 ? product.colorNames : [SAVED_NO_COLOR];
  return names.every((n) => product.saved.includes(n));
}

/** Record what a save actually created, so the next one does not repeat it. */
export function markSaved(session: StudioSession, done: Array<{ productKey: string; colorName: string | null }>) {
  const byProduct = new Map<string, string[]>();
  for (const d of done) {
    const list = byProduct.get(d.productKey) ?? [];
    list.push(d.colorName ?? SAVED_NO_COLOR);
    byProduct.set(d.productKey, list);
  }
  return {
    ...session,
    products: session.products.map((p) => {
      const added = byProduct.get(p.key);
      if (!added) return p;
      return { ...p, saved: [...new Set([...p.saved, ...added])] };
    }),
  };
}

export function activeProduct(session: StudioSession): StudioProduct | null {
  return session.products.find((p) => p.key === session.activeKey) ?? null;
}

export function productAt(session: StudioSession, key: string): StudioProduct | null {
  return session.products.find((p) => p.key === key) ?? null;
}

/** Replace one product, leaving the rest of the session untouched. */
export function updateProduct(
  session: StudioSession,
  key: string,
  change: (product: StudioProduct) => StudioProduct,
): StudioSession {
  return { ...session, products: session.products.map((p) => (p.key === key ? change(p) : p)) };
}

/** Apply a change to whichever product is on screen. A no-op when none is. */
export function updateActive(
  session: StudioSession,
  change: (product: StudioProduct) => StudioProduct,
): StudioSession {
  return session.activeKey ? updateProduct(session, session.activeKey, change) : session;
}

export function addProduct(session: StudioSession, product: StudioProduct): StudioSession {
  return { ...session, products: [...session.products, product], activeKey: product.key };
}

/**
 * Drop a product and everything under it.
 *
 * The next product takes focus rather than leaving the editor pointing at
 * nothing — removing the third of four should not empty the canvas.
 */
export function removeProduct(session: StudioSession, key: string): StudioSession {
  const index = session.products.findIndex((p) => p.key === key);
  if (index === -1) return session;
  const products = session.products.filter((p) => p.key !== key);
  const nextActive =
    session.activeKey !== key
      ? session.activeKey
      : (products[index]?.key ?? products[index - 1]?.key ?? products[0]?.key ?? null);
  return { ...session, products, activeKey: nextActive };
}

export function setActive(session: StudioSession, key: string): StudioSession {
  return session.products.some((p) => p.key === key) ? { ...session, activeKey: key } : session;
}

/**
 * Tick or untick a colourway.
 *
 * The master cannot be unticked: it is the colour the arrangement was made
 * against and the one the canvas is showing. Removing it would leave a product
 * whose placement refers to a garment shot nobody selected.
 */
export function toggleColor(product: StudioProduct, name: string): StudioProduct {
  if (product.colorNames.includes(name)) {
    if (name === product.masterColor) return product;
    return { ...product, colorNames: product.colorNames.filter((c) => c !== name) };
  }
  return { ...product, colorNames: [...product.colorNames, name] };
}

/**
 * Make a different colourway the one the canvas shows.
 *
 * Selecting it too, because you cannot judge a placement against a colour you
 * are not producing.
 */
export function setMaster(product: StudioProduct, name: string): StudioProduct {
  return {
    ...product,
    masterColor: name,
    colorNames: product.colorNames.includes(name) ? product.colorNames : [...product.colorNames, name],
  };
}

/* ------------------------------------------------ per-colourway placement */

/** What this colourway actually shows: its own adjustment, or the shared one. */
export function placementFor(product: StudioProduct, colorName: string | null): PlacedDesign[] {
  if (colorName && product.overrides[colorName]) return product.overrides[colorName];
  return product.placed;
}

/** Has this colourway been hand-tuned away from the shared arrangement? */
export function isAdjusted(product: StudioProduct, colorName: string | null): boolean {
  return Boolean(colorName && product.overrides[colorName]);
}

export function adjustedColors(product: StudioProduct): string[] {
  return Object.keys(product.overrides);
}

/**
 * Record a drag.
 *
 * THE FIRST PLACEMENT IS SHARED; EVERY LATER ONE IS LOCAL.
 *
 * Nothing placed yet means this is the arrangement for the product, so it goes
 * to the shared slot and every colourway — including ones added tomorrow —
 * inherits it. That is what makes "place once, get thirteen" work.
 *
 * After that, a drag only ever moves the colourway on screen. Adjusting Shadow
 * because its photograph sits low must not silently move Cream, which somebody
 * already approved. Apply to all is how propagation happens, deliberately.
 */
export function setPlacement(
  product: StudioProduct,
  colorName: string | null,
  next: PlacedDesign[],
): StudioProduct {
  if (product.placed.length === 0 || !colorName) return { ...product, placed: next };
  return { ...product, overrides: { ...product.overrides, [colorName]: next } };
}

/**
 * Push this colourway's arrangement out to every colourway of this product.
 *
 * Clears the overrides too: after this they all genuinely share one
 * arrangement, and leaving stale per-colour copies behind would mean the next
 * edit to the shared placement quietly failed to reach them.
 */
export function applyToAll(product: StudioProduct, colorName: string | null): StudioProduct {
  return { ...product, placed: placementFor(product, colorName), overrides: {} };
}

/** Put one colourway back on the shared arrangement. */
export function resetToShared(product: StudioProduct, colorName: string): StudioProduct {
  if (!product.overrides[colorName]) return product;
  const overrides = { ...product.overrides };
  delete overrides[colorName];
  return { ...product, overrides };
}

/**
 * The product's colourways, master first.
 *
 * The master leads because it is the one the canvas is showing and the one the
 * placement was judged against; the rest are its inheritors.
 */
export function orderedColors(product: StudioProduct): string[] {
  const master = product.masterColor;
  if (!master) return [...product.colorNames];
  return [master, ...product.colorNames.filter((c) => c !== master)];
}

/**
 * Has this product been given an arrangement yet?
 *
 * A product added mid-session starts empty on purpose. Seeding it from the
 * previous garment is precisely the mistake this module exists to prevent, and
 * seeding it invisibly from a default would rob the operator of the one signal
 * that says "this one still needs you".
 */
export function needsPlacement(product: StudioProduct): boolean {
  return product.placed.length === 0 && Object.keys(product.overrides).length === 0;
}

export function sessionNeedsPlacement(session: StudioSession): StudioProduct[] {
  return session.products.filter(needsPlacement);
}

export interface SessionVariant {
  productKey: string;
  blankId: string;
  blankName: string;
  colorName: string | null;
  photographed: boolean;
  /** The arrangement for THIS variant, which is its product's. */
  placed: PlacedDesign[];
  guides: Record<string, Guides>;
}

function hasPhoto(blank: Blank | undefined, colorName: string | null): boolean {
  if (!blank) return false;
  if (!colorName) return Boolean(blank.imageUrl);
  const c = blank.colors.find((x) => x.name === colorName);
  return Boolean(c?.imageUrl ?? blank.imageUrl);
}

/**
 * Every mockup this session would create, in order, each carrying its own
 * product's placement.
 *
 * A product with no colourways selected still produces one mockup: a colourway
 * is a refinement, not a requirement, and a concept may exist without one.
 * Products still awaiting a placement are excluded — saving a mockup with an
 * empty arrangement writes a row that looks finished and is not.
 */
export function sessionVariants(session: StudioSession, blanksById: Map<string, Blank>): SessionVariant[] {
  const out: SessionVariant[] = [];
  const seen = new Set<string>();

  for (const product of session.products) {
    if (needsPlacement(product)) continue;
    const blank = blanksById.get(product.blankId);
    const names = product.colorNames.length > 0 ? product.colorNames : [null];
    for (const colorName of names) {
      // Already in the library — a second Save must not make it twice.
      if (product.saved.includes(colorName ?? SAVED_NO_COLOR)) continue;
      const key = `${product.blankId}::${colorName ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        productKey: product.key,
        blankId: product.blankId,
        blankName: blank?.name ?? "Garment",
        colorName,
        photographed: hasPhoto(blank, colorName),
        // Its own adjustment when it has one, the shared arrangement otherwise.
        placed: placementFor(product, colorName),
        guides: product.guides,
      });
    }
  }

  return out;
}

/** How many mockups the session would save right now. */
export function sessionSize(session: StudioSession, blanksById: Map<string, Blank>): number {
  return sessionVariants(session, blanksById).length;
}

/** Nothing has been decided yet — used to tell an empty studio from a real one. */
export function isEmptySession(session: StudioSession): boolean {
  return session.products.length === 0;
}
