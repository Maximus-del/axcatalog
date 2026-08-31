import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronDown,
  FolderOpen,
  GripVertical,
  Images,
  Link2Off,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useDesignShelf, useShelfActions, type DesignLinkSnapshot } from "@/lib/v2/data";
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
import type { ClientVisibility, Design } from "@/lib/v2/types";
import { cleanDesignTitle } from "@/lib/v2/concepts";
import {
  awaitingPreview,
  effectiveVisibility,
  groupVisibilitySummary,
  promotableMembers,
} from "@/lib/v2/visibility";
import { generatePreview } from "@/lib/v2/preview";
import { AssetImage, EmptyState, Skeleton } from "./primitives";
import { VisibilityNote, VisibilityPill, VisibilitySegmented } from "./ClientVisibility";

// A lightweight visual asset manager for one entity's designs.
//
// Drag a card between cards to reorder. Drag a card ONTO another card to make a
// group. Grouping is organisational only — no design asset is merged, rewritten
// or deleted, and V1's own design folders are untouched.
//
// LAYOUT: folders occupy their own band above the loose designs. They were
// previously interleaved, which meant a deliberate act of organisation could end
// up buried between two untitled generator exports. A folder is a denser object
// than a single design and reads as one — stacked edges, its own chrome, its own
// heading — so the eye can separate "things I have organised" from "things I
// have not" without reading a single label.
//
// Drag and drop uses the native HTML5 API: no new dependency, and "drop onto a
// sibling" is expressed naturally. It is a pointer interaction, so every drag
// affordance has a button equivalent — nothing here is reachable only by drag.

export type ShelfFilter = "all" | "ready" | "concept";

