import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  Check,
  Archive,
  ArchiveRestore,
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  GripVertical,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Sparkles,
  SquarePen,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useBlanks, useDesigns, useMockupActions, useMockupLibrary } from "@/lib/v2/data";
import { describeRebuild, rebuildPreviews } from "@/lib/v2/preview-rebuild";
import { hasStalePreview } from "@/lib/v2/mockup-image";
import { mockupCover } from "@/lib/v2/mockup-image";
import {
  buildMockupShelf,
  coverOf,
  dropIntent,
  memberOrderWrites,
  moveItem,
  orderWrites,
  searchMockups,
  suggestFolderName,
  type MockupShelfItem,
} from "@/lib/v2/mockup-shelf";
import {
  LIFECYCLE,
  LIFECYCLE_ORDER,
  applyLifecycleFilter,
  countByLifecycle,
  toLifecycle,
  type Lifecycle,
} from "@/lib/v2/mockup-lifecycle";
import type { Mockup } from "@/lib/v2/types";
import { AssetImage, Chip, EmptyState, Skeleton, Toolbar } from "./primitives";

// The saved mockup library for one entity.
//
// A mockup is a finished object here, not a step toward a Product. It can live
// in this library indefinitely without a price, a Shopify listing, an approval
// or a product, and nothing in this component pushes it toward becoming one.
//
// Organisation deliberately behaves exactly like the Designs shelf — folders
// lead, drop one onto another to group them, the first member is the cover —
// because an operator should not have to learn two different filing systems in
// the same product.

