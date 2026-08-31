import { useMemo, useState } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";
import { useDesignShelf } from "@/lib/v2/data";
import { buildShelf } from "@/lib/v2/design-groups";
import { cleanDesignTitle } from "@/lib/v2/concepts";
import { DRAG_MIME } from "@/lib/v2/placement-geometry";
import { AssetImage, Skeleton } from "../primitives";
import type { ShelfItem } from "@/lib/v2/design-groups";
import type { Design } from "@/lib/v2/types";

// CREATE MOCKUP — the design rail beside the canvas.
//
// Split out of ConceptBuilder. A second design goes on the same garment by
// dragging it from here, so this is a source of drags rather than a picker.

export function MockupDesignRail({ entityId, onQuickAdd }: { entityId: string; onQuickAdd: (d: Design) => void }) {
  const { data, isLoading } = useDesignShelf(entityId);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const items = useMemo(
    () => (data ? buildShelf(data.designs, data.groups, data.membership) : []),
    [data],
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-2 lg:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    );
  }

  const groups = items.filter((i): i is Extract<ShelfItem, { kind: "group" }> => i.kind === "group");
  const loose = items.filter((i): i is Extract<ShelfItem, { kind: "design" }> => i.kind === "design");
  const open = groups.find((g) => g.key === openGroup) ?? null;

  return (
    <div className="lg:max-h-[62vh] lg:overflow-y-auto lg:pr-1">
      <p className="mb-2 text-[11px] text-[hsl(var(--ax-faint))]">
        Drag onto the garment, or click to drop it in the centre.
      </p>

      {groups.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {groups.map((g) => {
            const isOpen = openGroup === g.key;
            return (
              <div key={g.key}>
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : g.key)}
                  className={`flex w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors ${
                    isOpen
                      ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]"
                      : "border-[hsl(var(--ax-accent)/0.3)] hover:border-[hsl(var(--ax-accent)/0.6)]"
                  }`}
                >
                  <FolderOpen className="h-3 w-3 shrink-0 text-[hsl(var(--ax-accent))]" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{g.group.name}</span>
                  <span className="tabular-nums text-[hsl(var(--ax-faint))]">{g.designs.length}</span>
                  <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {isOpen && (
                  <div className="mt-1.5 grid grid-cols-3 gap-1.5 lg:grid-cols-2">
                    {open?.designs.map((d) => (
                      <RailTile key={d.id} design={d} onQuickAdd={onQuickAdd} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {loose.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-2">
          {loose.map((i) => (
            <RailTile key={i.design.id} design={i.design} onQuickAdd={onQuickAdd} />
          ))}
        </div>
      )}

      {items.length === 0 && (
        <p className="py-6 text-center text-[12px] text-[hsl(var(--ax-faint))]">
          No designs linked to this entity.
        </p>
      )}
    </div>
  );
}

export function RailTile({ design, onQuickAdd }: { design: Design; onQuickAdd: (d: Design) => void }) {
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_MIME, design.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={() => onQuickAdd(design)}
      title={`${cleanDesignTitle(design.title) ?? design.title} — drag onto the garment, or click to centre it`}
      className="ax-card ax-card-hover overflow-hidden p-0 text-left"
    >
      <AssetImage
        bucket={design.fileBucket}
        path={design.filePath}
        alt={design.title}
        className="aspect-square w-full bg-black/30"
        fit="contain"
      />
      <div className="truncate p-1 text-[9px] text-[hsl(var(--ax-secondary))]">
        {cleanDesignTitle(design.title) ?? "Untitled"}
      </div>
    </button>
  );
}

/**
 * A non-interactive render of one surface, for the confirm step.
 *
 * Shares the percentage geometry with the live canvas rather than
 * re-deriving it, so what the operator approves is what they arranged.
 */
