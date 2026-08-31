import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookImage,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderInput,
  Layers,
  Pencil,
  Sparkles,
  FileWarning,
  Ruler,
  Store,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useBlanks,
  useCreateBulkOrder,
  useCreateLookbook,
  useDesigns,
  useDiscountBreaks,
  useLookbooks,
  useMockupActions,
  useMockupForEdit,
  useMockupLibrary,
  useMockupProduction,
  useUpdatePlacementSpec,
  type ProductionPlacement,
} from "@/lib/v2/data";
import { LIFECYCLE, LIFECYCLE_ORDER, canSetManually, toLifecycle, type Lifecycle } from "@/lib/v2/mockup-lifecycle";
import { DEFAULT_SIZES, quoteBulkOrder } from "@/lib/v2/bulk-pricing";
import { downloadBlob, exportFilename, renderMockupJpeg } from "@/lib/v2/mockup-export";
import { resolveBlankImage } from "@/lib/v2/blank-image";
import { audienceForRoles, fmtMoney, priceFor } from "@/lib/v2/pricing";
import type { Entity, Mockup } from "@/lib/v2/types";
import { AssetImage } from "./primitives";
import { ApproximateBadge, GarmentFrame, PlacedOverlay } from "./GarmentPreview";

// A mockup's own page: everything you can do with one, in one place.
//
// The five actions are deliberately different KINDS of thing and are not
// flattened into one row of equal-looking buttons: editing changes the mockup,
// a lookbook files it, assets derive from it, the store sells it, and a bulk
// order commits money against it. They are grouped by consequence, and the two
// that create real commercial records — store and bulk order — say what they
// will do before they do it.
//
// Nothing here turns a mockup into a Product on its own. "Make live" is a door
// into the existing productize flow, not a new one.

type Panel = "lookbook" | "bulk" | "production" | "folder" | null;

