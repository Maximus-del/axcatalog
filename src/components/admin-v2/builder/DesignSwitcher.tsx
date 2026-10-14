import { useMemo, useState } from "react";
import { Repeat, X } from "lucide-react";
import { useDesigns } from "@/lib/v2/data";
import { cleanDesignTitle } from "@/lib/v2/concepts";
import { designsInUse } from "@/lib/v2/design-swap";
import { AssetImage, Skeleton } from "../primitives";
import type { PlacedDesign } from "@/lib/v2/placement-geometry";
import type { Design } from "@/lib/v2/types";

// SWAP THE ARTWORK, KEEP THE PLACEMENT.
//
// The placement is the expensive part of a mockup: sized, positioned and
// judged against a photograph. Trying the other logo in the same spot should
// cost one click. This drawer picks the replacement; design-swap.ts does the
// (deliberately minimal) work.
//
// It is a drawer rather than another rail beside the canvas because swapping is
// a decision — "which of these two", looked at side by side and at a useful
// size — and the rail is sized for dragging, not for choosing.

export default function DesignSwitcher({
  entityId,
  placed,
  designsById,
  onSwap,
  onClose,
}: {
  entityId: string;
  placed: PlacedDesign[];
  designsById: Map<string, Design>;
  /** `fromDesignId` null means every placement. */
  onSwap: (toDesignId: string, fromDesignId: string | null) => void;
  onClose: () => void;
}) {
  const designs = useDesigns(entityId);
  const inUse = useMemo(() => designsInUse(placed), [placed]);

  /*
    WHAT IS BEING REPLACED.

    One design on the garment and there is no question to ask. Two or more and
    there is, so it gets asked rather than guessed — quietly replacing all
    three because someone clicked a thumbnail destroys work that took much
    longer to make than to lose.
  */
  const [replacing, setReplacing] = useState<string | null>(inUse.length === 1 ? inUse[0] : null);
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    const all = designs.data ?? [];
    const q = query.trim().toLowerCase();
    const matched = q ? all.filter((d) => (d.title ?? "").toLowerCase().includes(q)) : all;
    // What is already on the garment goes last: it is the thing being replaced.
    return [...matched].sort((a, b) => Number(inUse.includes(a.id)) - Number(inUse.includes(b.id)));
  }, [designs.data, query, inUse]);

  const ready = inUse.length <= 1 || replacing != null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="admin-os relative flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))] sm:h-[70vh] sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b border-[hsl(var(--ax-line))] px-4 py-3">
          <Repeat className="h-4 w-4 text-[hsl(var(--ax-accent))]" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Swap the design</div>
            <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
              The new artwork lands in exactly the same box, on every colourway in the run.
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {inUse.length > 1 && (
            <section className="mb-4">
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                Replace which one?
              </h4>
              <div className="flex flex-wrap gap-2">
                {inUse.map((id) => {
                  const d = designsById.get(id);
                  const active = replacing === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setReplacing(id)}
                      className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left text-[12px] transition-colors ${
                        active
                          ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]"
                          : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.6)]"
                      }`}
                    >
                      <AssetImage
                        bucket={d?.fileBucket ?? null}
                        path={d?.filePath ?? null}
                        alt={d?.title ?? "Design"}
                        className="h-8 w-8 rounded-lg bg-black/30"
                        fit="contain"
                        fallbackSeed={id}
                      />
                      <span className="max-w-[160px] truncate">
                        {cleanDesignTitle(d?.title) ?? d?.title ?? "Untitled design"}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setReplacing(null)}
                  className={`rounded-xl border px-3 py-1.5 text-[12px] transition-colors ${
                    replacing === null
                      ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]"
                      : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.6)]"
                  }`}
                >
                  All of them
                </button>
              </div>
            </section>
          )}

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this entity's designs"
            className="mb-3 w-full rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
          />

          {designs.isLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square" />
              ))}
            </div>
          ) : options.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-[hsl(var(--ax-faint))]">
              {query ? "No design matches that." : "This entity has no designs to swap in yet."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {options.map((d) => {
                const onGarment = inUse.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={!ready}
                    title={
                      onGarment
                        ? "Already on this garment"
                        : ready
                          ? `Put ${d.title} in the same box`
                          : "Choose which design to replace first"
                    }
                    onClick={() => {
                      onSwap(d.id, inUse.length <= 1 ? null : replacing);
                      onClose();
                    }}
                    className={`overflow-hidden rounded-xl border text-left transition-all disabled:opacity-40 ${
                      onGarment
                        ? "border-[hsl(var(--ax-accent)/0.5)]"
                        : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent))]"
                    }`}
                  >
                    <AssetImage
                      bucket={d.fileBucket}
                      path={d.filePath}
                      alt={d.title ?? "Design"}
                      className="aspect-square w-full bg-black/30"
                      fit="contain"
                      fallbackSeed={d.id}
                    />
                    <div className="truncate px-2 py-1.5 text-[11px]">
                      {cleanDesignTitle(d.title) ?? d.title ?? "Untitled"}
                    </div>
                    {onGarment && (
                      <div className="px-2 pb-1.5 text-[10px] text-[hsl(var(--ax-accent))]">on the garment</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-[hsl(var(--ax-line))] px-4 py-2.5 text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
          The box does not change shape. A design of a different aspect ratio will sit in the old one&rsquo;s
          proportions until you resize it — which is a difference worth seeing rather than one worth hiding.
        </div>
      </div>
    </div>
  );
}
