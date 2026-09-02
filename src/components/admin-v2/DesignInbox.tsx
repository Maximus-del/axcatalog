import { memo, useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Inbox, Search, UserPlus } from "lucide-react";
import {
  useAssignDesigns,
  useUnassignDesigns,
  useUnassignedDesigns,
  useUploadToInbox,
} from "@/lib/v2/data";
import { planDrop, titleFromFilename } from "@/lib/v2/drop-files";
import {
  DRAG_MIME,
  dragPayload,
  hitTest,
  movedEnough,
  normalizeRect,
  rangeBetween,
  readTray,
  union,
  writeTray,
  type Box,
} from "@/lib/v2/inbox";
import type { Design, Entity } from "@/lib/v2/types";
import DropZone, { DropTrigger } from "./DropZone";
import EntityPicker from "./inbox/EntityPicker";
import SortToTray from "./inbox/SortToTray";
import { AssetImage, EmptyState, ErrorState, Skeleton } from "./primitives";

// THE DESIGN INBOX — artwork that belongs to nobody yet.
//
// Every design surface in V2 is scoped to an entity, so a design with no
// athlete appeared NOWHERE. That pile is what this screen is for.
//
// It is a SORTING WORKSPACE, not a file manager. The whole job is: get 500
// historical files onto the right people without the process becoming tedious.
// So the three gestures that matter are drag a card onto a person, rubber-band
// a group of them, and tick the odd one from across the grid — and all three
// end in the same single mutation.
//
// Filing is a LINK. `design_athletes` has PRIMARY KEY (design_id, athlete_id),
// so a design can belong to an athlete AND their club, assigning twice is a
// no-op, and nothing is ever moved or copied in storage.

/** The AX house organisation. Inbox uploads belong to AX until they are filed. */
const AX_ORG = "2d6f377e-4fe8-448b-84b3-42aed237f3da";

type SortOrder = "newest" | "oldest" | "name";

