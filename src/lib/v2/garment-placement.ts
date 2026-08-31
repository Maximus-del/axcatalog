// AX OS V2 — where artwork starts, per garment.
//
// THIS IS WHAT REPLACED PRINT ZONES.
//
// The old model was a table of named rectangles an operator picked from, and it
// was wrong twice over: it asked them to think in boxes rather than in garments,
// and it applied one set of boxes to everything with sleeves. What actually
// differs between a tee and a hoodie is not which zones exist — it is where a
// print naturally sits and how big it can be before it fights the hood, the
// pocket or the zip.
//
// So placement stays freeform and nothing snaps. What is per-garment is only the
// STARTING POINT: how wide a new piece of artwork lands, where its centre goes,
// and where the alignment lines begin. Every one of those is a default the
// operator moves in one drag, and none of them is recorded as a claim about
// where the artwork "is".
//
// The numbers are percentages of the garment photograph, which is always square.
// They are deliberately conservative — a default that lands slightly small and
// slightly high is one drag from right, whereas one that lands over the hem is
// a placement the operator has to rescue.

import type { Guides } from "./placement-geometry";

export interface GarmentDefaults {
  /** Artwork width as a percentage of the garment's width. */
  width: number;
  /** Centre of a new placement on the front. */
  front: { x: number; y: number };
  /** Centre of a new placement on the back. */
  back: { x: number; y: number };
  /** Where the alignment lines start on each surface. */
  guides: { front: Guides; back: Guides };
  /** One line, shown on the canvas, saying why these numbers. */
  note: string;
}

/** A chest print on a plain crew-neck top. The baseline everything else varies from. */
const TOP: GarmentDefaults = {
  width: 34,
  front: { x: 50, y: 34 },
  back: { x: 50, y: 32 },
  guides: { front: { x: 50, y: 34 }, back: { x: 50, y: 32 } },
  note: "Centre chest, upper back.",
};

/**
 * A left-chest start, for garments whose front is interrupted.
 *
 * x = 66 is the wearer's left, which is the viewer's right — the side a chest
 * mark goes on, and the side every one of AX's photographs shows it on.
 */
const LEFT_CHEST = { x: 66, y: 30 };

const BY_GARMENT: Record<string, GarmentDefaults> = {
  tee: TOP,
  long_sleeve: TOP,
  crewneck: TOP,
  jersey: TOP,

  hoodie: {
    width: 30,
    // Higher and smaller than a tee: the pouch pocket eats the lower third and
    // the hood shortens the usable chest.
    front: { x: 50, y: 31 },
    back: { x: 50, y: 30 },
    guides: { front: { x: 50, y: 31 }, back: { x: 50, y: 30 } },
    note: "Above the pocket; the hood shortens the chest.",
  },

  zip_hoodie: {
    width: 16,
    // A zip runs down the middle, so a centred front print is not a thing.
    front: LEFT_CHEST,
    back: { x: 50, y: 30 },
    guides: { front: { x: 66, y: 30 }, back: { x: 50, y: 30 } },
    note: "Left chest — the zip rules out a centred front.",
  },

  polo: {
    width: 12,
    // Same reason as the zip: a placket down the front.
    front: LEFT_CHEST,
    back: { x: 50, y: 30 },
    guides: { front: { x: 66, y: 30 }, back: { x: 50, y: 30 } },
    note: "Left chest — the placket rules out a centred front.",
  },

  tank: {
    width: 26,
    front: { x: 50, y: 35 },
    back: { x: 50, y: 33 },
    guides: { front: { x: 50, y: 35 }, back: { x: 50, y: 33 } },
    note: "Narrower: the straps cut the printable width.",
  },

  shorts: {
    width: 12,
    // Thigh, not centre. A shorts print sits on one leg.
    front: { x: 33, y: 48 },
    back: { x: 67, y: 44 },
    guides: { front: { x: 33, y: 48 }, back: { x: 67, y: 44 } },
    note: "One leg, small. Nothing prints across the fly.",
  },

  sweatpants: {
    width: 12,
    front: { x: 33, y: 40 },
    back: { x: 67, y: 36 },
    guides: { front: { x: 33, y: 40 }, back: { x: 67, y: 36 } },
    note: "Thigh, small. Nothing prints across the fly.",
  },

  hat: {
    width: 34,
    // The front panel is most of what you can see, and it is the only surface.
    front: { x: 50, y: 47 },
    back: { x: 50, y: 47 },
    guides: { front: { x: 50, y: 47 }, back: { x: 50, y: 47 } },
    note: "Front panel — the only printable surface.",
  },
};

BY_GARMENT.cap = BY_GARMENT.hat;

/**
 * Defaults for a garment type.
 *
 * An unrecognised or missing type falls back to the plain-top baseline and says
 * so, rather than guessing. Two of the thirteen live V2 blanks have no
 * garment_type at all.
 */
export function defaultsFor(garmentType: string | null | undefined): GarmentDefaults {
  const key = (garmentType ?? "").toLowerCase();
  const hit = BY_GARMENT[key];
  if (hit) return hit;
  return { ...TOP, note: "No garment type recorded — starting from a plain top." };
}

/** The centre a new placement should land on, for this garment and surface. */
export function startPoint(garmentType: string | null | undefined, surface: "front" | "back") {
  const d = defaultsFor(garmentType);
  return surface === "back" ? d.back : d.front;
}

/** Where the alignment lines start, for this garment and surface. */
export function startGuides(garmentType: string | null | undefined, surface: "front" | "back"): Guides {
  const d = defaultsFor(garmentType);
  return surface === "back" ? d.guides.back : d.guides.front;
}

/** Both surfaces at once, for seeding a builder that has just been given a blank. */
export function startGuidesBoth(garmentType: string | null | undefined): Record<string, Guides> {
  const d = defaultsFor(garmentType);
  return { front: d.guides.front, back: d.guides.back };
}
