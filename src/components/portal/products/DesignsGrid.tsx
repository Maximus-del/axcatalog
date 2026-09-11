// Mobile-first. Designs AX has shared with this entity — put one on a garment.
//
// Thumbnails are signed against CLIENT_PREVIEW_BUCKET only. The bucket is a
// constant, never a value read from a row, so this surface cannot be talked
// into signing a production file. See AX_CLIENT_VISIBILITY.md.
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Palette, ArrowRight, Clock } from "lucide-react";
import { usePortalDesigns } from "@/hooks/usePortalDesigns";
import { CLIENT_PREVIEW_BUCKET, shelfState, type PortalDesign } from "@/lib/portal/client-designs";
import { useSignedUrl } from "@/lib/storage";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalData } from "@/components/portal/PortalDataContext";

function DesignThumb({ design }: { design: PortalDesign }) {
  const { url } = useSignedUrl(
    design.previewPath ? CLIENT_PREVIEW_BUCKET : null,
    design.previewPath,
  );
  if (url) {
    return <img src={url} alt={design.title} loading="lazy" className="h-full w-full object-cover" />;
  }
  return (
    <div className="h-full w-full flex items-center justify-center text-accent/60">
      <Palette className="h-8 w-8" />
    </div>
  );
}

function Panel({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-accent/12 flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
      {action && (
        <button onClick={action.onClick} className="mt-3 text-sm font-semibold text-accent">
          {action.label}
        </button>
      )}
    </div>
  );
}

export function DesignsGrid() {
  const navigate = useNavigate();
  const { athlete } = usePortalData();
  const { designs } = usePortalDesigns(athlete.id);
  const state = shelfState(designs);

  if (state === "loading") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
    );
  }

  if (state === "nothing-shared") {
    return (
      <Panel
        icon={<Palette className="h-5 w-5 text-accent" />}
        title="Ready to build your first collection?"
        action={{ label: "Start a Design →", onClick: () => navigate("/portal/studio") }}
      />
    );
  }

  if (state === "previews-pending") {
    return (
      <Panel
        icon={<Clock className="h-5 w-5 text-accent" />}
        title="Your designs are being prepared"
        body="Your AX team is finishing previews. They'll appear here as soon as they're ready."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {(designs ?? []).map((d) => (
        <button
          key={d.id}
          onClick={() => navigate({ pathname: "/portal/build/custom", search: `?design=${d.id}` })}
          className="pressable text-left rounded-2xl border border-border bg-card overflow-hidden hover:border-accent/40 transition-colors"
        >
          <div className="aspect-square bg-muted">
            <DesignThumb design={d} />
          </div>
          <div className="p-3">
            <div className="font-semibold text-sm truncate">{d.title}</div>
            {d.designNumber && (
              <div className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                {d.designNumber}
              </div>
            )}
            <span className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
              Put This Design On <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