export default function DesignInbox() {
  const inbox = useUnassignedDesigns();
  const assign = useAssignDesigns();
  const unassign = useUnassignDesigns();
  const upload = useUploadToInbox(AX_ORG);

  const [selected, setSelected] = useState<string[]>([]);
  const [pinned, setPinned] = useState<string[]>(() => readTray());
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<SortOrder>("newest");

  // Drag and marquee state that the GRID must not re-render for lives in refs.
  // `dragCount` is the one exception — the tray needs it to say "Drop 6 here".
  const [dragCount, setDragCount] = useState(0);
  const [marquee, setMarquee] = useState<Box | null>(null);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const anchorRef = useRef<string | null>(null);
  const lassoRef = useRef<{
    x0: number;
    y0: number;
    base: string[];
    boxes: Array<{ id: string; box: Box }>;
    active: boolean;
  } | null>(null);

  // Memoised so the identity is stable: `?? []` mints a new array on every
  // render, which would make the derived list below recompute on every frame
  // of a rubber-band drag.
  const designs = useMemo(() => inbox.data ?? [], [inbox.data]);

  /** What the operator can actually see — the order every range and marquee is taken over. */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? designs.filter((d) => (d.title ?? "").toLowerCase().includes(q)) : designs.slice();
    if (order === "oldest") return list.reverse();
    if (order === "name") return list.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
    return list; // the query already returns newest first
  }, [designs, query, order]);

  const visibleIds = useMemo(() => visible.map((d) => d.id), [visible]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const pin = (ids: string[]) =>
    setPinned((prev) => {
      const next = union(prev, ids);
      writeTray(next);
      return next;
    });

  const unpin = (id: string) =>
    setPinned((prev) => {
      const next = prev.filter((x) => x !== id);
      writeTray(next);
      return next;
    });

  /* ------------------------------------------------------------- assignment */

  const runAssign = useCallback(
    (entities: Entity[], designIds: string[]) => {
      if (entities.length === 0 || designIds.length === 0) return;
      const where =
        entities.length === 1 ? entities[0].name : `${entities.length} destinations`;

      assign.mutate(
        { designIds, entityIds: entities.map((e) => e.id) },
        {
          onSuccess: ({ linked, created }) => {
            setSelected((prev) => prev.filter((id) => !designIds.includes(id)));
            setPicking(false);
            anchorRef.current = null;

            if (linked === 0) {
              toast.info("Already filed there", { description: `Nothing changed on ${where}.` });
              return;
            }
            toast.success(
              `${designIds.length} ${designIds.length === 1 ? "design" : "designs"} assigned to ${where}`,
              {
                description: "They are on that design library now.",
                action: {
                  label: "Undo",
                  onClick: () =>
                    unassign.mutate(
                      { pairs: created },
                      {
                        onSuccess: () => toast.success("Back in the inbox"),
                        onError: (err) =>
                          toast.error(err instanceof Error ? err.message : "Could not undo that"),
                      },
                    ),
                },
              },
            );
          },
          onError: (err) => toast.error(err instanceof Error ? err.message : "Could not file those"),
        },
      );
    },
    [assign, unassign],
  );

  /* ------------------------------------------------------------------ upload */

  const acceptFiles = (files: File[]) => {
    const plan = planDrop(files);
    if (plan.accepted.length === 0) {
      toast.error("Nothing there AX can store", {
        description: plan.rejected.length > 0 ? plan.rejected.map((r) => r.name).join(", ") : "Images only.",
      });
      return;
    }
    upload.mutate(
      { files: plan.accepted, titleFor: (file) => titleFromFilename(file.name) || "Untitled design" },
      {
        onSuccess: ({ uploaded, failed }) => {
          if (failed.length > 0) {
            toast.warning(`${uploaded.length} in the inbox, ${failed.length} could not be`, {
              description: failed[0].name,
            });
          } else {
            toast.success(`${uploaded.length} in the inbox`, {
              description: "Drag them onto somebody in Sort to.",
            });
          }
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not upload those"),
      },
    );
  };

  /* ----------------------------------------------------------------- marquee */

  const beginLasso = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const grid = gridRef.current;
    if (!grid) return;
    // A pointerdown that starts ON a card belongs to that card — its click or
    // its drag. The marquee only owns the space between them.
    if ((e.target as HTMLElement).closest("[data-design-card]")) return;

    const rect = grid.getBoundingClientRect();
    const boxes: Array<{ id: string; box: Box }> = [];
    // Measured once, at the start: a getBoundingClientRect per card per
    // pointermove is what makes rubber-band selection stutter at 500 cards.
    for (const id of visibleIds) {
      const node = cardRefs.current.get(id);
      if (!node) continue;
      const b = node.getBoundingClientRect();
      boxes.push({
        id,
        box: {
          left: b.left - rect.left,
          top: b.top - rect.top,
          right: b.right - rect.left,
          bottom: b.bottom - rect.top,
        },
      });
    }

    lassoRef.current = {
      x0: e.clientX - rect.left,
      y0: e.clientY - rect.top,
      base: e.shiftKey || e.metaKey || e.ctrlKey ? selected : [],
      boxes,
      active: false,
    };
    grid.setPointerCapture(e.pointerId);
  };

  const moveLasso = (e: React.PointerEvent) => {
    const lasso = lassoRef.current;
    const grid = gridRef.current;
    if (!lasso || !grid) return;
    const rect = grid.getBoundingClientRect();
    const x1 = e.clientX - rect.left;
    const y1 = e.clientY - rect.top;
    if (!lasso.active && !movedEnough(lasso.x0, lasso.y0, x1, y1)) return;
    lasso.active = true;
    const box = normalizeRect(lasso.x0, lasso.y0, x1, y1);
    setMarquee(box);
    setSelected(union(lasso.base, hitTest(box, lasso.boxes)));
  };

  const endLasso = (e: React.PointerEvent) => {
    const lasso = lassoRef.current;
    lassoRef.current = null;
    setMarquee(null);
    try {
      gridRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* the pointer may already be gone */
    }
    // A click on the background, having selected nothing, means "never mind".
    if (lasso && !lasso.active && selected.length > 0) {
      setSelected([]);
      anchorRef.current = null;
    }
  };

  /* --------------------------------------------------------------- selection */

  const onCardClick = useCallback(
    (id: string, shiftKey: boolean) => {
      if (shiftKey) {
        setSelected((prev) => union(prev, rangeBetween(visibleIds, anchorRef.current, id)));
        return;
      }
      anchorRef.current = id;
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    },
    [visibleIds],
  );

  const onCardDragStart = useCallback(
    (id: string, ev: React.DragEvent) => {
      const ids = dragPayload(selected, id);
      ev.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
      // Some browsers refuse a drag with no standard type on it.
      ev.dataTransfer.setData("text/plain", `${ids.length} design${ids.length === 1 ? "" : "s"}`);
      ev.dataTransfer.effectAllowed = "copy";
      setDragCount(ids.length);
      if (ids.length > 1) ev.dataTransfer.setDragImage(makeDragGhost(ids.length), 24, 24);
    },
    [selected],
  );

  const onCardDragEnd = useCallback(() => setDragCount(0), []);

  const registerCard = useCallback((id: string, node: HTMLElement | null) => {
    if (node) cardRefs.current.set(id, node);
    else cardRefs.current.delete(id);
  }, []);

  if (inbox.isError) {
    return <ErrorState error={inbox.error} what="the design inbox" onRetry={() => void inbox.refetch()} />;
  }

  const dragging = dragCount > 0;

  return (
    <DropZone onFiles={acceptFiles} busy={upload.isPending} label="Drop artwork into the inbox" className="rounded-2xl">
      <section className="ax-card p-4 sm:p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Inbox className="h-4 w-4 shrink-0 text-[hsl(var(--ax-accent))]" aria-hidden />
            <h2 className="text-[15px] font-semibold">Design inbox</h2>
            <span className="text-[12px] tabular-nums text-[hsl(var(--ax-faint))]">
              {designs.length} unassigned
            </span>
          </div>
          <DropTrigger onFiles={acceptFiles} busy={upload.isPending}>
            Upload designs
          </DropTrigger>
        </div>

        <p className="mb-3 text-[11.5px] text-[hsl(var(--ax-faint))]">
          Artwork that is not on anyone yet. Upload now, organise later.
        </p>

        <SortToTray
          pinned={pinned}
          onPin={pin}
          onUnpin={unpin}
          dragging={dragging}
          dragCount={dragCount}
          busy={assign.isPending}
          onDropDesigns={(entity, ids) => {
            setDragCount(0);
            runAssign([entity], ids);
          }}
        />

        {/* ------------------------------------------------------ utility row */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-faint))]" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search designs…"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
            />
          </div>
          {(["newest", "oldest", "name"] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOrder(o)}
              className={`rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${
                order === o
                  ? "bg-[hsl(var(--ax-accent)/0.16)] text-[hsl(var(--ax-accent))]"
                  : "text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]"
              }`}
            >
              {o === "name" ? "A–Z" : o === "newest" ? "Newest" : "Oldest"}
            </button>
          ))}
          {visible.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelected(visibleIds);
                anchorRef.current = null;
              }}
              className="rounded-full border border-[hsl(var(--ax-border))] px-2.5 py-1 text-[11.5px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
            >
              {query ? `Select all ${visible.length} showing` : "Select all"}
            </button>
          )}
        </div>

        {/* --------------------------------------------------------- bulk bar */}
        {selected.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)] px-3 py-2">
            <span className="text-[12px] font-medium text-[hsl(var(--ax-accent))]">
              {selected.length} selected
            </span>
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-1 text-[11.5px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
            >
              <UserPlus className="h-3 w-3" />
              Assign to…
            </button>
            <span className="text-[11px] text-[hsl(var(--ax-faint))]">or drag them onto a destination</span>
            <button
              type="button"
              onClick={() => {
                setSelected([]);
                anchorRef.current = null;
              }}
              className="ml-auto text-[11px] text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]"
            >
              Clear
            </button>
          </div>
        )}

        {picking && selected.length > 0 && (
          <div className="mb-3">
            <EntityPicker
              multi
              busy={assign.isPending}
              confirmLabel={`Assign ${selected.length}`}
              onPick={(entities) => runAssign(entities, selected)}
            />
          </div>
        )}

        {/* ------------------------------------------------------------- grid */}
        {inbox.isLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState>
            {query
              ? "No unassigned artwork matches that."
              : "Nothing waiting. Anything you upload here stays until you file it onto someone."}
          </EmptyState>
        ) : (
          <div
            ref={gridRef}
            onPointerDown={beginLasso}
            onPointerMove={moveLasso}
            onPointerUp={endLasso}
            onPointerCancel={endLasso}
            className={`relative grid select-none grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8 ${
              dragging ? "opacity-70" : ""
            }`}
          >
            {visible.map((d) => (
              <DesignCard
                key={d.id}
                design={d}
                selected={selectedSet.has(d.id)}
                anySelected={selected.length > 0}
                onClick={onCardClick}
                onDragStart={onCardDragStart}
                onDragEnd={onCardDragEnd}
                register={registerCard}
              />
            ))}

            {marquee && (
              <div
                aria-hidden
                className="pointer-events-none absolute z-20 rounded-sm border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)]"
                style={{
                  left: marquee.left,
                  top: marquee.top,
                  width: marquee.right - marquee.left,
                  height: marquee.bottom - marquee.top,
                }}
              />
            )}
          </div>
        )}
      </section>
    </DropZone>
  );
}

