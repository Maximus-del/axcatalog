import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Check,
  Copy,
  FolderOpen,
  FolderPlus,
  GripVertical,
  LayoutGrid,
  List,
  MoreHorizontal,
  PackagePlus,
  Pencil,
  Search,
  Sparkles,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useMockupActions, useMockupLibrary } from "@/lib/v2/data";
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
import { AssetImage, Chip, EmptyState, Skeleton } from "./primitives";

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
  onOpen,
  onTurnIntoAssets,
  onCreateProduct,
}: {
  entityId: string;
  organizationId: string;
  onOpen: (mockup: Mockup) => void;
  onTurnIntoAssets: (mockup: Mockup) => void;
  /**
   * The existing V1-era productize flow. Kept reachable rather than rebuilt —
   * a mockup still never becomes a product on its own, this is just the door.
   */
  onCreateProduct: (mockup: Mockup) => void;
}) {
  const { data, isLoading } = useMockupLibrary(entityId);
  const actions = useMockupActions(entityId, organizationId);

  const [query, setQuery] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [hint, setHint] = useState<{ key: string; zone: "before" | "onto" } | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renamingMockup, setRenamingMockup] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<MockupShelfItem[] | null>(null);
  const [draggingMember, setDraggingMember] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Lifecycle | "all">("all");
  const [folderFilter, setFolderFilter] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  // Multi-select for bulk moves and status changes. Empty means single-item mode.
  const [selected, setSelected] = useState<string[]>([]);

  const serverItems = useMemo(() => {
    if (!data) return [];
    // Status is a property of the mockup, so it filters the mockups BEFORE the
    // shelf is built — otherwise a folder whose members are all archived would
    // still render as an empty folder.
    const mockups = applyLifecycleFilter(data.mockups, statusFilter);
    const folders =
      folderFilter === "all" ? data.folders : data.folders.filter((f) => f.id === folderFilter);
    const scoped = folderFilter === "all" ? mockups : mockups.filter((m) => m.folderId === folderFilter);
    return buildMockupShelf(scoped, folders);
  }, [data, statusFilter, folderFilter]);

  const counts = useMemo(() => countByLifecycle(data?.mockups ?? []), [data]);

  useEffect(() => setOptimistic(null), [data]);

  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
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

  const remove = (mockup: Mockup) => {
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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search mockups, blanks, colours…"
            className="w-full rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] py-1.5 pl-8 pr-3 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
          />
        </label>
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

        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Name the folder");
            if (!name?.trim()) return;
            actions.mutate(
              { type: "new-folder", name: name.trim(), sortOrder: (data?.folders.length ?? 0) },
              { onError: () => fail("Could not create that folder") },
            );
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
        >
          <FolderPlus className="h-3.5 w-3.5" /> New folder
        </button>
      </div>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)] px-3 py-2">
          <span className="text-[12px] font-medium text-[hsl(var(--ax-accent))]">
            {selected.length} selected
          </span>
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
              Promise.all(
                selected.map((id, i) =>
                  new Promise<void>((resolve) =>
                    actions.mutate(
                      { type: "add-to-folder", folderId: v, mockupId: id, sortOrder: size + i },
                      { onSettled: () => resolve() },
                    ),
                  ),
                ),
              ).then(() => {
                toast.success(`${selected.length} moved`);
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
                actions.mutate({
                  type: "ungroup",
                  folderId: open.key,
                  mockupIds: open.mockups.map((m) => m.id),
                  baseSortOrder: items.length,
                });
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
            Drag to reorder — the first mockup is the folder cover. Drag one out, or use its menu, to return it to the
            shelf.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {open.mockups.map((m, i) => (
              <div
                key={m.id}
                className="relative"
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
                {i === 0 && (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[hsl(var(--ax-on-accent))]">
                    cover
                  </span>
                )}
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
            url={mockup.imageUrl}
            bucket={mockup.imageBucket}
            path={mockup.imagePath}
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
            <MenuItem icon={Sparkles} onClick={onTurnIntoAssets}>Turn into Assets</MenuItem>
            {onCreateProduct && (
              <MenuItem icon={PackagePlus} onClick={onCreateProduct}>Configure as Product</MenuItem>
            )}
            <MenuItem icon={Trash2} onClick={onDelete} tone="var(--ax-amber)">Delete</MenuItem>
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
                url={cover?.imageUrl}
                bucket={cover?.imageBucket}
                path={cover?.imagePath}
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
                    url={m.imageUrl}
                    bucket={m.imageBucket}
                    path={m.imagePath}
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
