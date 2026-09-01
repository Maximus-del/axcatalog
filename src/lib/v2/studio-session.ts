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
  /** THIS product's arrangement. Never read from or written to another product. */
  placed: PlacedDesign[];
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
  return product.placed.length === 0;
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
        placed: product.placed,
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