export default function MockupDetail({
  mockup,
  entity,
  onClose,
  onEdit,
  onCreateAssets,
  onMakeLive,
  onDeleted,
}: {
  mockup: Mockup;
  entity: Entity;
  onClose: () => void;
  onEdit: () => void;
  onCreateAssets: () => void;
  onMakeLive: () => void;
  onDeleted: () => void;
}) {
  const composition = useMockupForEdit(mockup.id);
  const designsQ = useDesigns(entity.id);
  const blanksQ = useBlanks();
  const actions = useMockupActions(entity.id, entity.organizationId);

  const [surface, setSurface] = useState<"front" | "back">(mockup.surfaces[0] ?? "front");
  const [panel, setPanel] = useState<Panel>(null);
  const [renaming, setRenaming] = useState(false);
  const [exporting, setExporting] = useState(false);

  const lifecycle = toLifecycle(mockup.lifecycle);
  const blank = (blanksQ.data ?? []).find((b) => b.id === mockup.blankId) ?? null;
  const library = useMockupLibrary(entity.id);
  const folderName = library.data?.folders.find((f) => f.id === mockup.folderId)?.name ?? null;

  const designsById = useMemo(() => {
    const m = new Map((designsQ.data ?? []).map((d) => [d.id, d]));
    return m;
  }, [designsQ.data]);

  const placed = (composition.data?.placed ?? []).filter((p) => p.surface === surface);
  const garment = resolveBlankImage({ blank, colorName: mockup.colorName, surface });

  /* ------------------------------------------------------------- export */

  const download = async () => {
    setExporting(true);
    try {
      const { blob, skipped } = await renderMockupJpeg({
        garmentUrl: garment.url,
        placed,
        designsById,
        filename: exportFilename(mockup.title, surface),
      });
      downloadBlob(blob, exportFilename(mockup.title, surface));
      if (skipped > 0) {
        toast.warning(`Downloaded, but ${skipped} artwork file${skipped === 1 ? "" : "s"} could not be read`);
      } else {
        toast.success("Preview downloaded");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export that preview");
    } finally {
      setExporting(false);
    }
  };

  const setLifecycle = (next: Lifecycle) =>
    actions.mutate(
      { type: "set-lifecycle", mockupIds: [mockup.id], lifecycle: next },
      { onError: () => toast.error("Could not change the status") },
    );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="admin-os relative flex h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))] sm:h-[88vh] sm:rounded-2xl">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-[hsl(var(--ax-line))] px-4 py-3">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <input
                autoFocus
                defaultValue={mockup.title}
                onBlur={(e) => {
                  setRenaming(false);
                  const title = e.target.value.trim();
                  if (title && title !== mockup.title) {
                    actions.mutate({ type: "rename", mockupId: mockup.id, title });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="w-full rounded-lg border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-card))] px-2.5 py-1 text-[16px] font-semibold outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="group flex min-w-0 items-center gap-1.5 text-left"
                title="Click to rename"
              >
                <span className="truncate text-[16px] font-semibold">{mockup.title}</span>
                <Pencil className="h-3 w-3 shrink-0 text-[hsl(var(--ax-faint))] opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )}
            <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
              {entity.name} · {[blank?.name, mockup.colorName].filter(Boolean).join(" · ") || "No blank set"}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-touch p-4">
          <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
            {/* ---------------------------------------------------- preview */}
            <div>
              {mockup.surfaces.length > 1 && (
                <div className="mb-2 inline-flex rounded-full border border-[hsl(var(--ax-border))] p-0.5">
                  {mockup.surfaces.map((sf) => (
                    <button
                      key={sf}
                      type="button"
                      onClick={() => setSurface(sf)}
                      className={`rounded-full px-3.5 py-1 text-[12px] font-medium capitalize transition-colors ${
                        surface === sf
                          ? "bg-[hsl(var(--ax-accent)/0.16)] text-[hsl(var(--ax-accent))]"
                          : "text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-secondary))]"
                      }`}
                    >
                      {sf}
                    </button>
                  ))}
                </div>
              )}

              <GarmentFrame
                url={garment.url}
                alt={mockup.title}
                empty="No garment photograph"
                badge={
                  garment.approximate ? (
                    <ApproximateBadge>
                      {garment.source === "blank" ? "Catalogue photo — not this colour" : "Front photo shown"}
                    </ApproximateBadge>
                  ) : undefined
                }
              >
                <PlacedOverlay placed={placed} designsById={designsById} />
                {composition.isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-[12px] text-white/80">
                    Loading composition…
                  </div>
                )}
              </GarmentFrame>

              <div className="mx-auto mt-2 flex max-w-[460px] items-center gap-2">
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))]"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit mockup
                </button>
                <button
                  type="button"
                  onClick={() => void download()}
                  disabled={exporting}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" /> {exporting ? "Rendering…" : "Download preview"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    actions.mutate(
                      { type: "duplicate", mockupId: mockup.id },
                      { onSuccess: () => toast.success("Duplicated") },
                    )
                  }
                  title="Duplicate"
                  aria-label="Duplicate"
                  className="rounded-full border border-[hsl(var(--ax-border))] p-2 text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    actions.mutate(
                      { type: "delete", mockupId: mockup.id },
                      {
                        onSuccess: () => {
                          toast.success("Mockup deleted");
                          onDeleted();
                        },
                      },
                    )
                  }
                  title="Delete"
                  aria-label="Delete"
                  className="ml-auto rounded-full border border-[hsl(var(--ax-border))] p-2 text-[hsl(var(--ax-amber))] hover:brightness-125"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* ---------------------------------------------------- actions */}
            <div className="space-y-4">
              <section>
                <SectionLabel>Status</SectionLabel>
                <div className="grid gap-1">
                  {LIFECYCLE_ORDER.map((stage) => {
                    const active = lifecycle === stage;
                    const settable = canSetManually(stage);
                    return (
                      <button
                        key={stage}
                        type="button"
                        disabled={!settable}
                        onClick={() => setLifecycle(stage)}
                        title={
                          settable
                            ? LIFECYCLE[stage].blurb
                            : "Set automatically when assets are created from this mockup"
                        }
                        className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                          active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                        } ${settable ? "" : "opacity-60"}`}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: `hsl(${LIFECYCLE[stage].tone})` }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-medium">{LIFECYCLE[stage].label}</span>
                          <span className="block truncate text-[10px] text-[hsl(var(--ax-faint))]">
                            {LIFECYCLE[stage].blurb}
                          </span>
                        </span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-accent))]" />}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionLabel>Do something with it</SectionLabel>
                <div className="grid gap-1.5">
                  {/*
                    SHARE is first because it is the only action here that
                    changes who can see the mockup, and "can the client see
                    this?" is the question an operator asks most often.
                  */}
                  <ActionRow
                    icon={mockup.clientVisible ? EyeOff : Eye}
                    title={mockup.clientVisible ? `Hide from ${entity.name}` : `Share with ${entity.name}`}
                    blurb={
                      mockup.clientVisible
                        ? "Marked as theirs. Hiding takes it back to internal."
                        : "Marks it for them. The athlete-facing view is not built yet."
                    }
                    onClick={() =>
                      actions.mutate(
                        { type: "set-client-visible", mockupIds: [mockup.id], visible: !mockup.clientVisible },
                        {
                          onError: (e) =>
                            toast.error(e instanceof Error ? e.message : "Could not change that"),
                          onSuccess: () =>
                            toast.success(mockup.clientVisible ? "Hidden from the client" : "Shared with the client"),
                        },
                      )
                    }
                    active={mockup.clientVisible}
                  />
                  <ActionRow
                    icon={FolderInput}
                    title="Move to a folder"
                    blurb={folderName ? `Currently in “${folderName}”.` : "Loose on the shelf."}
                    onClick={() => setPanel(panel === "folder" ? null : "folder")}
                    active={panel === "folder"}
                  />
                  <ActionRow
                    icon={BookImage}
                    title="Add to a lookbook"
                    blurb="File it in a collection you can send out."
                    onClick={() => setPanel(panel === "lookbook" ? null : "lookbook")}
                    active={panel === "lookbook"}
                  />
                  <ActionRow
                    icon={Sparkles}
                    title="Create social assets"
                    blurb="Stories, promos and graphics from this mockup."
                    onClick={onCreateAssets}
                  />
                  <ActionRow
                    icon={Truck}
                    title="Bulk order"
                    blurb="Quantity pricing with volume discounts."
                    onClick={() => setPanel(panel === "bulk" ? null : "bulk")}
                    active={panel === "bulk"}
                  />
                  <ActionRow
                    icon={Ruler}
                    title="Production spec"
                    blurb="Which artwork files print, and at what size."
                    onClick={() => setPanel(panel === "production" ? null : "production")}
                    active={panel === "production"}
                  />
                  <ActionRow
                    icon={Store}
                    title="Make live on athlete store"
                    blurb={
                      mockup.productId
                        ? "Already configured as a product."
                        : mockup.blankId
                          ? "Configures it as a sellable product first."
                          : "Needs a blank before it can be sold."
                    }
                    onClick={onMakeLive}
                    disabled={!mockup.blankId || Boolean(mockup.productId)}
                  />
                </div>
              </section>

              {panel === "folder" && <FolderPanel mockup={mockup} entity={entity} onDone={() => setPanel(null)} />}

              {panel === "lookbook" && (
                <LookbookPanel mockup={mockup} entity={entity} onDone={() => setPanel(null)} />
              )}

              {panel === "bulk" && <BulkOrderPanel mockup={mockup} entity={entity} onDone={() => setPanel(null)} />}

              {panel === "production" && <ProductionPanel mockup={mockup} />}

              <p className="text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
                A mockup can live here indefinitely. Nothing above is required — it needs no price, no product and
                nothing sent to Shopify to be worth keeping.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
      {children}
    </div>
  );
}

function ActionRow({
  icon: Icon,
  title,
  blurb,
  onClick,
  active,
  disabled,
}: {
  icon: typeof Sparkles;
  title: string;
  blurb: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-45 ${
        active
          ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]"
          : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.5)]"
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--ax-accent))]" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[12px] font-medium">{title}</span>
        <span className="block text-[11px] leading-snug text-[hsl(var(--ax-faint))]">{blurb}</span>
      </span>
      <ArrowUpRight className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-faint))]" aria-hidden />
    </button>
  );
}

/**
 * Filing a mockup from its own page.
 *
 * Moving between folders was only possible in the library — by dragging, or by
 * a bulk-select of one. Which meant closing the thing you were looking at to
 * file the thing you were looking at.
 */
function FolderPanel({ mockup, entity, onDone }: { mockup: Mockup; entity: Entity; onDone: () => void }) {
  const library = useMockupLibrary(entity.id);
  const actions = useMockupActions(entity.id, entity.organizationId);
  const folders = library.data?.folders ?? [];

  const move = (folderId: string | null) => {
    const size = folderId ? (library.data?.mockups.filter((m) => m.folderId === folderId).length ?? 0) : 0;
    actions.mutate(
      folderId
        ? { type: "add-to-folder", folderId, mockupId: mockup.id, sortOrder: size }
        : { type: "remove-from-folder", mockupId: mockup.id, sortOrder: size },
      {
        onError: (e) => toast.error(e instanceof Error ? e.message : "Could not move it"),
        onSuccess: () => {
          toast.success(folderId ? "Moved" : "Back on the shelf");
          onDone();
        },
      },
    );
  };

  return (
    <section className="rounded-xl border border-[hsl(var(--ax-accent)/0.4)] bg-[hsl(var(--ax-accent)/0.05)] p-3">
      <SectionLabel>Move to a folder</SectionLabel>
      {folders.length === 0 ? (
        <p className="text-[11px] text-[hsl(var(--ax-faint))]">
          No folders yet. Drag one mockup onto another in the library to make one.
        </p>
      ) : (
        <div className="grid gap-1">
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={f.id === mockup.folderId}
              onClick={() => move(f.id)}
              className="flex items-center gap-2 rounded-lg border border-[hsl(var(--ax-border))] px-3 py-1.5 text-left text-[12px] transition-colors hover:border-[hsl(var(--ax-accent)/0.6)] disabled:opacity-45"
            >
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              {f.id === mockup.folderId && <Check className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))]" />}
            </button>
          ))}
        </div>
      )}
      {mockup.folderId && (
        <button
          type="button"
          onClick={() => move(null)}
          className="mt-2 text-[11px] text-[hsl(var(--ax-secondary))] underline hover:text-[hsl(var(--ax-ink))]"
        >
          Take it out of the folder
        </button>
      )}
    </section>
  );
}

function LookbookPanel({ mockup, entity, onDone }: { mockup: Mockup; entity: Entity; onDone: () => void }) {
  const lookbooks = useLookbooks(entity.id);
  const create = useCreateLookbook(entity.id, entity.organizationId);
  const actions = useMockupActions(entity.id, entity.organizationId);
  const [name, setName] = useState("");

  const assign = (collectionId: string | null) =>
    actions.mutate(
      { type: "set-collection", mockupIds: [mockup.id], collectionId },
      {
        onError: () => toast.error("Could not file it"),
        onSuccess: () => {
          toast.success(collectionId ? "Added to lookbook" : "Removed from lookbook");
          onDone();
        },
      },
    );

  return (
    <section className="rounded-xl border border-[hsl(var(--ax-accent)/0.35)] bg-[hsl(var(--ax-accent)/0.04)] p-3">
      <SectionLabel>Lookbooks</SectionLabel>
      <div className="grid gap-1">
        {(lookbooks.data ?? []).map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => assign(l.id)}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ${
              mockup.collectionId === l.id ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"
            }`}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-faint))]" />
            <span className="min-w-0 flex-1 truncate">{l.name}</span>
            {l.type !== "lookbook" && (
              <span className="shrink-0 text-[10px] text-[hsl(var(--ax-faint))]">{l.type}</span>
            )}
            {mockup.collectionId === l.id && <Check className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))]" />}
          </button>
        ))}
        {(lookbooks.data ?? []).length === 0 && (
          <p className="px-1 py-1 text-[11px] text-[hsl(var(--ax-faint))]">No lookbooks yet.</p>
        )}
      </div>

      <div className="mt-2 flex gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New lookbook name"
          className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-1.5 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
        />
        <button
          type="button"
          disabled={!name.trim() || create.isPending}
          onClick={async () => {
            try {
              const id = await create.mutateAsync(name);
              setName("");
              assign(id);
            } catch {
              toast.error("Could not create that lookbook");
            }
          }}
          className="shrink-0 rounded-lg border border-[hsl(var(--ax-border))] px-2.5 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] disabled:opacity-40"
        >
          {create.isPending ? "Adding…" : "Create"}
        </button>
      </div>

      {mockup.collectionId && (
        <button
          type="button"
          onClick={() => assign(null)}
          className="mt-2 text-[11px] text-[hsl(var(--ax-faint))] underline hover:text-[hsl(var(--ax-secondary))]"
        >
          Remove from its current lookbook
        </button>
      )}
    </section>
  );
}

