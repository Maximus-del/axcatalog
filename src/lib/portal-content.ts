// Content Library helpers — product-tagged assets, product links, captions,
// and Post Kits. Athlete-agnostic. Where AX hasn't uploaded typed content
// (videos/graphics) the library shows honest empty states.
import type { PortalProduct } from "@/hooks/usePortalProducts";

// BACKEND: storefront base — move to org settings when the editable AX
// storefront lands. Falls back to the Shopify handle for now.
const STORE_BASE = "https://athletexclusive.com/products/";

export interface ContentAsset {
  id: string;
  url: string;
  productId: string;
  productTitle: string;
  productLink: string | null;
  isPrimary: boolean;
}

export function buildProductLink(p: Pick<PortalProduct, "shopify_handle" | "slug">): string | null {
  if (p.shopify_handle) return `${STORE_BASE}${p.shopify_handle}`;
  return null;
}

export function suggestedCaption(p: PortalProduct, firstName: string): string {
  const options = [
    `New drop 🔥 The ${p.title} is live. Link in bio.`,
    `${firstName}'s ${p.title} — limited run. Grab yours.`,
    `Rep the brand. ${p.title} available now 👇`,
  ];
  // Deterministic pick so it's stable per product.
  const idx = p.id.charCodeAt(0) % options.length;
  return options[idx];
}

export function flattenAssets(products: PortalProduct[]): ContentAsset[] {
  const out: ContentAsset[] = [];
  for (const p of products) {
    const link = buildProductLink(p);
    for (const img of p.images) {
      out.push({
        id: img.id,
        url: img.url,
        productId: p.id,
        productTitle: p.title,
        productLink: link,
        isPrimary: img.is_primary,
      });
    }
  }
  return out;
}

export interface PostKit {
  productId: string;
  productTitle: string;
  productLink: string | null;
  caption: string;
  assets: ContentAsset[];
  photoCount: number;
}

export function buildPostKits(products: PortalProduct[], firstName: string): PostKit[] {
  return products
    .filter((p) => p.images.length > 0)
    .map((p) => {
      const assets = flattenAssets([p]);
      return {
        productId: p.id,
        productTitle: p.title,
        productLink: buildProductLink(p),
        caption: suggestedCaption(p, firstName),
        assets,
        photoCount: assets.length,
      };
    });
}

/* Clipboard + share helpers (return a status the UI can toast/animate). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareLink(url: string, title: string): Promise<"shared" | "copied" | "failed"> {
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title, url });
      return "shared";
    } catch {
      return "failed";
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}