export default function MockupLibrary({
  entityId,
  organizationId,
  entityName,
  onOpen,
  onTurnIntoAssets,
  onCreateProduct,
}: {
  entityId: string;
  organizationId: string;
  /** Whose library this is — used when telling the operator who a mockup was shared with. */
  entityName: string;
  onOpen: (mockup: Mockup) => void;
  onTurnIntoAssets: (mockup: Mockup) => void;
  /**
   * The existing V1-era productize flow. Kept reachable rather than rebuilt —
   * a mockup still never becomes a product on its own, this is just the door.
   */
  onCreateProduct: (mockup: Mockup) => void;
}) {
  const { data, isLoading, refetch } = useMockupLibrary(entityId);
  const blanksQ = useBlanks();
  const designsQ = useDesigns(entityId);
  /** null when idle; otherwise how far through a rebuild we are. */
  const [rebuilding, setRebuilding] = useState<{ done: number; total: number } | null>(null);
  const actions = useMockupActions(entityId, organizationId);

  /*
    WHAT YOU ARE LOOKING AT LIVES IN THE URL.

    Which folder is open, which status you have filtered to and what you
    searched for are navigation, not decoration: they should survive a refresh
    and be sendable to someone else. Parameters are prefixed `m` because this
    component shares an address bar with the workspace's own `?mockup=`.
  */
  const [params, setParams] = useSearchParams();
  const query = params.get("mq") ?? "";
  const statusParam = params.get("mstatus");
  const statusFilter: Lifecycle | "all" = LIFECYCLE_ORDER.includes(statusParam as Lifecycle)
    ? (statusParam as Lifecycle)
    : "all";
  const folderFilter = params.get("mfolder") ?? "all";
  const view = params.get("mview") === "list" ? "list" : "grid";
  const openFolder = params.get("mopen");
  const sharedOnly = params.get("mshared") === "1";

  const patch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value == null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };
  const setQuery = (v: string) => patch({ mq: v.trim() ? v : null });
  const setStatusFilter = (v: Lifecycle | "all") => patch({ mstatus: v === "all" ? null : v });
  const setFolderFilter = (v: string) => patch({ mfolder: v === "all" ? null : v });
  const setView = (v: "grid" | "list") => patch({ mview: v === "grid" ? null : v });
  const setOpenFolder = (v: string | null) => patch({ mopen: v });
  const setSharedOnly = (v: boolean) => patch({ mshared: v ? "1" : null });

  const [dragKey, setDragKey] = useState<string | null>(null);
  const [hint, setHint] = useState<{ key: string; zone: "before" | "onto" } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renamingMockup, setRenamingMockup] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState(false);
  const [optimistic, setOptimistic] = useState<MockupShelfItem[] | null>(null);
  const [draggingMember, setDraggingMember] = useState<string | null>(null);
  // Multi-select for bulk moves and status changes. Empty means single-item mode.
  const [selected, setSelected] = useState<string[]>([]);
  /** Two-step confirm for the bulk delete, matching the single-mockup one. */
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  /*
    Arm and disarm together. Changing the selection after arming would let a
    second click delete a different set from the one that was confirmed, which
    is the one mistake a delete confirm exists to prevent.
  */
  useEffect(() => {
    setConfirmBulkDelete(false);
  }, [selected]);

  /**
   * Delete every selected mockup.
   *
   * Sequential rather than parallel so a partial failure is reportable: the
   * count that comes back is the count that actually went. The design, the
   * blank and any product made from a mockup are untouched — deleting the
   * mockup deletes the arrangement, not what it was made from.
   */
  const deleteSelected = async () => {
    const ids = [...selected];
    let deleted = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await actions.mutateAsync({ type: "delete", mockupId: id });
        deleted += 1;
      } catch {
        failed.push(id);
      }
    }
    setConfirmBulkDelete(false);
    setSelected(failed);
    if (failed.length > 0) {
      toast.warning(`Deleted ${deleted} of ${ids.length}`, {
        description: `${failed.length} could not be deleted and ${failed.length === 1 ? "is" : "are"} still selected.`,
      });
    } else {
      toast.success(`Deleted ${deleted} mockup${deleted === 1 ? "" : "s"}`, {
        description: "The designs and the blanks are untouched.",
      });
    }
  };

  /**
   * Re-flatten artwork onto the garment for a set of mockups.
   *
   * Every preview rendered before the image proxy existed lost its garment and
   * saved as artwork on a dark square, so this exists to repair them in one
   * pass rather than one sheet at a time. Rebuilding a good preview is
   * harmless — it just renders the same picture again.
   */
  /** Mockups whose saved preview is known to be missing its garment. */
  const stalePreviews = useMemo(
    () => (data?.mockups ?? []).filter((m) => hasStalePreview(m)),
    [data],
  );

  const rebuild = async (ids: string[]) => {
    const targets = (data?.mockups ?? []).filter((m) => ids.includes(m.id));
    if (targets.length === 0) return;
    setRebuilding({ done: 0, total: targets.length });
    try {
      const summary = await rebuildPreviews({
        mockups: targets,
        blanks: blanksQ.data ?? [],
        designs: designsQ.data ?? [],
        onProgress: (done, total) => setRebuilding({ done, total }),
      });
      await refetch();
      setSelected([]);
      if (summary.failed.length > 0) {
        toast.warning(describeRebuild(summary), {
          description: `${summary.failed[0].title}: ${summary.failed[0].reason}`,
        });
      } else {
        toast.success(describeRebuild(summary));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rebuild those previews");
    } finally {
      setRebuilding(null);
    }
  };

  const serverItems = useMemo(() => {
    if (!data) return [];
    // Status is a property of the mockup, so it filters the mockups BEFORE the
    // shelf is built — otherwise a folder whose members are all archived would
    // still render as an empty folder.
    let mockups = applyLifecycleFilter(data.mockups, statusFilter);
    if (sharedOnly) mockups = mockups.filter((m) => m.clientVisible);
    const folders =
      folderFilter === "all" ? data.folders : data.folders.filter((f) => f.id === folderFilter);
    const scoped = folderFilter === "all" ? mockups : mockups.filter((m) => m.folderId === folderFilter);
    return buildMockupShelf(scoped, folders);
  }, [data, statusFilter, folderFilter, sharedOnly]);

  const counts = useMemo(() => countByLifecycle(data?.mockups ?? []), [data]);
  const sharedCount = useMemo(() => (data?.mockups ?? []).filter((m) => m.clientVisible).length, [data]);

  useEffect(() => setOptimistic(null), [data]);

  // Selection is about what is on screen. Leaving it intact across a filter
  // change left the bulk bar offering to act on mockups the operator could no
  // longer see, which is how you archive the wrong five.
  useEffect(() => setSelected([]), [statusFilter, folderFilter, query, sharedOnly]);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => {
      setMenuFor(null);
      setConfirmDelete(null);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuFor]);

  const items = optimistic ?? serverItems;

  // Search narrows what is shown without dissolving folders — an operator
  // searching for "aqua" still wants to know it lives in the Training Camp drop.
  const visible = useMemo(() => {
    if (!query.trim()) return items;
    return items
      .map((item) => {
        if (item.kind === "mockup") return searchMockups([item.mockup], query).length ? item : null;
        const mockups = searchMockups(item.mockups, query);
        return mockups.length ? { ...item, mockups } : null;
      })
      .filter(Boolean) as MockupShelfItem[];
  }, [items, query]);

  const fail = (msg: string) => {
    setOptimistic(null);
    toast.error(msg);
  };

  /* ------------------------------------------------------------- actions */

  const rename = (mockup: Mockup, title: string) => {
    setRenamingMockup(null);
    const trimmed = title.trim();
    if (!trimmed || trimmed === mockup.title) return;
    actions.mutate({ type: "rename", mockupId: mockup.id, title: trimmed }, { onError: () => fail("Could not rename") });
  };

  /**
   * Delete, on the second click.
   *
   * A mockup is real work and deleting one was a single mis-aimed click in a
   * menu, with no confirmation and no undo. The menu item now arms itself and
   * says what it is about to destroy.
   */
  const remove = (mockup: Mockup) => {
    if (confirmDelete !== mockup.id) {
      setConfirmDelete(mockup.id);
      return;
    }
    setConfirmDelete(null);
    setMenuFor(null);
    actions.mutate(
      { type: "delete", mockupId: mockup.id },
      {
        onError: () => fail("Could not delete that mockup"),
        onSuccess: () =>
          toast.success(`Deleted “${mockup.title}”`, {
            description: "The design and the blank are untouched.",
          }),
      },
    );
  };

  const duplicate = (mockup: Mockup) => {
    setMenuFor(null);
    actions.mutate(
      { type: "duplicate", mockupId: mockup.id },
      {
        onError: () => fail("Could not duplicate that mockup"),
        onSuccess: () => toast.success("Duplicated — the copy keeps the same arrangement"),
      },
    );
  };

  /**
   * Share with, or hide from, the athlete or client.
   *
   * The default is hidden and stays hidden: a mockup is internal creative work
   * until an operator decides otherwise.
   *
   * HONEST ABOUT WHAT THIS DOES TODAY. The flag is recorded and shown to the
   * operator; no athlete-facing surface reads it yet. Designs have the
   * equivalent switch enforced in Postgres by design_client_visible() plus
   * storage policies, and mockups will need the same — a policy that widens
   * what a client session can read is not a change to make unsupervised, so it
   * is written up rather than guessed at. Until then the copy says so instead
   * of implying the client can already see it.
   */
  const setShared = (ids: string[], visible: boolean) => {
    setMenuFor(null);
    if (ids.length === 0) return;
    /*
      A mockup whose composite never rendered falls back to the BLANK's
      catalogue photo — an empty garment. Internally that is a harmless
      placeholder; shared with a client it is the wrong picture, presented as
      their mockup. Sharing still goes ahead, because the operator may be about
      to re-save it, but it does not go ahead quietly.
    */
    const unrendered = visible
      ? (data?.mockups ?? []).filter((m) => ids.includes(m.id) && !m.imagePath).length
      : 0;
    actions.mutate(
      { type: "set-client-visible", mockupIds: ids, visible },
      {
        onError: () => fail(visible ? "Could not share that" : "Could not hide that"),
        onSuccess: () => {
          const shared = `${ids.length === 1 ? "Shared" : `${ids.length} shared`} with ${entityName}`;
          const hidden = `${ids.length === 1 ? "Hidden" : `${ids.length} hidden`} from ${entityName}`;
          if (!visible) toast.success(hidden);
          else if (unrendered > 0) {
            toast.warning(shared, {
              description:
                unrendered === ids.length
                  ? "No rendered preview yet, so they would see the plain garment. Open it and save once to render one."
                  : `${unrendered} of these have no rendered preview and would show the plain garment.`,
            });
          } else {
            toast.success(shared, {
              description: "They see the flattened mockup — never the artwork it was built from.",
            });
          }
          setSelected([]);
        },
      },
    );
  };

  /**
   * Archive, and unarchive.
   *
   * It was reachable only from the mockup's own page, behind a status list, so
   * clearing a shelf meant opening every item on it. Archiving also hides the
   * mockup from the client — see setShared: getting something out of the way
   * should get it out of everyone's way.
   */
  const setArchived = (mockup: Mockup, archived: boolean) => {
    setMenuFor(null);
    actions.mutate(
      { type: "set-lifecycle", mockupIds: [mockup.id], lifecycle: archived ? "archived" : "bin" },
      {
        onError: () => fail(archived ? "Could not archive that" : "Could not restore that"),
        onSuccess: () =>
          toast.success(archived ? `“${mockup.title}” archived` : `“${mockup.title}” restored`, {
            description: archived ? "Hidden from this shelf, and from the client." : undefined,
          }),
      },
    );
  };

  const setCover = (folderId: string, mockupId: string | null) => {
    actions.mutate(
      { type: "set-folder-cover", folderId, mockupId },
      {
        onError: () => fail("Could not set that cover"),
        onSuccess: () =>
          toast.success(mockupId ? "Folder cover pinned" : "Folder cover back to whatever is first"),
      },
    );
  };

  /* --------------------------------------------------------------- drag */

  const indexOfKey = (key: string) => items.findIndex((i) => i.key === key);

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
      actions.mutate({ type: "order", writes: orderWrites(next) }, { onError: () => fail("Could not save the order") });
      return;
    }

    if (intent.type === "add-to-folder" && dragged.kind === "mockup") {
      const folder = items.find((i) => i.key === intent.folderId);
      const size = folder && folder.kind === "folder" ? folder.mockups.length : 0;
      setOptimistic(items.filter((i) => i.key !== dragged.key));
      actions.mutate(
        { type: "add-to-folder", folderId: intent.folderId, mockupId: dragged.mockup.id, sortOrder: size },
        { onError: () => fail("Could not move it into that folder"), onSuccess: () => setOpenFolder(intent.folderId) },
      );
      return;
    }

    if (intent.type === "group-with" && dragged.kind === "mockup" && target.kind === "mockup") {
      const name = suggestFolderName(target.mockup);
      setOptimistic(items.filter((i) => i.key !== dragged.key));
      actions.mutate(
        {
          type: "create-folder",
          name,
          mockupIds: [target.mockup.id, dragged.mockup.id],
          sortOrder: target.sortOrder,
        },
        {
          onError: () => fail("Could not create the folder"),
          onSuccess: () => toast.success(`Grouped as “${name}”`, { description: "Click the name to rename it." }),
        },
      );
    }
  };

  const dropProps = (item: MockupShelfItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragKey(item.key);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: React.DragEvent) => {
      if (!dragKey || dragKey === item.key) return;
      e.preventDefault();
      const box = e.currentTarget.getBoundingClientRect();
      setHint({ key: item.key, zone: e.clientX - box.left < box.width * 0.25 ? "before" : "onto" });
    },
    onDragLeave: () => setHint((h) => (h?.key === item.key ? null : h)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      onDrop(item.key, hint?.key === item.key ? hint.zone : "onto");
    },
  });

  /* -------------------------------------------------------------- render */

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5]" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState>
        No mockups yet. A mockup is artwork placed on a blank — it can live here indefinitely without a price, a
        product, or anything sent to Shopify.
      </EmptyState>
    );
  }

  const folders = visible.filter((i): i is Extract<MockupShelfItem, { kind: "folder" }> => i.kind === "folder");
  const loose = visible.filter((i): i is Extract<MockupShelfItem, { kind: "mockup" }> => i.kind === "mockup");
  const open = visible.find((i) => i.key === openFolder && i.kind === "folder");

  const card = (m: Mockup) => (
    <MockupCard
      mockup={m}
      selected={selected.includes(m.id)}
      onToggleSelect={() =>
        setSelected((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]))
      }
      dense={view === "list"}
      renaming={renamingMockup === m.id}
      menuOpen={menuFor === m.id}
      onMenu={() => setMenuFor(menuFor === m.id ? null : m.id)}
      onStartRename={() => {
        setMenuFor(null);
        setRenamingMockup(m.id);
      }}
      onRename={(title) => rename(m, title)}
      onCancelRename={() => setRenamingMockup(null)}
      onOpen={() => onOpen(m)}
      onDuplicate={() => duplicate(m)}
      onDelete={() => remove(m)}
      confirmingDelete={confirmDelete === m.id}
      onSetShared={(visible) => setShared([m.id], visible)}
      onSetArchived={(archived) => setArchived(m, archived)}
      onTurnIntoAssets={() => {
        setMenuFor(null);
        onTurnIntoAssets(m);
      }}
      onCreateProduct={
        m.blankId && !m.productId
          ? () => {
              setMenuFor(null);
              onCreateProduct(m);
            }
          : undefined
      }
    />
  );

  return (
    <>
      <Toolbar query={query} onQuery={setQuery} placeholder="Search mockups, blanks, colours…">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Lifecycle | "all")}
          className="rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-1.5 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
        >
          <option value="all">All status</option>
          {LIFECYCLE_ORDER.map((stage) => (
            <option key={stage} value={stage}>
              {LIFECYCLE[stage].label} ({counts[stage]})
            </option>
          ))}
        </select>

        <select
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
          className="rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-1.5 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
        >
          <option value="all">All folders</option>
          {(data?.folders ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>

        <div className="inline-flex rounded-full border border-[hsl(var(--ax-border))] p-0.5">
          {(["grid", "list"] as const).map((v) => {
            const Icon = v === "grid" ? LayoutGrid : List;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-label={`${v} view`}
                className={`rounded-full p-1.5 transition-colors ${
                  view === v
                    ? "bg-[hsl(var(--ax-accent)/0.16)] text-[hsl(var(--ax-accent))]"
                    : "text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-secondary))]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        {/*
          Naming a folder inline rather than in window.prompt(). A native
          browser dialog in a dark operator tool reads as a bug, cannot be
          styled, cannot be dismissed by clicking away, and blocks the tab.
        */}
        {/*
          Not another status. "Can the client see this" is a different question
          from "where is this in the pipeline", and an operator asks it right
          before a call rather than while filing.
        */}
        <Chip active={sharedOnly} onClick={() => setSharedOnly(!sharedOnly)} title="Only mockups shared with the client">
          {sharedOnly ? "Shared only" : `Shared ${sharedCount}`}
        </Chip>

        {newFolder ? (
          <input
            autoFocus
            placeholder="Folder name, then Enter"
            onBlur={() => setNewFolder(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNewFolder(false);
              if (e.key !== "Enter") return;
              const name = (e.target as HTMLInputElement).value.trim();
              setNewFolder(false);
              if (!name) return;
              actions.mutate(
                { type: "new-folder", name, sortOrder: data?.folders.length ?? 0 },
                {
                  onError: () => fail("Could not create that folder"),
                  onSuccess: () => toast.success(`Folder “${name}” created`),
                },
              );
            }}
            className="rounded-full border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-card))] px-3 py-1.5 text-[12px] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setNewFolder(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
          >
            <FolderPlus className="h-3.5 w-3.5" /> New folder
          </button>
        )}
      </Toolbar>

      {/*
        Whose library this is. The page header says it once, six sections up and
        off screen by the time you are looking at a folder — and a mockup with
        no owner on the card is exactly how work ends up filed under the wrong
        person.
      */}
      <p className="mb-3 text-[11px] text-[hsl(var(--ax-faint))]">
        {data?.mockups.length ?? 0} {(data?.mockups.length ?? 0) === 1 ? "mockup" : "mockups"} for{" "}
        <span className="text-[hsl(var(--ax-secondary))]">{entityName}</span>
        {sharedCount > 0 && <> · {sharedCount} shared with them</>}
        {(data?.folders.length ?? 0) > 0 && (
          <> · {data?.folders.length} {data?.folders.length === 1 ? "folder" : "folders"}</>
        )}
      </p>

      {/*
        THE REPAIR PROMPT.

        Shown only while some mockup on this shelf is still carrying a preview
        that was rendered before the garment could be drawn. It disappears for
        good once they are rebuilt, so it is a one-time chore with a button
        rather than a permanent piece of furniture.
      */}
      {stalePreviews.length > 0 && selected.length === 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--ax-amber)/0.4)] bg-[hsl(var(--ax-amber)/0.08)] px-3.5 py-2.5">
          <span className="min-w-0 flex-1 text-[12px] text-[hsl(var(--ax-secondary))]">
            {stalePreviews.length} {stalePreviews.length === 1 ? "preview was" : "previews were"} built before the
            garment could be loaded, so {stalePreviews.length === 1 ? "it shows" : "they show"} the artwork on its own.
            The mockups themselves are fine.
          </span>
          <button
            type="button"
            disabled={rebuilding != null}
            onClick={() => void rebuild(stalePreviews.map((m) => m.id))}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rebuilding ? "animate-spin" : ""}`} />
            {rebuilding ? `Rebuilding ${rebuilding.done}/${rebuilding.total}…` : `Rebuild ${stalePreviews.length}`}
          </button>
        </div>
      )}

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)] px-3 py-2">
          <span className="text-[12px] font-medium text-[hsl(var(--ax-accent))]">
            {selected.length} selected
          </span>
          {/*
            Destructive, so it sits last and arms before it fires. The second
            click is the one that deletes, and the label says how many.
          */}
          <button
            type="button"
            disabled={actions.isPending}
            onClick={() => {
              if (!confirmBulkDelete) {
                setConfirmBulkDelete(true);
                return;
              }
              void deleteSelected();
            }}
            className={`order-last inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50 ${
              confirmBulkDelete
                ? "border-[hsl(var(--ax-red))] bg-[hsl(var(--ax-red)/0.14)] text-[hsl(var(--ax-red))]"
                : "border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] text-[hsl(var(--ax-faint))] hover:border-[hsl(var(--ax-red)/0.5)] hover:text-[hsl(var(--ax-red))]"
            }`}
          >
            <Trash2 className="h-3 w-3" />
            {confirmBulkDelete
              ? `Delete ${selected.length} — cannot be undone`
              : `Delete ${selected.length}`}
          </button>
          <button
            type="button"
            disabled={rebuilding != null}
            onClick={() => void rebuild(selected)}
            title="Flatten the artwork onto the garment again"
            className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-1 text-[11px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${rebuilding ? "animate-spin" : ""}`} />
            Rebuild previews
          </button>
          <select
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (!v) return;
              actions.mutate(
                { type: "set-lifecycle", mockupIds: selected, lifecycle: v },
                {
                  onError: () => fail("Could not change those"),
                  onSuccess: () => {
                    toast.success(`${selected.length} moved to ${LIFECYCLE[v as Lifecycle].label}`);
                    setSelected([]);
                  },
                },
              );
            }}
            className="rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-1 text-[11px] outline-none"
          >
            <option value="">Set status…</option>
            {LIFECYCLE_ORDER.filter((l) => l !== "converted").map((stage) => (
              <option key={stage} value={stage}>
                {LIFECYCLE[stage].label}
              </option>
            ))}
          </select>
          <select
            defaultValue=""
            onChange={(e) => {
              const v = e.target.value;
              e.target.value = "";
              if (!v) return;
              const size = data?.mockups.filter((m) => m.folderId === v).length ?? 0;
              // Each move is reported on its own. The previous version resolved
              // on onSettled and then claimed every one had moved, so a
              // rejected write looked exactly like a successful one.
              Promise.all(
                selected.map(
                  (id, i) =>
                    new Promise<boolean>((resolve) =>
                      actions.mutate(
                        { type: "add-to-folder", folderId: v, mockupId: id, sortOrder: size + i },
                        { onSuccess: () => resolve(true), onError: () => resolve(false) },
                      ),
                    ),
                ),
              ).then((results) => {
                const moved = results.filter(Boolean).length;
                const failed = results.length - moved;
                if (failed === 0) toast.success(`${moved} moved`);
                else if (moved === 0) toast.error("None of those could be moved");
                else toast.warning(`${moved} moved, ${failed} could not be`);
                setSelected([]);
              });
            }}
            className="rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-1 text-[11px] outline-none"
          >
            <option value="">Move to folder…</option>
            {(data?.folders ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShared(selected, true)}
            className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--ax-border))] px-2.5 py-1 text-[11px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
          >
            <Eye className="h-3 w-3" /> Share
          </button>
          <button
            type="button"
            onClick={() => setShared(selected, false)}
            className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--ax-border))] px-2.5 py-1 text-[11px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
          >
            <EyeOff className="h-3 w-3" /> Hide
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="ml-auto text-[11px] text-[hsl(var(--ax-faint))] underline hover:text-[hsl(var(--ax-secondary))]"
          >
            Clear
          </button>
        </div>
      )}

      {visible.length === 0 && (
        <EmptyState>Nothing matches “{query}”.</EmptyState>
      )}

      {folders.length > 0 && (
        <section className="mb-6">
          <BandLabel>Folders</BandLabel>
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            onDragEnd={() => {
              setDragKey(null);
              setHint(null);
            }}
          >
            {folders.map((item) => (
              <div key={item.key} className="relative" {...dropProps(item)}>
                {hint?.key === item.key && hint.zone === "before" && <DropRail />}
                <FolderCard
                  item={item}
                  merging={hint?.key === item.key && hint.zone === "onto"}
                  dragging={dragKey === item.key}
                  isOpen={openFolder === item.key}
                  onToggle={() => setOpenFolder(openFolder === item.key ? null : item.key)}
                  onRename={() => {
                    setOpenFolder(item.key);
                    setRenamingFolder(item.key);
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {open && open.kind === "folder" && (
        <div className="mb-6 rounded-2xl border border-[hsl(var(--ax-accent)/0.4)] bg-[hsl(var(--ax-accent)/0.04)] p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FolderOpen className="h-4 w-4 shrink-0 text-[hsl(var(--ax-accent))]" />
            {renamingFolder === open.key ? (
              <input
                autoFocus
                defaultValue={open.folder.name}
                onBlur={(e) => {
                  setRenamingFolder(null);
                  const name = e.target.value.trim();
                  if (name && name !== open.folder.name) {
                    actions.mutate({ type: "rename-folder", folderId: open.key, name });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenamingFolder(null);
                }}
                className="min-w-[220px] flex-1 rounded-lg border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-card))] px-2.5 py-1.5 text-[15px] outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setRenamingFolder(open.key)}
                className="group flex min-w-0 flex-1 items-center gap-1.5 text-left text-[15px] font-semibold hover:text-[hsl(var(--ax-accent))]"
              >
                <span className="truncate">{open.folder.name}</span>
                <Pencil className="h-3 w-3 shrink-0 text-[hsl(var(--ax-faint))] opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            <span className="text-[11px] text-[hsl(var(--ax-faint))]">{open.mockups.length} mockups</span>
            <button
              type="button"
              onClick={() => {
                setOpenFolder(null);
                actions.mutate(
                  {
                    type: "ungroup",
                    folderId: open.key,
                    mockupIds: open.mockups.map((m) => m.id),
                    baseSortOrder: items.length,
                  },
                  {
                    onError: () => fail("Could not ungroup that folder"),
                    onSuccess: () => toast.success(`“${open.folder.name}” ungrouped`),
                  },
                );
              }}
              className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-1 text-[11px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
            >
              Ungroup
            </button>
            <button
              type="button"
              onClick={() => setOpenFolder(null)}
              className="rounded-lg p-1 text-[hsl(var(--ax-faint))] hover:bg-white/10"
              aria-label="Close folder"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-3 text-[11px] text-[hsl(var(--ax-faint))]">
            Drag to reorder. The first mockup is the cover unless you pin one. Drag one out, or use the ×, to return
            it to the shelf.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {open.mockups.map((m, i) => (
              <div
                key={m.id}
                className="group relative"
                draggable
                onDragStart={() => setDraggingMember(m.id)}
                onDragEnd={() => setDraggingMember(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = draggingMember;
                  setDraggingMember(null);
                  if (!id || id === m.id) return;
                  const from = open.mockups.findIndex((x) => x.id === id);
                  if (from < 0) return;
                  let to = i;
                  if (from < to) to -= 1;
                  const next = moveItem(open.mockups, from, to);
                  setOptimistic(
                    items.map((it) => (it.key === open.key && it.kind === "folder" ? { ...it, mockups: next } : it)),
                  );
                  actions.mutate(
                    { type: "order", writes: memberOrderWrites(next) },
                    { onError: () => fail("Could not reorder the folder") },
                  );
                }}
              >
                {card(m)}
                {/*
                  A pinned cover beats position. The folder used to show
                  whichever mockup happened to be first, so choosing a cover
                  meant dragging the whole shelf around; the pin was in the
                  data model but nothing could ever set it.
                */}
                {(() => {
                  const pinned = open.folder.coverMockupId === m.id;
                  const isCover = pinned || (!open.folder.coverMockupId && i === 0);
                  return (
                    <button
                      type="button"
                      onClick={() => setCover(open.key, pinned ? null : m.id)}
                      title={
                        pinned
                          ? "Pinned as the folder cover — click to go back to whatever is first"
                          : "Pin this as the folder cover"
                      }
                      className={`absolute left-1.5 top-1.5 z-20 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider transition-colors ${
                        isCover
                          ? "bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))]"
                          : "bg-black/65 text-white/70 opacity-0 hover:text-white group-hover:opacity-100"
                      }`}
                    >
                      {pinned ? <Star className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                      {isCover ? "cover" : "make cover"}
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={() =>
                    actions.mutate(
                      { type: "remove-from-folder", mockupId: m.id, sortOrder: items.length },
                      { onError: () => fail("Could not take it out of the folder") },
                    )
                  }
                  title="Take out of this folder"
                  aria-label="Take out of this folder"
                  className="absolute -right-1.5 -top-1.5 z-20 rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] p-1 text-[hsl(var(--ax-secondary))] shadow-lg hover:text-[hsl(var(--ax-ink))]"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loose.length > 0 && (
        <section>
          <BandLabel>Mockups</BandLabel>
          {draggingMember && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = draggingMember;
                setDraggingMember(null);
                if (id) {
                  actions.mutate(
                    { type: "remove-from-folder", mockupId: id, sortOrder: items.length },
                    { onError: () => fail("Could not take it out of the folder") },
                  );
                }
              }}
              className="mb-3 rounded-xl border border-dashed border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.07)] px-4 py-3 text-center text-[12px] font-medium text-[hsl(var(--ax-accent))]"
            >
              Drop here to take it out of the folder
            </div>
          )}
          <div
            className={
              view === "list"
                ? "grid grid-cols-1 gap-2"
                : "grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5"
            }
            onDragEnd={() => {
              setDragKey(null);
              setHint(null);
            }}
          >
            {loose.map((item) => (
              <div key={item.key} className="relative" {...dropProps(item)}>
                {hint?.key === item.key && hint.zone === "before" && <DropRail />}
                <div
                  className={
                    hint?.key === item.key && hint.zone === "onto"
                      ? "rounded-2xl ring-2 ring-[hsl(var(--ax-accent))]"
                      : ""
                  }
                >
                  {card(item.mockup)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ parts */

function BandLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ax-secondary))]">
      {children}
    </div>
  );
}

function DropRail() {
  return <span className="absolute -left-1.5 top-0 z-10 h-full w-0.5 rounded bg-[hsl(var(--ax-accent))]" />;
}

function MockupCard({
  mockup,
  selected,
  onToggleSelect,
  dense,
  renaming,
  menuOpen,
  onMenu,
  onStartRename,
  onRename,
  onCancelRename,
  onOpen,
  onDuplicate,
  onDelete,
  confirmingDelete,
  onSetShared,
  onSetArchived,
  onTurnIntoAssets,
  onCreateProduct,
}: {
  mockup: Mockup;
  selected: boolean;
  onToggleSelect: () => void;
  dense: boolean;
  renaming: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onStartRename: () => void;
  onRename: (title: string) => void;
  onCancelRename: () => void;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Delete is armed and waiting for a second click. */
  confirmingDelete: boolean;
  onSetShared: (visible: boolean) => void;
  onSetArchived: (archived: boolean) => void;
  onTurnIntoAssets: () => void;
  onCreateProduct?: () => void;
}) {
  const stage = toLifecycle(mockup.lifecycle);
  return (
    <div
      className={`ax-card ax-card-hover overflow-hidden transition-all ${
        selected ? "ring-2 ring-[hsl(var(--ax-accent))]" : ""
      } ${dense ? "flex items-center gap-2" : ""}`}
    >
      <div className={`relative ${dense ? "w-16 shrink-0" : ""}`}>
        <button type="button" onClick={onOpen} className="block w-full" title="Open this mockup">
          <AssetImage
            {...mockupCover(mockup)}
            alt={mockup.title}
            className="aspect-square w-full bg-white/[0.03]"
            fit="contain"
          />
        </button>
        {!dense && (
          <GripVertical className="pointer-events-none absolute left-1 top-1 h-3.5 w-3.5 text-white/35" aria-hidden />
        )}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelect();
          }}
          aria-label={selected ? "Deselect" : "Select"}
          title={selected ? "Deselect" : "Select for a bulk action"}
          className={`absolute left-1 bottom-1 h-4 w-4 rounded-md border transition-colors ${
            selected
              ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent))]"
              : "border-white/45 bg-black/40 hover:border-white"
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5 text-[hsl(var(--ax-on-accent))]" />}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onMenu();
          }}
          aria-label="Mockup actions"
          className="absolute right-1 top-1 rounded-full bg-black/65 p-1 text-white/75 transition-colors hover:text-white"
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>

        {menuOpen && (
          <div className="absolute right-1 top-7 z-30 w-44 overflow-hidden rounded-xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-1 shadow-xl">
            <MenuItem icon={SquarePen} onClick={onOpen}>Open / edit</MenuItem>
            <MenuItem icon={Pencil} onClick={onStartRename}>Rename</MenuItem>
            <MenuItem icon={Copy} onClick={onDuplicate}>Duplicate</MenuItem>
            <MenuItem
              icon={mockup.clientVisible ? EyeOff : Eye}
              onClick={() => onSetShared(!mockup.clientVisible)}
            >
              {mockup.clientVisible ? "Hide from client" : "Share with client"}
            </MenuItem>
            <MenuItem icon={Sparkles} onClick={onTurnIntoAssets}>Turn into Assets</MenuItem>
            <MenuItem
              icon={stage === "archived" ? ArchiveRestore : Archive}
              onClick={() => onSetArchived(stage !== "archived")}
            >
              {stage === "archived" ? "Restore" : "Archive"}
            </MenuItem>
            {onCreateProduct && (
              <MenuItem icon={PackagePlus} onClick={onCreateProduct}>Configure as Product</MenuItem>
            )}
            <MenuItem icon={Trash2} onClick={onDelete} tone="var(--ax-amber)">
              {confirmingDelete ? "Click again to delete" : "Delete"}
            </MenuItem>
          </div>
        )}
      </div>

      <div className={`space-y-1 p-2 ${dense ? "min-w-0 flex-1" : ""}`}>
        {renaming ? (
          <input
            autoFocus
            defaultValue={mockup.title}
            onBlur={(e) => onRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") onCancelRename();
            }}
            className="w-full rounded-md border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-canvas))] px-1.5 py-1 text-[11px] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={onStartRename}
            title="Click to rename"
            className="block w-full truncate text-left text-[12px] font-medium hover:text-[hsl(var(--ax-accent))]"
          >
            {mockup.title}
          </button>
        )}
        <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
          {[mockup.blankName, mockup.colorName].filter(Boolean).join(" · ") || "No blank set"}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Chip tone={LIFECYCLE[stage].tone}>{LIFECYCLE[stage].label}</Chip>
          {mockup.surfaces.length > 0 ? (
            <Chip>{mockup.surfaces.join(" + ")}</Chip>
          ) : (
            <Chip tone="var(--ax-amber)">No artwork</Chip>
          )}
          {mockup.productId && <Chip tone="var(--ax-violet)">Product</Chip>}
          {mockup.clientVisible && (
            <Chip tone="var(--ax-blue)" title="Visible to the athlete or client">
              Shared
            </Chip>
          )}
        </div>
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
  icon: typeof Copy;
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

