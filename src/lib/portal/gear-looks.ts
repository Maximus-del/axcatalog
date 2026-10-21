// My Gear: every colourway of a product as a "look" — a front and a back
// picture under one colour name — so a card can be flipped through like the
// Content & Drops grid.
//
// Pictures name their colour in one of three ways, tried in order:
//   1. linked to a colour's variants (Shopify image ids) or tagged by the Drive
//      library (image.color) — imagesForColor() already knows both;
//   2. nothing linked, but the files follow the library naming
//      (…-sulfur-brown-front.png): the part that differs between files is the
//      colour, the trailing front/back is the side;
//   3. neither — every picture is its own look, in the order AX set.
import type { PortalImage, PortalProduct } from "@/hooks/usePortalProducts";

export interface GearLook {
  /** Colour name for the label, or "" when it cannot be told. */
  label: string;
  front: string | null;
  back: string | null;
}

const SIDE = /[-_ ](front|back)(?:[-_ ]restored)?$/i;

function stem(url: string): string {
  const file = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");
  return file.replace(/\.[a-z0-9]+$/i, "");
}

/** Which side a picture shows: AX's choice, else the file name, else front. */
export function sideOf(img: Pick<PortalImage, "portalView" | "url">): "front" | "back" {
  if (img.portalView) return img.portalView;
  return /(^|[-_ ])back([-_ .]|$)/i.test(stem(img.url)) ? "back" : "front";
}

const title = (s: string) =>
  s
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

function lookOf(label: string, imgs: PortalImage[]): GearLook {
  const front = imgs.find((i) => sideOf(i) === "front") ?? imgs[0];
  const back = imgs.find((i) => i !== front && sideOf(i) === "back") ?? null;
  return { label, front: front?.url ?? null, back: back?.url ?? null };
}

/** Pure: colour keys from file names, by removing what every file shares. Exported for tests. */
export function colourKeysFromNames(urls: string[]): string[] | null {
  const keys = urls.map((u) => stem(u).replace(SIDE, "").toLowerCase());
  if (new Set(keys).size < 2) return null;
  let prefix = keys[0];
  for (const k of keys) while (!k.startsWith(prefix)) prefix = prefix.slice(0, -1);
  // Cut back to a word boundary so "...-p" of "pine"/"pistachio" stays in the colour.
  const cut = prefix.search(/[-_ ][^-_ ]*$/);
  const at = prefix.length === keys[0].length ? prefix.length : cut >= 0 ? cut + 1 : 0;
  const out = keys.map((k) => k.slice(at).replace(/^[-_ ]+/, ""));
  // Uploads named download_<uuid> or IMG_1234 have no colour in the name — don't print the hash as one.
  const wordy = (k: string) => k.length <= 24 && /^[a-z]+(?:[-_ ][a-z]+)*$/.test(k);
  return out.every((k) => k && wordy(k)) ? out : null;
}

export function gearLooks(
  product: Pick<PortalProduct, "images" | "colors" | "variants">,
  imagesForColor: (p: never, color: string) => PortalImage[],
): GearLook[] {
  const images = [...(product.images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  if (images.length === 0) return [];

  // 1. Colours the data links to pictures.
  const byColour = product.colors
    .map((c) => ({ name: c.name, imgs: imagesForColor(product as never, c.name) }))
    .filter((c) => c.imgs.length > 0);
  if (byColour.length > 1) return byColour.map((c) => lookOf(c.name, c.imgs));

  // 1b. Pictures tagged with their colour (metadata.drive_color / color).
  const tagged = images.filter((i) => i.color);
  if (tagged.length >= Math.ceil(images.length / 2)) {
    const groups = new Map<string, PortalImage[]>();
    for (const img of tagged) groups.set(img.color as string, [...(groups.get(img.color as string) ?? []), img]);
    if (groups.size > 1) return [...groups.entries()].map(([k, imgs]) => lookOf(k, imgs));
  }

  // 2. Colours the file names spell out.
  const keys = colourKeysFromNames(images.map((i) => i.url));
  if (keys) {
    const groups = new Map<string, PortalImage[]>();
    images.forEach((img, i) => groups.set(keys[i], [...(groups.get(keys[i]) ?? []), img]));
    return [...groups.entries()].map(([k, imgs]) => lookOf(title(k), imgs));
  }

  // 3. One look: front and back by side.
  return [lookOf(byColour[0]?.name ?? "", images)];
}
