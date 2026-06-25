import { Download } from "lucide-react";
import { useSignedUrl } from "@/lib/storage";
import type { OrderItemCustomization as Customization } from "@/hooks/useAdminOrderDetail";

interface Props {
  customization: Customization;
}

export function OrderItemCustomizationCell({ customization }: Props) {
  const { url } = useSignedUrl("design-files", customization.design_url, 3600);
  const filename = customization.design_url.split("/").pop() ?? "design.png";
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