function BulkOrderPanel({ mockup, entity, onDone }: { mockup: Mockup; entity: Entity; onDone: () => void }) {
  const blanks = useBlanks();
  const breaks = useDiscountBreaks();
  const create = useCreateBulkOrder(entity.id, entity.organizationId);

  const blank = (blanks.data ?? []).find((b) => b.id === mockup.blankId) ?? null;
  const audience = audienceForRoles(entity.roles);
  const unitRetail = blank ? (priceFor(blank, audience) ?? 0) : 0;

  const sizes = blank && blank.sizes.length > 0 ? blank.sizes : DEFAULT_SIZES;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");

  const lines = sizes.map((size) => ({ size, quantity: qty[size] ?? 0 }));
  const quote = quoteBulkOrder(lines, unitRetail, breaks.data ?? []);

  return (
    <section className="rounded-xl border border-[hsl(var(--ax-accent)/0.35)] bg-[hsl(var(--ax-accent)/0.04)] p-3">
      <SectionLabel>Bulk order</SectionLabel>

      <div className="grid grid-cols-4 gap-1.5">
        {sizes.map((size) => (
          <label key={size} className="block">
            <span className="mb-0.5 block text-[10px] text-[hsl(var(--ax-faint))]">{size}</span>
            <input
              type="number"
              min={0}
              value={qty[size] ?? ""}
              onChange={(e) =>
                setQty((prev) => ({ ...prev, [size]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))
              }
              className="w-full rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2 py-1 text-[12px] tabular-nums outline-none focus:border-[hsl(var(--ax-accent))]"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 space-y-1 rounded-lg bg-black/25 px-3 py-2.5 text-[12px]">
        <Row label="Units" value={String(quote.units)} />
        <Row label={`${audience} price`} value={fmtMoney(quote.unitPrice)} />
        {quote.discountPct > 0 ? (
          <>
            <Row
              label={`Volume discount (${quote.appliedBreak?.minQty}+)`}
              value={`−${quote.discountPct}%`}
              tone="var(--ax-accent)"
            />
            <Row label="Unit price" value={fmtMoney(quote.discountedUnitPrice)} />
          </>
        ) : (
          <Row label="Volume discount" value="none yet" tone="var(--ax-faint)" />
        )}
        <div className="my-1 border-t border-white/10" />
        <Row label="Subtotal" value={fmtMoney(quote.subtotal)} strong />
        {quote.savings > 0 && <Row label="Saving" value={fmtMoney(quote.savings)} tone="var(--ax-accent)" />}
        {quote.nextBreak && (
          <p className="pt-1 text-[11px] text-[hsl(var(--ax-amber))]">
            {quote.nextBreak.unitsAway} more unit{quote.nextBreak.unitsAway === 1 ? "" : "s"} reaches{" "}
            {quote.nextBreak.discountPct}% off.
          </p>
        )}
      </div>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Anything the fulfilment team should know"
        className="mt-2 w-full resize-none rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-2 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
      />

      <button
        type="button"
        disabled={quote.units === 0 || create.isPending || !blank}
        onClick={async () => {
          try {
            await create.mutateAsync({
              mockupId: mockup.id,
              mockupTitle: mockup.title,
              blankId: mockup.blankId,
              colorName: mockup.colorName,
              lines,
              unitWholesale: quote.discountedUnitPrice,
              unitRetail: quote.unitPrice,
              subtotal: quote.subtotal,
              retailEquivalent: quote.retailEquivalent,
              savings: quote.savings,
              notes: notes.trim() || null,
            });
            toast.success(`Bulk order raised — ${quote.units} units`, {
              description: "It appears under Orders as a pending request. Nothing has been charged.",
            });
            onDone();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not raise that order");
          }
        }}
        className="mt-2 w-full rounded-full bg-[hsl(var(--ax-accent))] py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-40"
      >
        {create.isPending ? "Raising…" : `Raise bulk order${quote.units ? ` — ${quote.units} units` : ""}`}
      </button>
      {!blank && (
        <p className="mt-1.5 text-[11px] text-[hsl(var(--ax-amber))]">
          This mockup has no blank, so there is nothing to price.
        </p>
      )}
    </section>
  );
}

/**
 * What actually goes to print.
 *
 * Two facts sit side by side here and they are not the same thing. The
 * percentage is where artwork sits on the PREVIEW; the inches are what the
 * press is told. Nothing derives one from the other, because that conversion
 * would need a calibrated real-world width for every garment photograph and
 * there is no such number — a confidently wrong print size is worse than an
 * empty field.
 *
 * A design with no export file is listed with the gap called out rather than
 * hidden, because that is precisely the mockup that cannot be printed yet.
 */
function ProductionPanel({ mockup }: { mockup: Mockup }) {
  const production = useMockupProduction(mockup.id);
  const update = useUpdatePlacementSpec(mockup.id);
  const rows = production.data ?? [];
  const missing = rows.filter((r) => !r.productionFile).length;

  if (production.isLoading) {
    return (
      <section className="rounded-xl border border-[hsl(var(--ax-accent)/0.35)] bg-[hsl(var(--ax-accent)/0.04)] p-3">
        <SectionLabel>Production spec</SectionLabel>
        <p className="text-[11px] text-[hsl(var(--ax-faint))]">Loading…</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[hsl(var(--ax-accent)/0.35)] bg-[hsl(var(--ax-accent)/0.04)] p-3">
      <SectionLabel>Production spec</SectionLabel>

      {rows.length === 0 && (
        <p className="text-[11px] text-[hsl(var(--ax-faint))]">No artwork placed on this mockup.</p>
      )}

      <div className="grid gap-2">
        {rows.map((r) => (
          <ProductionRow key={r.id} row={r} onSave={(patch) => update.mutate({ placementId: r.id, ...patch })} />
        ))}
      </div>

      {missing > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-[hsl(var(--ax-amber))]">
          <FileWarning className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {missing} of {rows.length} {missing === 1 ? "design has" : "designs have"} no production file. Concept art
          cannot be printed — export a production PNG from the design first.
        </p>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
        Print size is entered, never calculated from the preview. Maximum print area is 16&quot; &times; 20&quot;.
      </p>
    </section>
  );
}

/** Maximum printable width, in inches. Stated on the canvas; checked here. */
const MAX_PRINT_WIDTH_IN = 16;

function ProductionRow({
  row,
  onSave,
}: {
  row: ProductionPlacement;
  onSave: (patch: { printWidthIn?: number | null; notes?: string | null }) => void;
}) {
  const [width, setWidth] = useState(row.printWidthIn == null ? "" : String(row.printWidthIn));
  const [notes, setNotes] = useState(row.notes ?? "");

  const commitWidth = () => {
    const trimmed = width.trim();
    const next = trimmed === "" ? null : Number(trimmed);
    if (next != null && (!Number.isFinite(next) || next <= 0)) {
      setWidth(row.printWidthIn == null ? "" : String(row.printWidthIn));
      return;
    }
    if (next !== row.printWidthIn) onSave({ printWidthIn: next });
  };

  // The 16x20 maximum was stated on the canvas and nowhere enforced or even
  // checked, so a 40" print width saved without comment and turned up at the
  // printer. Still saved — the operator may know something the app does not —
  // but no longer silently.
  const entered = Number(width.trim());
  const overMax = Number.isFinite(entered) && entered > MAX_PRINT_WIDTH_IN;

  return (
    <div className="rounded-lg border border-[hsl(var(--ax-border))] bg-black/20 p-2.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium">{row.designTitle}</span>
        <span className="shrink-0 text-[10px] capitalize text-[hsl(var(--ax-faint))]">{row.surface}</span>
      </div>

      <div className="mt-1 truncate text-[10px]">
        {row.productionFile ? (
          <span className="text-[hsl(var(--ax-accent))]" title={row.productionFile.path}>
            {row.productionFile.name}
          </span>
        ) : (
          <span className="text-[hsl(var(--ax-amber))]">No production file — concept art only</span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] text-[hsl(var(--ax-faint))]">Print width</span>
          <input
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            onBlur={commitWidth}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            inputMode="decimal"
            placeholder="—"
            className="w-16 rounded-md border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-1.5 py-1 text-[11px] tabular-nums outline-none focus:border-[hsl(var(--ax-accent))]"
          />
          <span className="text-[10px] text-[hsl(var(--ax-faint))]">in</span>
        </label>
        <span className="ml-auto text-[10px] text-[hsl(var(--ax-faint))]" title="Where it sits on the preview - not a print size">
          {Math.round(row.widthPct)}% of garment
        </span>
      </div>

      {overMax && (
        <p className="mt-1.5 text-[10px] text-[hsl(var(--ax-amber))]">
          Wider than the {MAX_PRINT_WIDTH_IN}&quot; maximum print area. Saved anyway — but check it with the printer.
        </p>
      )}

      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => {
          const next = notes.trim() || null;
          if (next !== row.notes) onSave({ notes: next });
        }}
        placeholder="Press notes - ink, technique, anything specific"
        className="mt-1.5 w-full rounded-md border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2 py-1 text-[11px] outline-none focus:border-[hsl(var(--ax-accent))]"
      />
    </div>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[hsl(var(--ax-faint))]">{label}</span>
      <span
        className={`tabular-nums ${strong ? "font-semibold" : ""}`}
        style={tone ? { color: `hsl(${tone})` } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
