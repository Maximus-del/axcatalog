import { Download } from "lucide-react";
import { useSignedUrl } from "@/lib/storage";
import type { OrderItemCustomization as Customization } from "@/hooks/useAdminOrderDetail";

interface Props {
  customization: Customization;
}

/**
 * Normalize design_url to a plain object path inside the design-files bucket.
 * Handles cases where it was stored as a full Supabase URL, a public/sign URL,
 * or with a leading bucket prefix or slash.
 */
function normalizeDesignPath(input: string): string {
  let path = input.trim();
  // Strip full URL down to the path after the bucket name.
  const marker = "/design-files/";
  const idx = path.indexOf(marker);
  if (idx !== -1) {
    path = path.slice(idx + marker.length);
  }
  // Strip query string (signed URL tokens).
  const q = path.indexOf("?");
  if (q !== -1) path = path.slice(0, q);
  // Strip leading slash or bucket prefix.
  path = path.replace(/^\/+/, "");
  if (path.startsWith("design-files/")) path = path.slice("design-files/".length);
  return path;
}

export function OrderItemCustomizationCell({ customization }: Props) {
  const path = normalizeDesignPath(customization.design_url);
  const { url } = useSignedUrl("design-files", path, 3600);
  const filename = path.split("/").pop() ?? "design.png";
  const surfaceLabel =
    customization.surface_label ??
    (customization.surface === "back" ? "Back" : "Front");

  return (
    <div className="flex items-start gap-3">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="h-14 w-14 rounded bg-white border border-border flex items-center justify-center overflow-hidden shrink-0"
        aria-label="Open design"
      >
        {url ? (
          <img
            src={url}
            alt="Customer design"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="text-[10px] text-muted-foreground">…</span>
        )}
      </a>
      <div className="min-w-0 space-y-1">
        <div className="text-xs">
          <span className="font-medium text-foreground">{surfaceLabel}</span>
          <span className="text-muted-foreground"> · {customization.placement_label}</span>
        </div>
        {url ? (
          <a
            href={url}
            download={filename}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
          >
            <Download className="h-3 w-3" />
            Download design
          </a>
        ) : (
          <span className="text-[11px] text-muted-foreground">Loading link…</span>
        )}
      </div>
    </div>
  );
}