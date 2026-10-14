import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, FolderOpen } from "lucide-react";
import { useDesignShelf } from "@/lib/v2/data";
import { buildShelf, coverOf } from "@/lib/v2/design-groups";
import { cleanDesignTitle } from "@/lib/v2/concepts";
import { AssetImage, Chip, Skeleton } from "../primitives";
import type { ShelfItem } from "@/lib/v2/design-groups";
import type { Design } from "@/lib/v2/types";

// CREATE MOCKUP — step 1, choosing the design.
//
// Split out of ConceptBuilder, which had grown to 1,899 lines with four
// screens' worth of presentation buried under the wizard that drives them.
// Nothing here holds wizard state: every one of these takes what it renders
// and hands back what was picked.

export function FlowCard({ title, blurb, onClick }: { title: string; blurb: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ax-card ax-card-hover px-4 py-4 text-left transition-all">
      <div className="text-[14px] font-medium">{title}</div>
      <div className="mt-0.5 text-[12px] text-[hsl(var(--ax-faint))]">{blurb}</div>
    </button>
  );
}

/**
 * Step 1, honouring design groups.
 *
 * A group on the shelf is a set of variations of one idea — three colourways of
 * the same wordmark, say. Flattening that into an undifferentiated grid here
 * would undo the organising the operator just did, and would make picking "the
 * navy one" a hunt through thirty lookalike thumbnails. Folders lead, open in
 * place, and a variation is selected individually — the mockup is always built
 * from one specific underlying design, never from "the group".
 */
export function GroupedDesignPicker({
  entityId,
  selectedId,
  onPick,
}: {
  entityId: string;
  selectedId: string | null;
  onPick: (d: Design) => void;
}) {
  const { data, isLoading } = useDesignShelf(entityId);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const items = useMemo(
    () => (data ? buildShelf(data.designs, data.groups, data.membership) : []),
    [data],
  );

  // Auto-open the folder holding the current selection, so stepping back to
  // this screen shows the operator where they already are.
  useEffect(() => {
    if (!selectedId) return;
    const owner = items.find((i) => i.kind === "group" && i.designs.some((d) => d.id === selectedId));
    if (owner) setOpenGroup(owner.key);
  }, [selectedId, items]);

  if (isLoading) return <GridSkeleton />;
  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-[hsl(var(--ax-faint))]">
        No designs linked to this entity yet. Switch to “All designs”.
      </p>
    );
  }

  const groups = items.filter((i): i is Extract<ShelfItem, { kind: "group" }> => i.kind === "group");
  const loose = items.filter((i): i is Extract<ShelfItem, { kind: "design" }> => i.kind === "design");

  return (
    <div className="space-y-5">
      {groups.length > 0 && (
        <section>
          <BandLabel>Folders</BandLabel>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
            {groups.map((g) => {
              const cover = coverOf(g.group, g.designs);
              const holdsSelection = g.designs.some((d) => d.id === selectedId);
              const isOpen = openGroup === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : g.key)}
                  className={`relative rounded-2xl border bg-[hsl(var(--ax-accent)/0.05)] p-2 text-left transition-all ${
                    isOpen || holdsSelection
                      ? "border-[hsl(var(--ax-accent))]"
                      : "border-[hsl(var(--ax-accent)/0.32)] hover:border-[hsl(var(--ax-accent)/0.6)]"
                  }`}
                >
                  <span
                    className="absolute inset-x-4 -top-1 h-1.5 rounded-t-lg border border-b-0 border-[hsl(var(--ax-accent)/0.28)] bg-[hsl(var(--ax-accent)/0.08)]"
                    aria-hidden
                  />
                  <AssetImage
                    bucket={cover?.fileBucket}
                    path={cover?.filePath}
                    alt={g.group.name}
                    className="aspect-square w-full rounded-lg bg-black/30"
                    fit="contain"
                    fallbackSeed={g.group.id}
                  />
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <FolderOpen className="h-3 w-3 shrink-0 text-[hsl(var(--ax-accent))]" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold">{g.group.name}</span>
                    <span className="text-[10px] tabular-nums text-[hsl(var(--ax-faint))]">{g.designs.length}</span>
                    <ChevronDown
                      className={`h-3 w-3 shrink-0 text-[hsl(var(--ax-faint))] transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </div>
                  {holdsSelection && !isOpen && (
                    <span className="mt-1 block text-[10px] font-medium text-[hsl(var(--ax-accent))]">
                      contains your selection
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {openGroup && (
            <div className="mt-3 rounded-2xl border border-[hsl(var(--ax-accent)/0.35)] bg-[hsl(var(--ax-accent)/0.04)] p-3">
              <p className="mb-2.5 text-[11px] text-[hsl(var(--ax-faint))]">
                Pick the exact variation to build this mockup from.
              </p>
              <FlatDesignGrid
                designs={groups.find((g) => g.key === openGroup)?.designs ?? []}
                selectedId={selectedId}
                onPick={onPick}
              />
            </div>
          )}
        </section>
      )}

      {loose.length > 0 && (
        <section>
          <BandLabel>Designs</BandLabel>
          <FlatDesignGrid designs={loose.map((i) => i.design)} selectedId={selectedId} onPick={onPick} />
        </section>
      )}
    </div>
  );
}

export function BandLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ax-secondary))]">
      {children}
    </div>
  );
}

export function FlatDesignGrid({
  designs,
  selectedId,
  onPick,
}: {
  designs: Design[];
  selectedId: string | null;
  onPick: (d: Design) => void;
}) {
  if (designs.length === 0) {
    return <p className="py-8 text-center text-[13px] text-[hsl(var(--ax-faint))]">Nothing here.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
      {designs.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onPick(d)}
          className={`ax-card ax-card-hover relative overflow-hidden p-0 text-left transition-all ${
            selectedId === d.id ? "ring-2 ring-[hsl(var(--ax-accent))]" : ""
          }`}
        >
          <AssetImage
            bucket={d.fileBucket}
            path={d.filePath}
            alt={d.title}
            className="aspect-square w-full bg-black/30"
            fit="contain"
          />
          {selectedId === d.id && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-[hsl(var(--ax-accent))] p-1 text-[hsl(var(--ax-on-accent))]">
              <Check className="h-3 w-3" />
            </span>
          )}
          <div className="p-2">
            <div className="truncate text-[11px]">{cleanDesignTitle(d.title) ?? d.title}</div>
            <div className="mt-1">
              {d.productionReady ? (
                <Chip tone="var(--ax-accent)">Production PNG</Chip>
              ) : (
                <Chip tone="var(--ax-amber)">Concept art</Chip>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square" />
      ))}
    </div>
  );
}
