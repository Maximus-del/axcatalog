// Mobile-first. AX blank garments — select one, then choose a design.
import { useNavigate } from "react-router-dom";
import { Shirt, ArrowRight } from "lucide-react";
import { usePortalBlanks } from "@/hooks/usePortalBlanks";
import { Skeleton } from "@/components/ui/skeleton";

export function BlanksGrid() {
  const navigate = useNavigate();
  const { blanks, loading } = usePortalBlanks();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!blanks || blanks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
        New AX blanks will appear here.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {blanks.map((b) => (
        <button
          key={b.id}
          onClick={() =>
            navigate({ pathname: "/portal/build/custom", search: `?blank=${b.id}` })
          }
          className="pressable text-left rounded-2xl border border-border bg-card overflow-hidden flex flex-col hover:border-accent/40 transition-colors"
        >
          <div className="h-24 bg-gradient-to-br from-accent/15 to-transparent flex items-center justify-center">
            <Shirt className="h-8 w-8 text-accent/70" />
          </div>
          <div className="p-3 flex-1 flex flex-col">
            <div className="font-semibold text-sm leading-tight">{b.name}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {[b.garment_type, b.vendor].filter(Boolean).join(" · ") || "Blank"}
            </div>
            {b.colors.length > 0 && (
              <div className="mt-2 flex items-center gap-1">
                {b.colors.slice(0, 6).map((c, i) => (
                  <span
                    key={i}
                    className="h-3.5 w-3.5 rounded-full border border-border"
                    style={{ background: c.hex ?? "hsl(var(--muted))" }}
                    title={c.name}
                  />
                ))}
                {b.colors.length > 6 && (
                  <span className="text-[10px] text-muted-foreground ml-0.5">+{b.colors.length - 6}</span>
                )}
              </div>
            )}
            <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent">
              Choose Design <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
