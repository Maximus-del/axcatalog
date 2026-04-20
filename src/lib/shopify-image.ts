// Mobile-first. Test at 375px before merging.
//
// Append a width param to a Shopify CDN URL so we don't ship 2000px
// images to a 375px screen. Safe no-op for non-Shopify URLs.

export function shopifyImg(url: string | null | undefined, width = 400): string | null {
  if (!url) return null;
  // Only rewrite Shopify CDN URLs
  if (!/cdn\.shopify\.com/i.test(url)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}