export default function DesignShelf({
  entityId,
  organizationId,
  entityName,
  filter,
  onOpenDesign,
}: {
  entityId: string;
  organizationId: string;
  entityName: string;
  filter: ShelfFilter;
  /** Open the design's own page — its creative options live there, not here. */
  onOpenDesign?: (design: Design) => void;
}) {
  const { data, isLoading } = useDesignShelf(entityId);
  const actions = useShelfActions(entityId, organizationId);
  const qc = useQueryClient();

  // Rendering a preview writes to `design_files`, which the shelf query reads.
  // That write happens outside the mutation, so it has to invalidate for itself.
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["v2", "shelf", entityId] });
  };

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [hint, setHint] = useState<{ key: string; zone: "before" | "onto" } | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<ShelfItem[] | null>(null);
  const [rendering, setRendering] = useState<string[]>([]);
  const [draggingMember, setDraggingMember] = useState(false);
  const memberDrag = useRef<{ groupId: string; designId: string } | null>(null);

  const serverItems = useMemo(
    () => (data ? buildShelf(data.designs, data.groups, data.membership) : []),
    [data],
  );

  // Server truth replaces the optimistic arrangement as soon as it lands.
  useEffect(() => {
    setOptimistic(null);
  }, [data]);

  // A card menu closes on the next click anywhere else. The menu's own buttons
  // stop propagation, so they act without the listener racing them; each of
  // them closes the menu itself.
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuFor]);

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

  /** The group ceiling above a given design, or null when it is loose. */
  const groupVisibilityOf = useMemo(() => {
    const byDesign = new Map<string, ClientVisibility>();
    for (const item of items) {
      if (item.kind !== "group") continue;
      for (const d of item.designs) byDesign.set(d.id, item.group.clientVisibility);
    }
    return (d: Design) => byDesign.get(d.id) ?? null;
  }, [items]);

  const allDesigns = useMemo(
    () => items.flatMap((i) => (i.kind === "design" ? [i.design] : i.designs)),
    [items],
  );

  const needPreview = useMemo(
    () => awaitingPreview(allDesigns, groupVisibilityOf),
    [allDesigns, groupVisibilityOf],
  );

  /* ------------------------------------------------------------- previews */

  const renderPreview = async (design: Design) => {
    if (!design.fileBucket || !design.filePath) return false;
    setRendering((r) => [...r, design.id]);
    try {
      await generatePreview(design.id, design.fileBucket, design.filePath);
      return true;
    } catch (err) {
      console.error("preview render failed", err);
      return false;
    } finally {
      setRendering((r) => r.filter((id) => id !== design.id));
    }
  };

  const renderMissing = async () => {
    const targets = needPreview.filter((d) => d.filePath);
    if (targets.length === 0) return;
    const results = await Promise.all(targets.map(renderPreview));
    const ok = results.filter(Boolean).length;
    if (ok === targets.length) toast.success(`Rendered ${ok} preview${ok === 1 ? "" : "s"}`);
    else toast.error(`Rendered ${ok} of ${targets.length} — the rest could not be read`);
    refresh();
  };

  /* ----------------------------------------------------------- visibility */

  const toggleDesignVisibility = (design: Design) => {
    const next: ClientVisibility = design.clientVisibility === "preview" ? "hidden" : "preview";
    actions.mutate(
      { type: "set-design-visibility", designIds: [design.id], visibility: next },
      {
        onError: () => fail("Could not change client visibility"),
        onSuccess: () => {
          // Making something visible is only meaningful once a rendition
          // exists, so produce one right away rather than leaving the operator
          // to discover later that the client sees nothing.
          if (next === "preview" && !design.hasPreview && design.filePath) {
            void renderPreview(design).then((ok) => {
              if (!ok) toast.error(`Could not render a preview for “${nameOf(design)}”`);
              refresh();
            });
          }
          if (next === "preview" && !design.filePath) {
            toast.warning("Marked visible, but there is no artwork to render a preview from");
          }
        },
      },
    );
  };

  const setGroupVisibility = (groupId: string, members: Design[], next: ClientVisibility) => {
    actions.mutate(
      { type: "set-group-visibility", groupId, visibility: next },
      {
        onError: () => fail("Could not change the folder's visibility"),
        onSuccess: () => {
          if (next !== "preview") return;
          const pending = promotableMembers(members);
          if (pending.length === 0) return;
          // Ceiling semantics mean opening the folder does not open its
          // contents. Rather than make the operator click through every card,
          // offer the obvious follow-up as one action.
          toast("Folder is open to the client", {
            description: `${pending.length} design${pending.length === 1 ? " is" : "s are"} still hidden individually.`,
            action: {
              label: `Show all ${pending.length}`,
              onClick: () => showAll(pending),
            },
          });
        },
      },
    );
  };

  const showAll = (designs: Design[]) => {
    actions.mutate(
      { type: "set-design-visibility", designIds: designs.map((d) => d.id), visibility: "preview" },
      {
        onError: () => fail("Could not update those designs"),
        onSuccess: async () => {
          const missing = designs.filter((d) => !d.hasPreview && d.filePath);
          if (missing.length) {
            await Promise.all(missing.map(renderPreview));
            refresh();
          }
        },
      },
    );
  };

  /* -------------------------------------------------------- remove/archive */

  const unlink = (design: Design) => {
    setMenuFor(null);
    const snapshot: DesignLinkSnapshot = {
      designId: design.id,
      athleteId: entityId,
      groupId: data?.membership.get(design.id)?.groupId ?? null,
      sortOrder: data?.membership.get(design.id)?.sortOrder ?? 0,
      clientVisibility: design.clientVisibility,
    };
    actions.mutate(
      { type: "unlink", designId: design.id },
      {
        onError: () => fail("Could not remove that design"),
        onSuccess: () =>
          toast.success(`Removed “${nameOf(design)}” from ${entityName}`, {
            description: "The artwork itself is untouched and still in the library.",
            action: {
              label: "Undo",
              onClick: () => actions.mutate({ type: "relink", link: snapshot }),
            },
          }),
      },
    );
  };

  const archive = (design: Design) => {
    setMenuFor(null);
    const wasArchived = design.status === "archived";
    actions.mutate(
      { type: "archive", designId: design.id, archived: !wasArchived },
      {
        onError: () => fail("Could not archive that design"),
        onSuccess: () =>
          toast.success(wasArchived ? "Design restored" : `Archived “${nameOf(design)}”`, {
            description: wasArchived
              ? undefined
              : "Archiving applies to the design everywhere, not just here.",
            action: {
              label: "Undo",
              onClick: () =>
                actions.mutate({ type: "archive", designId: design.id, archived: wasArchived }),
            },
          }),
      },
    );
  };

  /* ------------------------------------------------------------ early exit */

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
          onError: () => fail("Could not add that design to the folder"),
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
          onError: () => fail("Could not create the folder"),
          onSuccess: (_res, job) => {
            if (job.type !== "create-group") return;
            toast.success(`Grouped as “${name}”`, { description: "Click the name to rename it." });
          },
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
      { onError: () => fail("Could not reorder the folder") },
    );
  };

  const removeMember = (designId: string) => {
    actions.mutate(
      { type: "remove-from-group", designId, sortOrder: items.length },
      { onError: () => fail("Could not take that design out of the folder") },
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

  const groupItems = visible.filter((i): i is Extract<ShelfItem, { kind: "group" }> => i.kind === "group");
  const looseItems = visible.filter((i): i is Extract<ShelfItem, { kind: "design" }> => i.kind === "design");
  const open = visible.find((i) => i.key === openGroup && i.kind === "group");

  const dropProps = (item: ShelfItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragKey(item.key);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: React.DragEvent) => {
      if (!dragKey || dragKey === item.key) return;
      e.preventDefault();
      const box = e.currentTarget.getBoundingClientRect();
      const zone = e.clientX - box.left < box.width * 0.25 ? "before" : "onto";
      setHint({ key: item.key, zone });
    },
    onDragLeave: () => setHint((h) => (h?.key === item.key ? null : h)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onDrop(item.key, hint?.key === item.key ? hint.zone : "onto");
    },
  });

  const designCardFor = (d: Design, inGroup: boolean) => (
    <DesignCard
      design={d}
      groupVisibility={inGroup ? groupVisibilityOf(d) : null}
      rendering={rendering.includes(d.id)}
      menuOpen={menuFor === d.id}
      onMenu={() => setMenuFor(menuFor === d.id ? null : d.id)}
      onToggleVisibility={() => toggleDesignVisibility(d)}
      onArchive={() => archive(d)}
      onUnlink={() => unlink(d)}
      onOpen={onOpenDesign ? () => onOpenDesign(d) : undefined}
      onRenderPreview={() => {
        setMenuFor(null);
        void renderPreview(d).then((ok) => {
          toast[ok ? "success" : "error"](ok ? "Preview rendered" : "Could not render that preview");
          refresh();
        });
      }}
    />
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[46ch] text-[11px] text-[hsl(var(--ax-faint))]">
          Drag to reorder. Drop one design on another to put them in a folder. Organising never
          changes the artwork.
        </p>
        <div className="max-w-[52ch]">
          <VisibilityNote />
        </div>
      </div>

      {needPreview.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--ax-amber)/0.35)] bg-[hsl(var(--ax-amber)/0.08)] px-3 py-2">
          <Images className="h-4 w-4 shrink-0 text-[hsl(var(--ax-amber))]" aria-hidden />
          <span className="flex-1 text-[12px] text-[hsl(var(--ax-secondary))]">
            <strong className="font-semibold text-[hsl(var(--ax-ink))]">
              {needPreview.length} design{needPreview.length === 1 ? " is" : "s are"} set to show
            </strong>{" "}
            but {needPreview.length === 1 ? "has" : "have"} no client preview yet, so the client sees
            nothing.
          </span>
          <button
            type="button"
            onClick={() => void renderMissing()}
            disabled={rendering.length > 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-amber)/0.18)] px-3 py-1 text-[11px] font-semibold text-[hsl(var(--ax-amber))] hover:brightness-110 disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${rendering.length ? "animate-spin" : ""}`} aria-hidden />
            Render {needPreview.length === 1 ? "it" : "them"}
          </button>
        </div>
      )}

      {/* ------------------------------------------------------ folder band */}
      {groupItems.length > 0 && (
        <section className="mb-6">
          <BandHeading label="Folders" count={groupItems.length} />
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            onDragEnd={() => {
              setDragKey(null);
              setHint(null);
            }}
          >
            {groupItems.map((item) => (
              <div key={item.key} className="relative" {...dropProps(item)}>
                {hint?.key === item.key && hint.zone === "before" && <DropRail />}
                <GroupCard
                  item={item}
                  merging={hint?.key === item.key && hint.zone === "onto"}
                  dragging={dragKey === item.key}
                  isOpen={openGroup === item.key}
                  onToggle={() => setOpenGroup(openGroup === item.key ? null : item.key)}
                  onRename={() => {
                    setOpenGroup(item.key);
                    setRenaming(item.key);
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --------------------------------------------------- open folder */}
      {open && open.kind === "group" && (
        <OpenGroup
          item={open}
          entityName={entityName}
          renaming={renaming === open.key}
          onStartRename={() => setRenaming(open.key)}
          onRename={(name) => rename(open.key, name)}
          onCancelRename={() => setRenaming(null)}
          onClose={() => setOpenGroup(null)}
          onUngroup={() => ungroup(open.key, open.designs)}
          onSetVisibility={(v) => setGroupVisibility(open.key, open.designs, v)}
          onSetCover={(designId) =>
            actions.mutate(
              { type: "set-group-cover", groupId: open.key, designId },
              {
                onError: () => fail("Could not set that cover"),
                onSuccess: () =>
                  toast.success(designId ? "Folder cover pinned" : "Folder cover back to whatever is first"),
              },
            )
          }
          onShowAll={() => showAll(promotableMembers(open.designs))}
          onMemberDragStart={(designId) => {
            memberDrag.current = { groupId: open.key, designId };
            setDraggingMember(true);
          }}
          onMemberDragEnd={() => {
            memberDrag.current = null;
            setDraggingMember(false);
          }}
          onMemberDrop={(index) => {
            const m = memberDrag.current;
            memberDrag.current = null;
            setDraggingMember(false);
            if (m && m.groupId === open.key) reorderMember(open.key, m.designId, index);
          }}
          onRemoveMember={removeMember}
          renderCard={(d) => designCardFor(d, true)}
        />
      )}

      {/* ------------------------------------------------------ design band */}
      <section>
        <BandHeading label="Designs" count={looseItems.length} />

        {/* Taking a design back out of a folder, by drag. The button on each
            member card does the same thing — this exists so the gesture that
            put a design INTO a folder has an obvious inverse. */}
        {draggingMember && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const m = memberDrag.current;
              memberDrag.current = null;
              setDraggingMember(false);
              if (m) removeMember(m.designId);
            }}
            className="mb-3 rounded-xl border border-dashed border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.07)] px-4 py-3 text-center text-[12px] font-medium text-[hsl(var(--ax-accent))]"
          >
            Drop here to take it out of the folder
          </div>
        )}

        {looseItems.length === 0 ? (
          <EmptyState>Every design for this entity is filed in a folder.</EmptyState>
        ) : (
          <div
            className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8"
            onDragEnd={() => {
              setDragKey(null);
              setHint(null);
            }}
          >
            {looseItems.map((item) => (
              <div key={item.key} className="relative" {...dropProps(item)}>
                {hint?.key === item.key && hint.zone === "before" && <DropRail />}
                <div className={hint?.key === item.key && hint.zone === "onto" ? "rounded-2xl ring-2 ring-[hsl(var(--ax-accent))]" : ""}>
                  {designCardFor(item.design, false)}
                </div>
                {hint?.key === item.key && hint.zone === "onto" && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-8 z-10 bg-[hsl(var(--ax-accent))] py-0.5 text-center text-[9px] font-semibold text-[hsl(var(--ax-on-accent))]">
                    make a folder
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ pieces */

function nameOf(design: Design) {
  return cleanDesignTitle(design.title) ?? "Untitled";
}

function BandHeading({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ax-secondary))]">
        {label}
      </h3>
      <span className="text-[11px] tabular-nums text-[hsl(var(--ax-faint))]">{count}</span>
    </div>
  );
}

function DropRail() {
  return <span className="absolute -left-1.5 top-0 z-10 h-full w-0.5 rounded bg-[hsl(var(--ax-accent))]" />;
}

function DesignCard({
  design,
  groupVisibility,
  rendering,
  menuOpen,
  onMenu,
  onOpen,
  onToggleVisibility,
  onArchive,
  onUnlink,
  onRenderPreview,
}: {
  design: Design;
  groupVisibility: ClientVisibility | null;
  rendering: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onOpen?: () => void;
  onToggleVisibility: () => void;
  onArchive: () => void;
  onUnlink: () => void;
  onRenderPreview: () => void;
}) {
  const archived = design.status === "archived";
  return (
    <div className={`ax-card ax-card-hover overflow-hidden transition-all ${archived ? "opacity-55" : ""}`}>
      <div className="relative">
        {onOpen ? (
          <button type="button" onClick={onOpen} className="block w-full" title="Open this design">
            <AssetImage
              bucket={design.fileBucket}
              path={design.filePath}
              alt={design.title}
              className="aspect-square w-full bg-black/30"
              fit="contain"
            />
          </button>
        ) : (
          <AssetImage
            bucket={design.fileBucket}
            path={design.filePath}
            alt={design.title}
            className="aspect-square w-full bg-black/30"
            fit="contain"
          />
        )}
        <GripVertical className="pointer-events-none absolute left-1 top-1 h-3.5 w-3.5 text-white/35" aria-hidden />

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMenu();
          }}
          aria-label="Design actions"
          className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white/75 transition-colors hover:text-white"
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>

        {menuOpen && (
          <div className="absolute right-1 top-7 z-30 w-44 overflow-hidden rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-1 shadow-xl">
            {design.filePath && (
              <MenuItem icon={RefreshCw} onClick={onRenderPreview}>
                {design.hasPreview ? "Re-render preview" : "Render client preview"}
              </MenuItem>
            )}
            <MenuItem icon={Archive} onClick={onArchive}>
              {archived ? "Restore design" : "Archive design"}
            </MenuItem>
            <MenuItem icon={Link2Off} onClick={onUnlink} tone="var(--ax-amber)">
              Remove from this entity
            </MenuItem>
          </div>
        )}

        {archived && (
          <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-center text-[9px] font-semibold uppercase tracking-wider text-white/80">
            archived
          </span>
        )}
      </div>

      <div className="space-y-1 p-1.5">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="block w-full truncate text-left text-[10px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
          >
            {nameOf(design)}
          </button>
        ) : (
          <a
            href={`/admin/designs/${design.id}`}
            className="block truncate text-[10px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
          >
            {nameOf(design)}
          </a>
        )}
        <div
          className="text-[9px]"
          style={{ color: design.productionReady ? "hsl(var(--ax-accent))" : "hsl(var(--ax-amber))" }}
        >
          {design.productionReady ? "production-ready" : "no artwork yet"}
        </div>
        <VisibilityPill
          design={design}
          groupVisibility={groupVisibility}
          busy={rendering}
          onToggle={onToggleVisibility}
        />
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  children,
  onClick,
  tone,
}: {
  icon: typeof Archive;
  children: React.ReactNode;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[hsl(var(--ax-secondary))] transition-colors hover:bg-white/[0.06] hover:text-[hsl(var(--ax-ink))]"
      style={tone ? { color: `hsl(${tone})` } : undefined}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {children}
    </button>
  );
}

function GroupCard({
  item,
  merging,
  dragging,
  isOpen,
  onToggle,
  onRename,
}: {
  item: Extract<ShelfItem, { kind: "group" }>;
  merging: boolean;
  dragging: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onRename: () => void;
}) {
  const cover = coverOf(item.group, item.designs);
  const summary = groupVisibilitySummary(item.group.clientVisibility, item.designs);

  return (
    <div
      className={[
        // A folder is visibly a different KIND of thing from a design: warmer
        // ground, a heavier border, and physical stacked edges behind it.
        "relative rounded-2xl border bg-[hsl(var(--ax-accent)/0.05)] transition-all",
        merging
          ? "border-[hsl(var(--ax-accent))] ring-2 ring-[hsl(var(--ax-accent))]"
          : "border-[hsl(var(--ax-accent)/0.35)] hover:border-[hsl(var(--ax-accent)/0.65)]",
        dragging ? "opacity-40" : "",
        isOpen ? "ring-2 ring-[hsl(var(--ax-accent)/0.55)]" : "",
      ].join(" ")}
    >
      {/* Stacked sheets. Two, offset, so the card reads as a container of many. */}
      <span
        className="absolute inset-x-4 -top-1.5 h-1.5 rounded-t-lg border border-b-0 border-[hsl(var(--ax-accent)/0.25)] bg-[hsl(var(--ax-accent)/0.07)]"
        aria-hidden
      />
      <span
        className="absolute inset-x-2 -top-0.5 h-1.5 rounded-t-lg border border-b-0 border-[hsl(var(--ax-accent)/0.3)] bg-[hsl(var(--ax-accent)/0.1)]"
        aria-hidden
      />

      <button type="button" onClick={onToggle} className="block w-full text-left">
        <div className="relative p-2">
          <div className="grid grid-cols-3 gap-1">
            {/* The cover reads large; the next two are a hint of what is inside. */}
            <div className="col-span-2 overflow-hidden rounded-lg">
              <AssetImage
                bucket={cover?.fileBucket}
                path={cover?.filePath}
                alt={item.group.name}
                className="aspect-square w-full bg-black/30"
                fit="contain"
                fallbackSeed={item.group.id}
              />
            </div>
            <div className="flex flex-col gap-1">
              {item.designs.slice(1, 3).map((d) => (
                <div key={d.id} className="overflow-hidden rounded-md">
                  <AssetImage
                    bucket={d.fileBucket}
                    path={d.filePath}
                    alt={d.title}
                    className="aspect-square w-full bg-black/30"
                    fit="contain"
                  />
                </div>
              ))}
              {item.designs.length > 3 && (
                <div className="flex flex-1 items-center justify-center rounded-md bg-black/30 text-[11px] font-semibold tabular-nums text-[hsl(var(--ax-secondary))]">
                  +{item.designs.length - 3}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 pb-2">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-accent))]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{item.group.name}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-[hsl(var(--ax-faint))]">
            {item.designs.length}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-faint))] transition-transform ${isOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </div>
      </button>

      <div className="flex items-center gap-1.5 border-t border-[hsl(var(--ax-accent)/0.18)] px-2.5 py-1.5">
        <GroupVisibilityBadge summary={summary} />
        <button
          type="button"
          onClick={onRename}
          title="Rename this folder"
          aria-label="Rename this folder"
          className="ml-auto rounded-md p-1 text-[hsl(var(--ax-faint))] transition-colors hover:bg-white/10 hover:text-[hsl(var(--ax-ink))]"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function GroupVisibilityBadge({ summary }: { summary: ReturnType<typeof groupVisibilitySummary> }) {
  const map = {
    hidden: { label: "Hidden from client", tone: "var(--ax-secondary)" },
    visible: { label: "Client preview", tone: "var(--ax-accent)" },
    mixed: { label: "Partly visible", tone: "var(--ax-amber)" },
    empty: { label: "Empty", tone: "var(--ax-faint)" },
  } as const;
  const { label, tone } = map[summary];
  return (
    <span
      className="truncate rounded-full px-1.5 py-0.5 text-[9px] font-medium"
      style={{ background: `hsl(${tone} / 0.14)`, color: `hsl(${tone})` }}
    >
      {label}
    </span>
  );
}

function OpenGroup({
  item,
  entityName,
  renaming,
  onStartRename,
  onRename,
  onCancelRename,
  onClose,
  onUngroup,
  onSetVisibility,
  onSetCover,
  onShowAll,
  onMemberDragStart,
  onMemberDragEnd,
  onMemberDrop,
  onRemoveMember,
  renderCard,
}: {
  item: Extract<ShelfItem, { kind: "group" }>;
  entityName: string;
  renaming: boolean;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onClose: () => void;
  onUngroup: () => void;
  onSetVisibility: (v: ClientVisibility) => void;
  /** Pin a member as the folder cover, or null to go back to "whatever is first". */
  onSetCover: (designId: string | null) => void;
  onShowAll: () => void;
  onMemberDragStart: (designId: string) => void;
  onMemberDragEnd: () => void;
  onMemberDrop: (index: number) => void;
  onRemoveMember: (designId: string) => void;
  renderCard: (d: Design) => React.ReactNode;
}) {
  const pending = promotableMembers(item.designs);

  return (
    <div className="mb-6 rounded-2xl border border-[hsl(var(--ax-accent)/0.4)] bg-[hsl(var(--ax-accent)/0.04)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FolderOpen className="h-4 w-4 shrink-0 text-[hsl(var(--ax-accent))]" />
        {renaming ? (
          <input
            autoFocus
            defaultValue={item.group.name}
            onBlur={(e) => onRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRename((e.target as HTMLInputElement).value);
              if (e.key === "Escape") onCancelRename();
            }}
            className="min-w-[220px] flex-1 rounded-lg border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-card))] px-2.5 py-1.5 text-[15px] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={onStartRename}
            title="Click to rename"
            className="group flex min-w-0 flex-1 items-center gap-1.5 text-left text-[15px] font-semibold hover:text-[hsl(var(--ax-accent))]"
          >
            <span className="truncate">{item.group.name}</span>
            <Pencil className="h-3 w-3 shrink-0 text-[hsl(var(--ax-faint))] opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        <span className="text-[11px] text-[hsl(var(--ax-faint))]">{item.designs.length} designs</span>
        <button
          type="button"
          onClick={onUngroup}
          className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-1 text-[11px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
        >
          Ungroup
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-[hsl(var(--ax-faint))] hover:bg-white/10"
          aria-label="Close folder"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 border-y border-[hsl(var(--ax-accent)/0.15)] py-2.5">
        <span className="text-[11px] font-medium text-[hsl(var(--ax-secondary))]">
          {entityName} sees this folder as
        </span>
        <VisibilitySegmented value={item.group.clientVisibility} onChange={onSetVisibility} />
        {item.group.clientVisibility === "preview" && pending.length > 0 && (
          <button
            type="button"
            onClick={onShowAll}
            className="rounded-full bg-[hsl(var(--ax-amber)/0.16)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(var(--ax-amber))] hover:brightness-110"
          >
            {pending.length} still hidden — show all
          </button>
        )}
      </div>

      <p className="mb-3 text-[11px] text-[hsl(var(--ax-faint))]">
        Drag to reorder. The first design is the cover unless you pin one. Drag a design out, or use the ×, to
        take it back to the shelf.
      </p>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
        {item.designs.map((d, i) => (
          <div
            key={d.id}
            className="group relative"
            draggable
            onDragStart={() => onMemberDragStart(d.id)}
            onDragEnd={onMemberDragEnd}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onMemberDrop(i);
            }}
          >
            {renderCard(d)}
            {(() => {
              const pinned = item.group.coverDesignId === d.id;
              const isCover = pinned || (!item.group.coverDesignId && i === 0);
              return (
                <button
                  type="button"
                  onClick={() => onSetCover(pinned ? null : d.id)}
                  title={
                    pinned
                      ? "Pinned as the folder cover — click to go back to whatever is first"
                      : "Pin this as the folder cover"
                  }
                  className={`absolute left-1 top-1 z-20 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider transition-colors ${
                    isCover
                      ? "bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))]"
                      : "bg-black/65 text-white/70 opacity-0 hover:text-white group-hover:opacity-100"
                  }`}
                >
                  {isCover ? "cover" : "make cover"}
                </button>
              );
            })()}
            <button
              type="button"
              onClick={() => onRemoveMember(d.id)}
              title="Take out of this folder"
              aria-label="Take out of this folder"
              className="absolute -right-1.5 -top-1.5 z-20 rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] p-1 text-[hsl(var(--ax-secondary))] shadow-lg transition-colors hover:text-[hsl(var(--ax-ink))]"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