function FolderCard({
  item,
  merging,
  dragging,
  isOpen,
  onToggle,
  onRename,
}: {
  item: Extract<MockupShelfItem, { kind: "folder" }>;
  merging: boolean;
  dragging: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onRename: () => void;
}) {
  const cover = coverOf(item.folder, item.mockups);
  return (
    <div
      className={[
        "relative rounded-2xl border bg-[hsl(var(--ax-accent)/0.05)] transition-all",
        merging
          ? "border-[hsl(var(--ax-accent))] ring-2 ring-[hsl(var(--ax-accent))]"
          : "border-[hsl(var(--ax-accent)/0.35)] hover:border-[hsl(var(--ax-accent)/0.65)]",
        dragging ? "opacity-40" : "",
        isOpen ? "ring-2 ring-[hsl(var(--ax-accent)/0.55)]" : "",
      ].join(" ")}
    >
      <span
        className="absolute inset-x-4 -top-1.5 h-1.5 rounded-t-lg border border-b-0 border-[hsl(var(--ax-accent)/0.25)] bg-[hsl(var(--ax-accent)/0.07)]"
        aria-hidden
      />
      <span
        className="absolute inset-x-2 -top-0.5 h-1.5 rounded-t-lg border border-b-0 border-[hsl(var(--ax-accent)/0.3)] bg-[hsl(var(--ax-accent)/0.1)]"
        aria-hidden
      />

      <button type="button" onClick={onToggle} className="block w-full text-left">
        <div className="p-2">
          <div className="grid grid-cols-3 gap-1">
            <div className="col-span-2 overflow-hidden rounded-lg">
              <AssetImage
                {...mockupCover(cover ?? {})}
                alt={item.folder.name}
                className="aspect-square w-full bg-white/[0.03]"
                fit="contain"
                fallbackSeed={item.folder.id}
              />
            </div>
            <div className="flex flex-col gap-1">
              {item.mockups.slice(1, 3).map((m) => (
                <div key={m.id} className="overflow-hidden rounded-md">
                  <AssetImage
                    {...mockupCover(m)}
                    alt={m.title}
                    className="aspect-square w-full bg-white/[0.03]"
                    fit="contain"
                  />
                </div>
              ))}
              {item.mockups.length > 3 && (
                <div className="flex flex-1 items-center justify-center rounded-md bg-black/30 text-[11px] font-semibold tabular-nums text-[hsl(var(--ax-secondary))]">
                  +{item.mockups.length - 3}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 pb-2">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-accent))]" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{item.folder.name}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-[hsl(var(--ax-faint))]">{item.mockups.length}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-faint))] transition-transform ${isOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </div>
      </button>

      <div className="flex items-center justify-end border-t border-[hsl(var(--ax-accent)/0.18)] px-2.5 py-1.5">
        <button
          type="button"
          onClick={onRename}
          title="Rename this folder"
          aria-label="Rename this folder"
          className="rounded-md p-1 text-[hsl(var(--ax-faint))] transition-colors hover:bg-white/10 hover:text-[hsl(var(--ax-ink))]"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
