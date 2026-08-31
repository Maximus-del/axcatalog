// AX OS V2 — where a click in the blank catalog goes.
//
// EVERY DESTINATION IN THE CATALOG IS A URL, NOT COMPONENT STATE.
//
// The catalog used to open a blank in a drawer held in `useState`. That drawer
// could not be linked to, could not be reopened by the browser's back button,
// and vanished on refresh — so "look at the Cool Blue hoodie" was not a thing
// one operator could send to another. A colourway is a real place in the
// product, so it gets a real address.
//
// Construction and parsing both live here so the grid, the detail page and the
// photography audit cannot drift on what `?color=` means.

import type { Blank, BlankColor } from "./types";

export const CATALOG_PATH = "/admin-v2/commerce";
export const BLANKS_PATH = `${CATALOG_PATH}/blanks`;

export type CatalogTab = "overview" | "blanks" | "products" | "collections";
/** Which slice of the catalog the audience switch is showing. */
export type AccessFilter = "in" | "out" | "all";

export interface CatalogView {
  tab?: CatalogTab;
  audience?: string;
  access?: AccessFilter;
  /** Data-completeness filter: missing_cost | missing_photo | missing_assortment. */
  filter?: string | null;
  /** Free-text search. */
  q?: string;
}

function query(entries: Array<[string, string | null | undefined]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value == null || value === "") continue;
    params.set(key, value);
  }
  const out = params.toString();
  return out ? `?${out}` : "";
}

/**
 * The catalog itself, with its filters in the address bar.
 *
 * This is what makes browser-back out of a blank land you on the same shelf you
 * left — audience, slice, filter and search included — rather than on a reset
 * grid you then have to re-filter.
 */
export function catalogHref(view: CatalogView = {}): string {
  return (
    CATALOG_PATH +
    query([
      ["tab", view.tab],
      ["audience", view.audience],
      ["access", view.access === "in" ? null : view.access],
      ["filter", view.filter],
      ["q", view.q?.trim() ? view.q.trim() : null],
    ])
  );
}

/**
 * One blank, optionally opened at one colourway.
 *
 * The colour travels as its NAME rather than its row id on purpose: a name is
 * what `mockups.color_name` stores, it survives a Drive re-sync that renumbers
 * rows, and it is readable in a pasted link.
 */
export function blankHref(blankId: string, colorName?: string | null, surface?: "front" | "back"): string {
  return `${BLANKS_PATH}/${blankId}` + query([["color", colorName], ["surface", surface === "back" ? "back" : null]]);
}

/** Loose match so a hand-typed or re-cased link still lands. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Turn a `?color=` value into an actual colourway.
 *
 * Falls back through exact name, loose name, then row id — the last because
 * links built before names were the canonical handle are still in circulation.
 * An unrecognised value resolves to null rather than to an arbitrary colour:
 * showing the wrong garment is worse than showing none.
 */
export function resolveColorway(blank: Blank | null | undefined, param: string | null | undefined): BlankColor | null {
  if (!blank || !param) return null;
  const exact = blank.colors.find((c) => c.name === param);
  if (exact) return exact;
  const target = normalize(param);
  const loose = blank.colors.find((c) => normalize(c.name) === target);
  if (loose) return loose;
  return blank.colors.find((c) => c.id === param) ?? null;
}

/**
 * What to show when no colourway was asked for.
 *
 * A photographed colour beats an unphotographed one, because the point of the
 * big view is to show the garment — landing on a colour with no image would
 * make a populated blank look empty.
 */
export function defaultColorway(blank: Blank | null | undefined): BlankColor | null {
  if (!blank || blank.colors.length === 0) return null;
  const available = blank.colors.filter((c) => c.available);
  const pool = available.length > 0 ? available : blank.colors;
  return pool.find((c) => c.imageUrl) ?? pool[0];
}

/**
 * The name an OPERATOR sees in the catalog.
 *
 * `displayName` is the client-facing name and `name` is the manufacturer's; an
 * operator wants the client name when one has been set and the sourcing name
 * otherwise. Client-facing surfaces must NOT use this — they render
 * `displayName` or nothing, because falling back here would leak the
 * manufacturer.
 */
export function catalogTitle(blank: Pick<Blank, "name" | "displayName">): string {
  const display = blank.displayName?.trim();
  return display || blank.name || "Untitled blank";
}

/** The manufacturer's own name, shown only when it differs from the title. */
export function sourcingName(blank: Pick<Blank, "name" | "displayName">): string | null {
  const display = blank.displayName?.trim();
  if (!display) return null;
  const name = blank.name?.trim();
  return name && name !== display ? name : null;
}
