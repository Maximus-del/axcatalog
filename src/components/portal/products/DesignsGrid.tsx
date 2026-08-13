// Mobile-first. Designs AX created for the athlete — put one on a garment.
import { useNavigate } from "react-router-dom";
import { Palette, ArrowRight } from "lucide-react";
import { usePortalDesigns, type PortalDesign } from "@/hooks/usePortalDesigns";
import { useSignedUrl } from "@/lib/storage";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalData } from "@/components/portal/PortalDataContext";

function DesignThumb({ design }: { design: PortalDesign }) {
  const { url } = useSignedUrl(design.file?.bucket ?? null, design.file?.path ?? null);
  if (url) {
    return <img src={url} alt={design.title ?? "Design"} loading="lazy" className="h-full w-full object-cover" />;
  }
  return (
    <div className="h-full w-full flex items-center justify-center text-accent/60">
      <Palette className="h-8 w-8" />
    </div>
  );
}

export function DesignsGrid() {
  const navigate = useNavigate();
  const { athlete } = usePortalData();
  const { designs, loading } = usePortalDesigns(athlete.id);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!designs || designs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-accent/12 flex items-center justify-center mb-3">
          <Palette className="h-5 w-5 text-accent" />
        </div>
        <p className="text-sm font-medium">Ready to build your first collection?</p>
        <button
          onClick={() => navigate("/portal/studio")}
          className="mt-3 text-sm font-semibold text-accent"
        >
          Start a Design →
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {designs.map((d) => (
        <button
          key={d.id}
          onClick={() =>
            navigate({ pathname: "/portal/build/custom", search: `?design=${d.id}` })
          }
          className="pressable text-left rounded-2xl border border-border bg-card overflow-hidden hover:border-accent/40 transition-colors"
        >
          <div className="aspect-square bg-muted">
            <DesignThumb design={d} />
          </div>
          <div className="p-3">
            <div className="font-semibold text-sm truncate">{d.title ?? "Untitled design"}</div>
            <span className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
              Put This Design On <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
