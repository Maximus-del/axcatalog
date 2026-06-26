import { useEffect, useState } from "react";
import { Download, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const filename = path.split("/").pop() ?? "design.png";

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setError("Missing design path");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void supabase.storage
      .from("design-files")
      .createSignedUrl(path, 3600)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data?.signedUrl) {
          console.error("createSignedUrl failed", err, path);
          setError(err?.message ?? "Could not load design");
          setUrl(null);
        } else {
          setUrl(data.signedUrl);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

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
        ) : error ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
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
        ) : error ? (
          <span className="text-[11px] text-destructive" title={error}>
            Design unavailable
          </span>
        ) : loading ? (
          <span className="text-[11px] text-muted-foreground">Loading link…</span>
        ) : null}
      </div>
    </div>
  );
}