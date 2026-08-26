// AX OS V2 — access and price are different questions about the same Blank.
//
//   ACCESS: is this Blank in the audience's assortment?  (blank_assortment_items)
//   PRICE:  what does that audience pay?                 (blanks.price_* columns)
//
// A Blank is never duplicated to give a different audience a different number.

import type { AudienceKey, Blank } from "./types";

export const AUDIENCES: { key: AudienceKey; label: string; priceField: keyof Blank; blurb: string }[] = [
  { key: "athlete", label: "Athlete", priceField: "priceAthlete", blurb: "Athlete Catalog" },
  { key: "client", label: "Client", priceField: "priceCorporate", blurb: "Client Catalog" },
  { key: "subscriber", label: "Subscriber", priceField: "priceStandard", blurb: "Subscriber Catalog" },
  { key: "standard", label: "Standard", priceField: "priceStandard", blurb: "Standard Catalog" },
];

/** Price this audience pays for this blank, or null when unpriced. */
export function priceFor(blank: Blank, audience: AudienceKey): number | null {
  const spec = AUDIENCES.find((a) => a.key === audience);
  if (!spec) return null;
  const value = blank[spec.priceField];
  return typeof value === "number" ? value : null;
}

/** Is this blank visible to this audience? Empty assortments = not yet placed. */
export function hasAccess(blank: Blank, audience: AudienceKey): boolean {
  return blank.assortments.includes(audience);
}

/**
 * Which audience an entity's role implies. An entity with several roles gets
 * the most favourable catalog — athlete beats client beats standard.
 */
export function audienceForRoles(roles: string[]): AudienceKey {
  if (roles.includes("athlete")) return "athlete";
  if (roles.includes("client") || roles.includes("partner")) return "client";
  return "standard";
}

export function marginFor(blank: Blank, audience: AudienceKey): number | null {
  const price = priceFor(blank, audience);
  if (price == null || blank.cost == null || blank.cost === 0) return null;
  return (price - blank.cost) / price;
}

export function fmtMoney(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${Math.round(v * 100)}%`;
}