/* --------------------------------------------------------------------- card */

/**
 * Memoised on purpose.
 *
 * A rubber-band drag updates the selection on every pointermove. Without this,
 * every card in the grid re-renders on every frame of the gesture, which is
 * exactly the stutter section 17 of the brief warns about.
 */
const DesignCard = memo(function DesignCard({
  design,
  selected,
  anySelected,
  onClick,
  onDragStart,
  onDragEnd,
  register,
}: {
  design: Design;
  selected: boolean;
  anySelected: boolean;
  onClick: (id: string, shiftKey: boolean) => void;
  onDragStart: (id: string, ev: React.DragEvent) => void;
  onDragEnd: () => void;
  register: (id: string, node: HTMLElement | null) => void;
}) {
  return (
    <div
      data-design-card={design.id}
      ref={(node) => register(design.id, node)}
      draggable
      onDragStart={(ev) => onDragStart(design.id, ev)}
      onDragEnd={onDragEnd}
      onClick={(ev) => onClick(design.id, ev.shiftKey)}
      title={design.title}
      className={`group relative cursor-grab overflow-hidden rounded-xl border text-left transition-colors active:cursor-grabbing ${
        selected
          ? "border-[hsl(var(--ax-accent))] ring-1 ring-[hsl(var(--ax-accent))]"
          : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.6)]"
      }`}
    >
      <AssetImage
        bucket={design.fileBucket}
        path={design.filePath}
        alt={design.title}
        className="pointer-events-none aspect-square w-full bg-black/40"
        fit="contain"
        fallbackSeed={design.id}
      />

      {/* The tick box: always there once sorting has started, on hover before that. */}
      <span
        className={`absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-[5px] border transition-opacity ${
          selected
            ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent))] opacity-100"
            : `border-white/50 bg-black/40 ${anySelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`
        }`}
      >
        {selected && <Check className="h-2.5 w-2.5 text-[hsl(var(--ax-on-accent))]" />}
      </span>

      <span className="block truncate px-1.5 py-1 text-[10px] text-[hsl(var(--ax-secondary))]">
        {design.title || "Untitled"}
      </span>
    </div>
  );
});

/**
 * The thing under the cursor while a group is in flight.
 *
 * The browser's default drag image is the one card you grabbed, which says
 * nothing about the other five travelling with it.
 */
function makeDragGhost(count: number): HTMLElement {
  const el = document.createElement("div");
  el.textContent = `${count} designs`;
  el.style.cssText = [
    "position:fixed",
    "top:-1000px",
    "left:-1000px",
    "padding:8px 14px",
    "border-radius:10px",
    "font:600 12px/1 ui-sans-serif,system-ui,sans-serif",
    "color:#08120c",
    "background:#3ddc84",
    "box-shadow:0 8px 24px rgba(0,0,0,.45)",
  ].join(";");
  document.body.appendChild(el);
  // Long enough for the browser to snapshot it, short enough that it never
  // becomes litter in the DOM.
  window.setTimeout(() => el.remove(), 0);
  return el;
}
