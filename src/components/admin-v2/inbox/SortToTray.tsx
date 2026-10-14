import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useEntities } from "@/lib/v2/data";
import { typeLabel } from "@/lib/v2/entity";
import { dropLabel, readDragIds } from "@/lib/v2/inbox";
import type { Entity } from "@/lib/v2/types";
import { AssetImage } from "../primitives";
import EntityPicker from "./EntityPicker";

// SORT TO — the destinations for this sorting session.
//
// These are not filters. Pinning somebody here does not change what the grid
// shows; it puts a target on screen that artwork can be thrown at. The tray is
// working state, so it holds ids and reads the live entity records — a name
// cached here would go stale the first time somebody is renamed.

export default function SortToTray({
  pinned,
  onPin,
  onUnpin,
  dragging,
  dragCount,
  onDropDesigns,
  busy,
}: {
  pinned: string[];
  onPin: (ids: string[]) => void;
  onUnpin: (id: string) => void;
  /** True while design cards are in flight, so the chips can become obvious targets. */
  dragging: boolean;
  dragCount: number;
  onDropDesigns: (entity: Entity, designIds: string[]) => void;
  busy: boolean;
}) {
  const entities = useEntities();
  const [adding, setAdding] = useState(false);
  const [over, setOver] = useState<string | null>(null);

  const byId = new Map((entities.data ?? []).map((e) => [e.id, e]));
  const chips = pinned.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => Boolean(e));

  return (
    <div className="mb-3 rounded-xl border border-[hsl(var(--ax-line))] bg-white/[0.015] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-faint))]">
          Sort to
        </span>
        {chips.length > 0 && (
          <span className="text-[11px] text-[hsl(var(--ax-faint))]">
            {dragging ? "Drop on a destination" : "Drag artwork onto a destination"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((e) => {
          const isOver = over === e.id;
          return (
            <div
              key={e.id}
              onDragOver={(ev) => {
                // Without preventDefault the browser refuses the drop outright.
                if (!ev.dataTransfer.types.includes("application/x-ax-designs")) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = "copy";
                if (over !== e.id) setOver(e.id);
              }}
              onDragLeave={() => setOver((cur) => (cur === e.id ? null : cur))}
              onDrop={(ev) => {
                ev.preventDefault();
                setOver(null);
                const ids = readDragIds((m) => ev.dataTransfer.getData(m));
                if (ids.length > 0) onDropDesigns(e, ids);
              }}
              className={`relative flex min-w-[148px] items-center gap-2 rounded-xl border px-2.5 py-2 transition-all ${
                isOver
                  ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.14)] ring-2 ring-[hsl(var(--ax-accent))]"
                  : dragging
                    ? "border-[hsl(var(--ax-accent)/0.45)] bg-[hsl(var(--ax-card))]"
                    : "border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))]"
              }`}
            >
              <AssetImage url={e.avatarUrl} alt={e.name} className="h-8 w-8 shrink-0 rounded-lg" fallbackSeed={e.id} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] font-medium">{e.name}</div>
                <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
                  {isOver ? dropLabel(dragCount, e.name.split(" ")[0]) : typeLabel(e.entityType)}
                </div>
              </div>
              {!dragging && (
                <button
                  type="button"
                  onClick={() => onUnpin(e.id)}
                  aria-label={`Remove ${e.name} from Sort to`}
                  className="shrink-0 rounded-md p-1 text-[hsl(var(--ax-faint))] hover:bg-white/10 hover:text-[hsl(var(--ax-ink))]"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className={`flex min-w-[132px] items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-[11.5px] transition-colors ${
            adding
              ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-accent))]"
              : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-faint))] hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-ink))]"
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          Add people
        </button>
      </div>

      {chips.length === 0 && !adding && (
        <p className="mt-2 text-[11px] text-[hsl(var(--ax-faint))]">
          Add the people you are sorting for, then drag artwork straight onto them.
        </p>
      )}

      {adding && (
        <div className="mt-2">
          <EntityPicker
            multi
            busy={busy}
            exclude={pinned}
            confirmLabel="Pin to Sort to"
            onPick={(picked) => {
              onPin(picked.map((p) => p.id));
              setAdding(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
