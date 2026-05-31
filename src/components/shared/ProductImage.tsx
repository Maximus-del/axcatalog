// Mobile-first. Test at 375px before merging.
//
// Single rendering path for product images across admin and athlete portal.
// Fixes the drift where the athlete side showed broken <img> alt text
// while the admin side rendered fine.
//
// viewMode:
//   - "admin"   → full-res (1200px) so admins can vet the actual asset.
//   - "athlete" → downsized (400px card / 800px hero) to protect raw assets
//                 and keep the portal snappy. Right-click-save still works.
//
// Fallback chain (in order):
//   1. Primary image (is_primary=true, or first by sort_order)
//   2. Next image in the list
//   3. Shirt placeholder icon — never a broken <img> glyph
//
// When the primary image fails, we best-effort flag the row with
// metadata.last_render_failed = true so admins can see degraded products
// on the master grid. Failures are silent (RLS may block athletes from
// writing — that's fine, admins still see their own writes).

import { useEffect, useMemo, useState } from "react";
import { Shirt } from "lucide-react";
import { shopifyImg } from "@/lib/shopify-image";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface ProductImageRef {
  id?: string;
  url: string | null;
  is_primary?: boolean;
  sort_order?: number;
}

interface Props {
  /** Ordered list of candidate images. Pass [] for none. */
  images?: ProductImageRef[];
  /** Convenience for callers with a single URL (admin grid). */
  url?: string | null;
  alt: string;
  viewMode: "admin" | "athlete";
  /** "card" ~400px, "hero" ~1200px. Athlete hero caps at 800. */
  size?: "card" | "hero";
  className?: string;
  imgClassName?: string;
  /** Called when we land on a successfully-loaded image (id available). */
  onResolved?: (ref: ProductImageRef) => void;
  /** Disable the flag-write (useful in admin preview contexts). */
  flagFailures?: boolean;
}

function variantWidth(viewMode: "admin" | "athlete", size: "card" | "hero"): number {
  if (viewMode === "admin") return size === "hero" ? 1200 : 600;
  return size === "hero" ? 800 : 400;
}

function resolvedSrc(url: string, width: number): string {
  if (!url) return url;
  // Shopify CDN — append width
  if (/cdn\.shopify\.com/i.test(url)) return shopifyImg(url, width) ?? url;
  // Supabase storage public URL — render transform
  if (/\/storage\/v1\/object\/public\//i.test(url)) {
    try {
      const u = new URL(url);
      // Use Supabase render endpoint if available; else add a width param.
      const transformed = url.replace("/object/public/", "/render/image/public/");
      const tu = new URL(transformed);
      tu.searchParams.set("width", String(width));
      tu.searchParams.set("resize", "contain");
      return tu.toString();
    } catch {
      return url;
    }
  }
  return url;
}

async function flagFailed(id: string | undefined) {
  if (!id) return;
  try {
    const { data } = await supabase
      .from("product_images")
      .select("metadata")
      .eq("id", id)
      .maybeSingle();
    const meta = (data?.metadata as Record<string, unknown> | null) ?? {};
    await supabase
      .from("product_images")
      .update({
        metadata: {
          ...meta,
          last_render_failed: true,
          last_render_failed_at: new Date().toISOString(),
        },
      })
      .eq("id", id);
  } catch {
    /* best-effort; RLS may deny */
  }
}

export function ProductImage({
  images,
  url,
  alt,
  viewMode,
  size = "card",
  className,
  imgClassName,
  onResolved,
  flagFailures = true,
}: Props) {
  const list = useMemo<ProductImageRef[]>(() => {
    if (images && images.length) {
      return [...images].sort(
        (a, b) =>
          Number(b.is_primary ?? false) - Number(a.is_primary ?? false) ||
          (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
    }
    if (url) return [{ url }];
    return [];
  }, [images, url]);

  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [list]);

  const width = variantWidth(viewMode, size);
  const current = list[idx];
  const finalSrc = current?.url ? resolvedSrc(current.url, width) : null;

  if (!finalSrc) {
    return (
      <div
        className={cn(
          "h-full w-full flex items-center justify-center bg-muted/40",
          className,
        )}
        aria-label={alt}
      >
        <Shirt className="h-12 w-12 text-muted-foreground/40" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={finalSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn("h-full w-full object-contain", imgClassName)}
      onLoad={() => current && onResolved?.(current)}
      onError={() => {
        if (idx === 0 && flagFailures) void flagFailed(current?.id);
        if (idx < list.length - 1) setIdx(idx + 1);
        else setIdx(list.length); // sentinel → placeholder next render
      }}
    />
  );
}