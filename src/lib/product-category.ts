// Derive a human-friendly product category from title + tags.
// Order matters — first match wins.
export const PRODUCT_CATEGORIES = [
  "Hoodies",
  "Crewnecks",
  "Long Sleeves",
  "Tank Tops",
  "Polos",
  "T-Shirts",
  "Sweatpants",
  "Shorts",
  "Hats",
  "Beanies",
  "Bags",
  "Stickers",
  "Phone Cases",
  "Other",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const CATEGORY_GROUPS: Record<string, ProductCategory[]> = {
  Tops: ["T-Shirts", "Hoodies", "Crewnecks", "Long Sleeves", "Tank Tops", "Polos"],
  Bottoms: ["Sweatpants", "Shorts"],
  Headwear: ["Hats", "Beanies"],
  Accessories: ["Bags", "Stickers", "Phone Cases", "Other"],
};

export function detectCategory(title: string, tags: string[] = []): ProductCategory {
  const hay = [title, ...tags].join(" ").toLowerCase();
  if (/\bhoodie\b/.test(hay)) return "Hoodies";
  if (/crew\s?neck/.test(hay)) return "Crewnecks";
  if (/long\s?sleeve/.test(hay)) return "Long Sleeves";
  if (/\btank\b/.test(hay)) return "Tank Tops";
  if (/\bpolo\b/.test(hay)) return "Polos";
  if (/\b(tee|t-?shirt)\b/.test(hay)) return "T-Shirts";
  if (/sweatpant|jogger/.test(hay)) return "Sweatpants";
  if (/\bshort(s)?\b/.test(hay)) return "Shorts";
  if (/\b(hat|cap)\b/.test(hay)) return "Hats";
  if (/\bbeanie\b/.test(hay)) return "Beanies";
  if (/\b(bag|backpack|tote)\b/.test(hay)) return "Bags";
  if (/sticker/.test(hay)) return "Stickers";
  if (/\bcase\b/.test(hay)) return "Phone Cases";
  return "Other";
}

export const PRICE_BUCKETS = [
  { id: "u25", label: "Under $25", test: (p: number) => p < 25 },
  { id: "25-50", label: "$25–$50", test: (p: number) => p >= 25 && p < 50 },
  { id: "50-75", label: "$50–$75", test: (p: number) => p >= 50 && p < 75 },
  { id: "75-100", label: "$75–$100", test: (p: number) => p >= 75 && p < 100 },
  { id: "o100", label: "Over $100", test: (p: number) => p >= 100 },
] as const;
export type PriceBucketId = (typeof PRICE_BUCKETS)[number]["id"];
