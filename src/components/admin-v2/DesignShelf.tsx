import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FolderOpen, GripVertical, X } from "lucide-react";
import { toast } from "sonner";
import { useDesignShelf, useShelfActions } from "@/lib/v2/data";
import {
  buildShelf,
  coverOf,
  dropIntent,
  memberOrderWrites,
  moveItem,
  orderWrites,
  suggestGroupName,
  type ShelfItem,
} from "@/lib/v2/design-groups";
import type { Design } from "@/lib/v2/types";
import { cleanDesignTitle } from "@/lib/v2/concepts";
import { AssetImage, EmptyState, Skeleton } from "./primitives";

// A lightweight visual asset manager for one entity's designs.
//
// Drag a card between cards to reorder. Drag a card ONTO another card to make a
// group. Grouping is organisational only — no design asset is merged, rewritten
// or deleted, and V1's own design folders are untouched.
//
// Drag and drop uses the native HTML5 API: no new dependency, and "drop onto a
// sibling" is expressed naturally. It is a pointer interaction, so it is a
// desktop affordance — the Ungroup and Remove buttons cover the same ground
// without dragging.

export type ShelfFilter = "all" | "ready" | "concept";

export default function DesignShelf({
  entityId,
  organizationId,
  entityName,
  filter,
}: {
  entityId: string;
  organizationId: string;
  entityName: string;
  filter: ShelfFilter;
}) {
  const { data, isLoading } = useDesignShelf(entityId);
  const actions = useShelfActions(entityId, organizationId);

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [hint, setHint] = useState<{ key: string; zone: "before" | "onto" } | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<ShelfItem[] | null>(null);
  const memberDrag = useRef<{ groupId: string; designId: string } | null>(null);

  const serverItems = useMemo(
    () => (data ? buildShelf(data.designs, data.groups, data.membership) : []),
    [data],
  );

  // Server truth replaces the optimistic arrangement as soon as it lands.
  useEffect(() => {
    setOptimistic(null);
  }, [data]);

  const items = optimistic ?? serverItems;

  const visible = useMemo(() => {
    if (filter === "all") return items;
    const keep = (d: Design) => (filter === "ready" ? d.productionReady : !d.productionReady);
    return items
      .map((item) => {
        if (item.kind === "design") return keep(item.design) ? item : null;
        const designs = item.designs.filter(keep);
        return designs.length > 0 ? { ...item, designs } : null;
      })
      .filter(Boolean) as ShelfItem[];
  }, [items, filter]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState>
        No artwork linked to this entity yet. Designs are the starting point — everything downstream refers back to one.
      </EmptyState>
    );
  }

  if (visible.length === 0) {
    return (
      <EmptyState>
        {filter === "ready"
          ? "None of this entity's designs has an exported production file yet."
          : "Every design here already has production artwork."}
      </EmptyState>
    );
  }

  const indexOfKey = (key: string) => items.findIndex((i) => i.key === key);

  /* ------------------------------------------------------------ top level */

  const onDrop = (targetKey: string, zone: "before" | "onto") => {
    const dragged = items.find((i) => i.key === dragKey) ?? null;
    const targetIndex = indexOfKey(targetKey);
    const target = items[targetIndex];
    setHint(null);
    setDragKey(null);
    if (!dragged || !target) return;

    const intent = dropIntent(dragged, target, targetIndex, zone);

    if (intent.type === "reorder") {
      const from = indexOfKey(dragged.key);
      let to = intent.toIndex;
      if (from < to) to -= 1;
      const next = moveItem(items, from, to);
      setOptimistic(next);
      actions.mutate(
        { type: "order", writes: orderWrites(next) },
        { onError: () => fail("Could not save the new order") },
      );
      return;
    }

    if (intent.type === "add-to-group" && dragged.kind === "design") {
      const group = items.find((i) => i.key === intent.groupId);
      const size = group && group.kind === "group" ? group.designs.length : 0;
      setOptimistic(items.filter((i) => i.key !== dragged.key));
      actions.mutate(
        { type: "add-to-group", groupId: intent.groupId, designId: dragged.design.id, sortOrder: size },
        {
          onError: () => fail("Could not add that design to the group"),
          onSuccess: () => setOpenGroup(intent.groupId),
        },
      );
      return;
    }

    if (intent.type === "group-with" && dragged.kind === "design" && target.kind === "design") {
      // The target keeps its position and becomes the cover; the dragged design follows.
      const name = suggestGroupName(entityName, target.design);
      setOptimistic(items.filter((i) => i.key !== dragged.key));
      actions.mutate(
        {
          type: "create-group",
          name,
          designIds: [target.design.id, dragged.design.id],
          sortOrder: target.sortOrder,
        },
        {
          onError: () => fail("Could not create the group"),
          onSuccess: () => toast.success(`Grouped as “${name}” — click the name to rename`),
        },
      );
    }
  };

  const fail = (msg: string) => {
    setOptimistic(null);
    toast.error(msg);
  };

  /* ------------------------------------------------------- inside a group */

  const reorderMember = (groupId: string, designId: string, toIndex: number) => {
    const group = items.find((i) => i.key === groupId);
    if (!group || group.kind !== "group" || !data) return;
    const from = group.designs.findIndex((d) => d.id === designId);
    if (from < 0) return;
    let to = toIndex;
    if (from < to) to -= 1;
    const next = moveItem(group.designs, from, to);
    setOptimistic(items.map((i) => (i.key === groupId && i.kind === "group" ? { ...i, designs: next } : i)));
    actions.mutate(
      { type: "order", writes: memberOrderWrites(next, data.membership) },
      { onError: () => fail("Could not reorder the group") },
    );
  };

  const removeMember = (designId: string) => {
    actions.mutate(
      { type: "remove-from-group", designId, sortOrder: items.length },
      { onError: () => fail("Could not take that design out of the group") },
    );
  };

  const ungroup = (groupId: string, designs: Design[]) => {
    setOpenGroup(null);
    actions.mutate(
      { type: "ungroup", groupId, designIds: designs.map((d) => d.id), baseSortOrder: items.length },
      { onError: () => fail("Could not ungroup") },
    );
  };

  const rename = (groupId: string, name: string) => {
    setRenaming(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    actions.mutate({ type: "rename-group", groupId, name: trimmed }, { onError: () => fail("Could not rename") });
  };

  /* ---------------------------------------------------------------- render */

  const open = visible.find((i) => i.key === openGroup && i.kind === "group");

  return (
    <>
      <p className="mb-2.5 text-[11px] text-[hsl(var(--ax-faint))]">
        Drag to reorder. Drop one design on another to group them. Grouping only organises — the artwork itself is never
        changed.
      </p>

      <div
        className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8"
        onDragEnd={() => {
          setDragKey(null);
          setHint(null);
        }}
      >
        {visible.map((item, index) => (
          <div
            key={item.key}
            className="relative"
            draggable
            onDragStart={(e) => {
              setDragKey(item.key);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (!dragKey || dragKey === item.key) return;
              e.preventDefault();
              const box = e.currentTarget.getBoundingClientRect();
              const zone = e.clientX - box.left < box.width * 0.25 ? "before" : "onto";
              setHint({ key: item.key, zone });
            }}
            onDragLeave={() => setHint((h) => (h?.key === item.key ? null : h))}
            onDrop={(e) => {
              e.preventDefault();
              onDrop(item.key, hint?.key === item.key ? hint.zone : "onto");
            }}
          >
            {hint?.key === item.key && hint.zone === "before" && (
              <span className="absolute -left-1.5 top-0 z-10 h-full w-0.5 rounded bg-[hsl(var(--ax-accent))]" />
            )}

            {item.kind === "design" ? (
              <DesignCard
                design={item.design}
                merging={hint?.key === item.key && hint.zone === "onto"}
                dragging={dragKey === item.key}
              />
            ) : (
              <GroupCard
                item={item}
                merging={hint?.key === item.key && hint.zone === "onto"}
                dragging={dragKey === item.key}
                isOpen={openGroup === item.key}
                onToggle={() => setOpenGroup(openGroup === item.key ? null : item.key)}
              />
            )}
            {index === visible.length - 1 && null}
          </div>
        ))}
      </div>

      {open && open.kind === "group" && (
        <div className="ax-card mt-3 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FolderOpen className="h-4 w-4 shrink-0 text-[hsl(var(--ax-accent))]" />
            {renaming === open.key ? (
              <input
                autoFocus
                defaultValue={open.group.name}
                onBlur={(e) => rename(open.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") rename(open.key, (e.target as HTMLInputElement).value);
                  if (e.key === "Escape") setRenaming(null);
                }}
                className="min-w-[220px] flex-1 rounded-lg border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-card))] px-2.5 py-1.5 text-[14px] outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setRenaming(open.key)}
                title="Click to rename"
                className="flex-1 text-left text-[15px] font-medium hover:text-[hsl(var(--ax-accent))]"
              >
                {open.group.name}
              </button>
            )}
            <span className="text-[11px] text-[hsl(var(--ax-faint))]">{open.designs.length} designs</span>
            <button
              type="button"
              onClick={() => ungroup(open.key, open.designs)}
              className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-1 text-[11px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
            >
              Ungroup
            </button>
            <button
              type="button"
              onClick={() => setOpenGroup(null)}
              className="rounded-lg p-1 text-[hsl(var(--ax-faint))] hover:bg-white/10"
              aria-label="Close group"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-3 text-[11px] text-[hsl(var(--ax-faint))]">
            Drag to reorder. The first design is the group cover.
          </p>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
            {open.designs.map((d, i) => (
              <div
                key={d.id}
                className="relative"
                draggable
                onDragStart={() => (memberDrag.current = { groupId: open.key, designId: d.id })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const m = memberDrag.current;
                  memberDrag.current = null;
                  if (m && m.groupId === open.key && m.designId !== d.id) reorderMember(open.key, m.designId, i);
                }}
              >
                <a
                  href={`/admin/designs/${d.id}`}
                  className="ax-card ax-card-hover block overflow-hidden transition-all"
                >
                  <AssetImage
                    bucket={d.fileBucket}
                    path={d.filePath}
                    alt={d.title}
                    className="aspect-square w-full bg-black/30"
                    fit="contain"
                  />
                  <div className="p-1.5">
                    <div className="truncate text-[10px] text-[hsl(var(--ax-secondary))]">
                      {cleanDesignTitle(d.title) ?? "Untitled"}
                    </div>
                    <div
                      className="mt-0.5 text-[9px]"
                      style={{ color: d.productionReady ? "hsl(var(--ax-accent))" : "hsl(var(--ax-amber))" }}
                    >
                      {i === 0 ? "cover" : d.productionReady ? "production-ready" : "no artwork yet"}
                    </div>
                  </div>
                </a>
                <button
                  type="button"
                  onClick={() => removeMember(d.id)}
                  title="Take out of this group"
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white/80 opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus:opacity-100"
                  style={{ opacity: undefined }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------- cards */

function DesignCard({
  design,
  merging,
  dragging,
}: {
  design: Design;
  merging: boolean;
  dragging: boolean;
}) {
  return (
    <div
      className={[
        "ax-card overflow-hidden transition-all",
        merging ? "ring-2 ring-[hsl(var(--ax-accent))]" : "ax-card-hover",
        dragging ? "opacity-40" : "",
      ].join(" ")}
    >
      <div className="relative">
        <AssetImage
          bucket={design.fileBucket}
          path={design.filePath}
          alt={design.title}
          className="aspect-square w-full bg-black/30"
          fit="contain"
        />
        <GripVertical className="absolute left-1 top-1 h-3.5 w-3.5 text-white/35" aria-hidden />
        {merging && (
          <span className="absolute inset-x-0 bottom-0 bg-[hsl(var(--ax-accent))] py-0.5 text-center text-[9px] font-semibold text-[hsl(var(--ax-on-accent))]">
            group
          </span>
        )}
      </div>
      <div className="p-1.5">
        <a
          href={`/admin/designs/${design.id}`}
          className="block truncate text-[10px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
        >
          {cleanDesignTitle(design.title) ?? "Untitled"}
        </a>
        <div
          className="mt-0.5 text-[9px]"
          style={{ color: design.productionReady ? "hsl(var(--ax-accent))" : "hsl(var(--ax-amber))" }}
        >
          {design.productionReady ? "production-ready" : "no artwork yet"}
        </div>
      </div>
    </div>
  );
}

function GroupCard({
  item,
  merging,
  dragging,
  isOpen,
  onToggle,
}: {
  item: Extract<ShelfItem, { kind: "group" }>;
  merging: boolean;
  dragging: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const cover = coverOf(item.group, item.designs);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={[
        "ax-card w-full overflow-hidden text-left transition-all",
        merging ? "ring-2 ring-[hsl(var(--ax-accent))]" : "ax-card-hover",
        dragging ? "opacity-40" : "",
        isOpen ? "ring-1 ring-[hsl(var(--ax-accent)/0.6)]" : "",
      ].join(" ")}
    >
      <div className="relative">
        {/* Stacked edges, so a group reads as a folder at a glance. */}
        <span className="absolute inset-x-2 -top-1 h-1.5 rounded-t bg-white/[0.09]" aria-hidden />
        <AssetImage
          bucket={cover?.fileBucket}
          path={cover?.filePath}
          alt={item.group.name}
          className="aspect-square w-full bg-black/30"
          fit="contain"
          fallbackSeed={item.group.id}
        />
        <span className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          {item.designs.length}
        </span>
        {merging && (
          <span className="absolute inset-x-0 bottom-0 bg-[hsl(var(--ax-accent))] py-0.5 text-center text-[9px] font-semibold text-[hsl(var(--ax-on-accent))]">
            add here
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 p-1.5">
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium">{item.group.name}</span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-[hsl(var(--ax-faint))] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </div>
    </button>
  );
}
