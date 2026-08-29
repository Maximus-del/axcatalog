import { useEffect, useMemo, useState } from "react";
import { X, Check, ArrowLeft, ChevronDown, FolderOpen, ImageOff, Move, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  useBlanks,
  useCollections,
  useCreateCollection,
  useCreateMockupBatch,
  useDesignShelf,
  useDesigns,
  useMockupForEdit,
  usePrintZones,
  useUpdateMockup,
  useUploadDesign,
} from "@/lib/v2/data";
import { expandVariants, overLimit, unphotographed, variantTitle, MAX_VARIANTS } from "@/lib/v2/variants";
import MockupCanvas, { DEFAULT_GUIDES, DRAG_MIME, type Guides } from "./MockupCanvas";
import {
  boxAtPoint,
  defaultBox,
  fitToZone,
  toRows,
  usedSurfaces,
  type PlacedDesign,
} from "@/lib/v2/placement-geometry";
import { presetById, presetsFor, type PlacementPreset } from "@/lib/v2/placements";
import { buildShelf, coverOf, type ShelfItem } from "@/lib/v2/design-groups";
import { hasBackPhoto, isTwoSided, photoCoverage, resolveBlankImage, swatchFor, type Surface } from "@/lib/v2/blank-image";
import { storeMockupComposite } from "@/lib/v2/mockup-export";
import { audienceForRoles, fmtMoney, hasAccess, priceFor } from "@/lib/v2/pricing";
import { cleanDesignTitle, suggestTitle } from "@/lib/v2/concepts";
import { AssetImage, Chip, Skeleton } from "./primitives";
import type { Blank, Design, Entity } from "@/lib/v2/types";

// CREATE MOCKUP — Design → Blank → Colour → Placement.
//
// "Mockup" is what this is called everywhere an operator or a client can see.
// The object it writes is still a Product Concept (a `mockups` row with
// kind='concept'), and Product Concept and Product remain separate: this flow
// deliberately stops short of creating anything sellable. Nothing here touches
// Shopify, and nothing here consumes inventory.
//
// The whole point is repeatability. Artwork made today should be applyable
// across a dozen blanks and colourways tomorrow in a couple of minutes, so
// every step is one click and the flow remembers what it can.
//
// The reverse direction (Blank → Colour → Design) is kept because it is how the
// same operator thinks on a day when the garment is the starting point.

type Flow = "design_first" | "blank_first";
type Step = "flow" | "design" | "blank" | "color" | "placement" | "confirm";

export default function ConceptBuilder({
  entity,
  onClose,
  onCreated,
  initialFlow,
  initialDesign,
  editMockupId,
}: {
  entity: Entity;
  onClose: () => void;
  onCreated?: (id: string) => void;
  initialFlow?: Flow;
  /** Opened from a design's own page — skip straight to choosing the blank. */
  initialDesign?: Design | null;
  /** Reopening a saved mockup. Everything is loaded and the flow becomes an edit. */
  editMockupId?: string | null;
}) {
  const [flow, setFlow] = useState<Flow | null>(initialFlow ?? (initialDesign ? "design_first" : null));
  const [step, setStep] = useState<Step>(
    initialDesign ? "blank" : initialFlow ? (initialFlow === "design_first" ? "design" : "blank") : "flow",
  );
  const [design, setDesign] = useState<Design | null>(initialDesign ?? null);
  const [blank, setBlank] = useState<Blank | null>(null);
  const [colorName, setColorName] = useState<string | null>(null);
  // Artwork actually placed on the garment, front and back. `design` above stays
  // the concept's headline design (the `design_id` column V1 and the rest of V2
  // already read); this is the full arrangement.
  const [placed, setPlaced] = useState<PlacedDesign[]>([]);
  const [surface, setSurface] = useState<"front" | "back">("front");
  // Alignment lines are per surface — where you want a reference on the chest
  // is not where you want one on the back.
  const [guides, setGuides] = useState<Record<string, Guides>>({
    front: DEFAULT_GUIDES,
    back: DEFAULT_GUIDES,
  });
  const [collectionId, setCollectionId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [scopeAllDesigns, setScopeAllDesigns] = useState(false);
  // The run this mockup will be saved as: extra colourways of the same blank,
  // and other blanks entirely. Empty means "just the one I built".
  const [extraColors, setExtraColors] = useState<string[]>([]);
  const [extraBlanks, setExtraBlanks] = useState<Record<string, string[]>>({});
  const [newCollection, setNewCollection] = useState("");
  const [onlyEligible, setOnlyEligible] = useState(true);

  const designsQ = useDesigns(scopeAllDesigns ? undefined : entity.id);
  const shelfQ = useDesignShelf(entity.id);
  const blanksQ = useBlanks();
  const collectionsQ = useCollections();
  const create = useCreateMockupBatch();
  const update = useUpdateMockup(entity.id);
  const editing = useMockupForEdit(editMockupId ?? undefined);
  const isEdit = Boolean(editMockupId);
  const createCollection = useCreateCollection();
  const upload = useUploadDesign(entity.id, entity.organizationId);

  const audience = audienceForRoles(entity.roles);

  const blanks = useMemo(() => {
    const all = blanksQ.data ?? [];
    const eligible = onlyEligible ? all.filter((b) => hasAccess(b, audience)) : all;
    return [...eligible].sort((a, b) => a.name.localeCompare(b.name));
  }, [blanksQ.data, onlyEligible, audience]);

  const entityCollections = useMemo(
    () => (collectionsQ.data ?? []).filter((c) => c.entityId === entity.id),
    [collectionsQ.data, entity.id],
  );

  const color = blank?.colors.find((c) => c.name === colorName) ?? null;

  // Placement geometry comes from the live `print_zones` rows — the same seven
  // rectangles V1's print-zone editor maintains — merged over the built-in
  // presets. A zone corrected in V1 is corrected here, with no second copy.
  const zonesQ = usePrintZones();
  const presets = useMemo(() => {
    const merged = zonesQ.data;
    if (!merged) return presetsFor(blank?.garmentType);
    const category = presetsFor(blank?.garmentType)[0]?.garmentCategory ?? "apparel";
    return merged.filter((p) => p.garmentCategory === category);
  }, [zonesQ.data, blank?.garmentType]);

  const garmentImage = useMemo(
    () => resolveBlankImage({ blank, colorName, surface: surface as Surface }),
    [blank, colorName, surface],
  );
  const frontImage = useMemo(
    () => resolveBlankImage({ blank, colorName, surface: "front" }),
    [blank, colorName],
  );
  const backImage = useMemo(
    () => resolveBlankImage({ blank, colorName, surface: "back" }),
    [blank, colorName],
  );

  const designsById = useMemo(() => {
    const m = new Map<string, Design>();
    for (const d of designsQ.data ?? []) m.set(d.id, d);
    if (design) m.set(design.id, design);
    for (const d of shelfQ.data?.designs ?? []) m.set(d.id, d);
    return m;
  }, [designsQ.data, design, shelfQ.data]);

  /**
   * Where a click-to-add design lands: centred on the current alignment lines.
   *
   * Print zones used to decide this. The lines are a better answer because they
   * are wherever the operator just put them, so "drop it in the middle" means
   * the middle of what they are working to.
   */
  const dropCentre = () => guides[surface] ?? DEFAULT_GUIDES;

  const variants = useMemo(() => {
    if (!blank) return [];
    const all = blanksQ.data ?? [];
    return expandVariants({
      baseBlank: blank,
      baseColorName: colorName,
      extraColorNames: extraColors,
      extraBlanks: Object.entries(extraBlanks)
        .map(([id, colors]) => ({ blank: all.find((b) => b.id === id), colorNames: colors }))
        .filter((x): x is { blank: Blank; colorNames: string[] } => Boolean(x.blank)),
    });
  }, [blank, colorName, extraColors, extraBlanks, blanksQ.data]);

  const toggleExtraColor = (name: string) =>
    setExtraColors((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));

  const toggleExtraBlank = (id: string) =>
    setExtraBlanks((prev) => {
      const next = { ...prev };
      if (id in next) delete next[id];
      else next[id] = [];
      return next;
    });

  const toggleExtraBlankColor = (id: string, name: string) =>
    setExtraBlanks((prev) => {
      const cur = prev[id] ?? [];
      return { ...prev, [id]: cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name] };
    });

  /** Put a design on the garment. Fits the default chest/back zone when dropped blind. */
  const addPlacement = (designId: string, box: PlacedDesign["box"], zone: { zoneId: string; zoneLabel: string } | null) => {
    setPlaced((prev) => [
      ...prev,
      {
        id: `${designId}-${surface}-${Date.now()}`,
        designId,
        surface,
        box,
        rotation: 0,
        zoneId: zone?.zoneId ?? null,
        zoneLabel: zone?.zoneLabel ?? null,
      },
    ]);
  };

  // Reset the colour when the blank changes; a colour name only means something
  // inside one blank. Placements survive — the artwork arrangement is about the
  // design, not the colourway, and re-placing it after every colour change would
  // defeat the point of trying a design across a range.
  useEffect(() => {
    // Reopening sets the blank and the colour together; clearing here would
    // undo the restored colourway a tick after it was set.
    if (isEdit && hydrated) return;
    setColorName(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blank?.id]);

  /**
   * Reopen: restore the exact composition.
   *
   * Runs once per loaded mockup. Everything the operator arranged — blank,
   * colour, every placement with its geometry, the alignment lines — comes back
   * from the database rather than from defaults, which is the whole point of
   * the persistence work.
   */
  const [hydrated, setHydrated] = useState<string | null>(null);
  useEffect(() => {
    const m = editing.data;
    if (!m || hydrated === m.id) return;
    setHydrated(m.id);
    setTitle(m.title);
    setNotes(m.notes ?? "");
    setCollectionId(m.collectionId ?? "");
    setColorName(m.colorName);
    setPlaced(m.placed);
    if (Object.keys(m.guides).length > 0) {
      setGuides({ front: DEFAULT_GUIDES, back: DEFAULT_GUIDES, ...m.guides });
    }
    const b = (blanksQ.data ?? []).find((x) => x.id === m.blankId) ?? null;
    if (b) setBlank(b);
    setStep("placement");
  }, [editing.data, blanksQ.data, hydrated]);

  // Choosing the headline design seeds a front placement, so the common case —
  // one design, centred on the chest — needs no canvas work at all.
  useEffect(() => {
    if (!design || isEdit) return;
    setPlaced((prev) => (prev.length > 0 ? prev : [{
      id: `${design.id}-front-seed`,
      designId: design.id,
      surface: "front",
      box: defaultBox(1),
      rotation: 0,
      zoneId: null,
      zoneLabel: null,
    }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design?.id]);

  useEffect(() => {
    if (!title) {
      setTitle(
        suggestTitle({
          entityName: entity.name,
          designTitle: design?.title,
          blankName: blank?.name,
          colorName,
        }),
      );
    }
    // Only auto-suggest while the operator has not typed their own title.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design?.id, blank?.id, colorName]);

  const order: Step[] =
    flow === "blank_first"
      ? ["flow", "blank", "color", "design", "placement", "confirm"]
      : ["flow", "design", "blank", "color", "placement", "confirm"];

  const canAdvance =
    (step === "design" && Boolean(design)) ||
    (step === "blank" && Boolean(blank)) ||
    (step === "color" && Boolean(colorName)) ||
    (step === "placement" && placed.length > 0);

  const goNext = () => {
    const i = order.indexOf(step);
    if (i >= 0 && i < order.length - 1) setStep(order[i + 1]);
  };
  const goBack = () => {
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1]);
  };

  const addCollection = async () => {
    const name = newCollection.trim();
    if (!name) return;
    try {
      const id = await createCollection.mutateAsync({
        name,
        entityId: entity.id,
        organizationId: entity.organizationId,
      });
      setCollectionId(id);
      setNewCollection("");
      toast.success(`Collection “${name}” created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create that collection");
    }
  };

  /** Upload artwork and drop it straight onto the back of the garment. */
  const uploadBack = async (file: File) => {
    try {
      const { designId } = await upload.mutateAsync({
        file,
        title: file.name.replace(/\.[^.]+$/, ""),
        // Conservative: an uploaded file is concept art until someone says
        // otherwise. Marking it production-ready would make productionReady lie.
        productionReady: false,
      });
      const backZone = presets.find((p) => p.zoneId === "center_back");
      setPlaced((prev) => [
        ...prev,
        {
          id: `${designId}-back-${Date.now()}`,
          designId,
          surface: "back",
          box: backZone
            ? fitToZone({ zoneId: backZone.zoneId, label: backZone.label, surface: backZone.surface, x: backZone.x, y: backZone.y, w: backZone.w, h: backZone.h }, 1)
            : defaultBox(1),
          rotation: 0,
          zoneId: backZone?.zoneId ?? null,
          zoneLabel: backZone?.label ?? null,
        },
      ]);
      setSurface("back");
      setStep("placement");
      toast.success("Artwork uploaded and placed on the back", {
        description: "Filed as concept art on this entity — mark it production-ready in the design's own page.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload that artwork");
    }
  };

  const submit = async () => {
    if (!design && !blank) return;
    try {
      if (isEdit && editMockupId) {
        const headlineEdit = placed.find((p) => p.surface === "front") ?? placed[0] ?? null;
        await update.mutateAsync({
          mockupId: editMockupId,
          draft: {
            title: title.trim() || "Untitled mockup",
            blankId: blank?.id ?? null,
            colorName,
            collectionId: collectionId || null,
            notes: notes.trim() || null,
            imageUrl: garmentImage.url,
            designId: headlineEdit?.designId ?? design?.id ?? null,
            guides,
          },
          placements: toRows(placed),
        });

        // Re-flatten the preview so the card reflects what was just changed.
        await storeMockupComposite({
          mockupId: editMockupId,
          garmentUrl: frontImage.url,
          placed: placed.filter((p) => p.surface === "front"),
          designsById,
        });

        toast.success("Mockup saved");
        onCreated?.(editMockupId);
        onClose();
        return;
      }

      // The headline placement mirrors onto each mockup row's own columns so V1
      // and every existing V2 read keep working unchanged; the full arrangement
      // lives in product_print_placements.
      const headline = placed.find((p) => p.surface === "front") ?? placed[0] ?? null;
      const rows = toRows(placed);
      const blanksById = new Map((blanksQ.data ?? []).map((b) => [b.id, b]));
      const multipleBlanks = new Set(variants.map((v) => v.blankId)).size > 1;

      const jobs = variants.map((v) => ({
        draft: {
          title: variantTitle(title, v, { multipleBlanks, total: variants.length }),
          entityId: entity.id,
          organizationId: entity.organizationId,
          designId: headline?.designId ?? design?.id ?? null,
          blankId: v.blankId,
          collectionId: collectionId || null,
          colorName: v.colorName,
          surface: headline?.surface ?? null,
          zoneId: headline?.zoneId ?? null,
          placementLabel: headline?.zoneLabel ?? null,
          imageUrl:
            resolveBlankImage({ blank: blanksById.get(v.blankId) ?? null, colorName: v.colorName, surface: "front" })
              .url,
          notes: notes.trim() || null,
          flow: flow ?? "design_first",
          guides,
        },
        placements: rows,
      }));

      const { created, failed } = await create.mutateAsync(jobs);

      // Flatten artwork onto the garment for each one that saved.
      //
      // After the insert, because the mockups bucket authorises an object by
      // resolving its first path folder back to a mockup row. `created` comes
      // back in the same order as `jobs`, which is the order of `variants`, so
      // each composite gets its own colourway's garment shot rather than the
      // one that happened to be on screen.
      const frontPlacements = placed.filter((p) => p.surface === "front");
      await Promise.all(
        created.map((id, i) => {
          const v = variants[i];
          if (!v) return Promise.resolve(null);
          const image = resolveBlankImage({
            blank: blanksById.get(v.blankId) ?? null,
            colorName: v.colorName,
            surface: "front",
          });
          return storeMockupComposite({
            mockupId: id,
            garmentUrl: image.url,
            placed: frontPlacements,
            designsById,
          });
        }),
      );

      if (created.length > 0) {
        toast.success(
          created.length === 1 ? "Mockup created" : `${created.length} mockups created`,
          {
            description:
              failed.length > 0
                ? `${failed.length} could not be saved: ${failed.slice(0, 3).join(", ")}`
                : "Saved as product concepts. No products were created and nothing was sent to Shopify.",
          },
        );
      } else {
        toast.error("Nothing could be saved");
        return;
      }
      onCreated?.(created[0]);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the concept");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="admin-os relative flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))] sm:h-[86vh] sm:rounded-2xl">
        {/* header */}
        <div className="flex items-center gap-3 border-b border-[hsl(var(--ax-line))] px-4 py-3">
          {step !== "flow" && (
            <button type="button" onClick={goBack} className="rounded-lg p-1.5 hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{isEdit ? "Edit mockup" : "Create mockup"}</div>
            <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
              {entity.name} · {audience} catalog
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* trail */}
        {step !== "flow" && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-[hsl(var(--ax-line))] px-4 py-2 text-[11px]">
            {order.slice(1, -1).map((s) => {
              const done =
                (s === "design" && design) ||
                (s === "blank" && blank) ||
                (s === "color" && colorName) ||
                (s === "placement" && placed.length > 0);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStep(s)}
                  className={`rounded-full px-2.5 py-1 capitalize transition-colors ${
                    step === s
                      ? "bg-[hsl(var(--ax-accent)/0.16)] text-[hsl(var(--ax-accent))]"
                      : done
                        ? "text-[hsl(var(--ax-ink))] hover:bg-white/5"
                        : "text-[hsl(var(--ax-faint))] hover:bg-white/5"
                  }`}
                >
                  {done && <Check className="mr-1 inline h-3 w-3" />}
                  {s === "color" ? "colour" : s}
                </button>
              );
            })}
          </div>
        )}

        {/* body */}
        <div className="min-h-0 flex-1 overflow-y-auto scroll-touch p-4">
          {step === "flow" && (
            <div className="mx-auto grid max-w-2xl gap-3 py-6">
              <FlowCard
                title="Start from a design"
                blurb="Pick existing artwork, then choose what it goes on."
                onClick={() => {
                  setFlow("design_first");
                  setStep("design");
                }}
              />
              <FlowCard
                title="Start from a blank"
                blurb="Pick the garment and colour first, then drop artwork on it."
                onClick={() => {
                  setFlow("blank_first");
                  setStep("blank");
                }}
              />
              <div className="ax-card flex items-start gap-3 px-4 py-3.5 opacity-60">
                <Upload className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="text-[13px]">
                  <div className="font-medium">Upload my own design</div>
                  <div className="text-[12px] text-[hsl(var(--ax-faint))]">
                    Not wired in this first pass — upload through the V1 Designs page, then it appears here.
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "design" && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip active={!scopeAllDesigns} onClick={() => setScopeAllDesigns(false)}>
                  {entity.name}
                </Chip>
                <Chip active={scopeAllDesigns} onClick={() => setScopeAllDesigns(true)}>
                  All designs
                </Chip>
                <span className="text-[11px] text-[hsl(var(--ax-faint))]">
                  A design is reusable across any blank.
                </span>
              </div>
              {scopeAllDesigns ? (
                designsQ.isLoading ? (
                  <GridSkeleton />
                ) : (
                  <FlatDesignGrid
                    designs={designsQ.data ?? []}
                    selectedId={design?.id ?? null}
                    onPick={(d) => {
                      setDesign(d);
                      goNext();
                    }}
                  />
                )
              ) : (
                <GroupedDesignPicker
                  entityId={entity.id}
                  selectedId={design?.id ?? null}
                  onPick={(d) => {
                    setDesign(d);
                    goNext();
                  }}
                />
              )}
            </>
          )}

          {step === "blank" && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip active={onlyEligible} onClick={() => setOnlyEligible(true)}>
                  {audience} catalog
                </Chip>
                <Chip active={!onlyEligible} onClick={() => setOnlyEligible(false)}>
                  Every blank
                </Chip>
                <span className="text-[11px] text-[hsl(var(--ax-faint))]">
                  Access is an assortment question; price is a separate one.
                </span>
              </div>
              {blanksQ.isLoading ? (
                <GridSkeleton />
              ) : blanks.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-[hsl(var(--ax-faint))]">
                  Nothing in the {audience} catalog yet. Switch to “Every blank”, or add this blank to an assortment.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {blanks.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        setBlank(b);
                        goNext();
                      }}
                      className={`ax-card ax-card-hover overflow-hidden p-0 text-left transition-all ${
                        blank?.id === b.id ? "ring-2 ring-[hsl(var(--ax-accent))]" : ""
                      }`}
                    >
                      <BlankCard blank={b} price={fmtMoney(priceFor(b, audience))} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "color" && blank && (
            <>
              <ColorStepHeader blank={blank} />
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6 lg:grid-cols-8">
                {blank.colors
                  // Only colours the supplier actually has. Building a mockup on
                  // a discontinued colourway wastes the operator's time and the
                  // client's, and the availability flag already exists.
                  .filter((c) => c.available)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setColorName(c.name);
                        goNext();
                      }}
                      title={c.imageUrl ? c.name : `${c.name} — no photography yet`}
                      className={`ax-card ax-card-hover overflow-hidden p-0 text-left transition-all ${
                        colorName === c.name ? "ring-2 ring-[hsl(var(--ax-accent))]" : ""
                      }`}
                    >
                      <div className="relative">
                        {c.imageUrl ? (
                          <AssetImage url={c.imageUrl} alt={c.name} className="aspect-square w-full bg-white/[0.03]" fit="contain" />
                        ) : (
                          <div
                            className="flex aspect-square w-full items-end justify-end p-1"
                            style={{ background: swatchFor(c) }}
                          >
                            <ImageOff className="h-3 w-3 text-black/45" aria-hidden />
                          </div>
                        )}
                        {colorName === c.name && (
                          <span className="absolute left-1 top-1 rounded-full bg-[hsl(var(--ax-accent))] p-0.5 text-[hsl(var(--ax-on-accent))]">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                      <div className="truncate p-1.5 text-[10px]">{c.name}</div>
                    </button>
                  ))}
              </div>
              {blank.colors.length === 0 && (
                <p className="py-10 text-center text-[13px] text-[hsl(var(--ax-faint))]">
                  This blank has no colour records yet. You can still create the concept without one.
                </p>
              )}
            </>
          )}

          {step === "placement" && (
            <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
              <MockupDesignRail
                entityId={entity.id}
                onQuickAdd={(d) => {
                  const at = dropCentre();
                  addPlacement(d.id, boxAtPoint(at.x, at.y, 1), null);
                }}
              />

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-full border border-[hsl(var(--ax-border))] p-0.5">
                    {(["front", "back"] as const).map((sf) => {
                      const count = placed.filter((p) => p.surface === sf).length;
                      // resolveBlankImage falls back to the front when a back
                      // shot is missing, so asking it whether the back "has an
                      // image" always said yes and this warning never fired.
                      // Ask the photography directly instead.
                      const hasPhoto =
                        sf === "front" ? Boolean(frontImage.url) : hasBackPhoto(blank, colorName);
                      return (
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
                          {count > 0 && <span className="ml-1 tabular-nums opacity-80">{count}</span>}
                          {!hasPhoto && (
                            <span
                              className="ml-1 text-[hsl(var(--ax-amber))]"
                              title={`No ${sf} photograph for ${colorName ?? "this blank"} — placement still saves`}
                            >
                              •
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-[hsl(var(--ax-faint))]">
                    Drag artwork onto the garment. Front and back are placed separately — a front-only design saves a
                    front-only mockup.
                    {blank && isTwoSided(blank.garmentType) && !hasBackPhoto(blank, colorName) && (
                      <span className="ml-1 text-[hsl(var(--ax-amber))]">
                        No back photograph for this colourway yet, so the back view shows the front.
                      </span>
                    )}
                  </span>
                </div>

                <MockupCanvas
                  garmentUrl={garmentImage.url}
                  garmentLabel={`${blank?.name ?? "Blank"} ${surface}`}
                  approximate={garmentImage.approximate}
                  approximateNote={
                    garmentImage.source === "blank" ? "Catalogue photo — not this colour" : "Front photo shown"
                  }
                  placed={placed}
                  designsById={designsById}
                  surface={surface}
                  guides={guides[surface] ?? DEFAULT_GUIDES}
                  onGuidesChange={(next) => setGuides((prev) => ({ ...prev, [surface]: next }))}
                  onChange={setPlaced}
                  onDropDesign={(designId, x, y, aspect) =>
                    addPlacement(designId, boxAtPoint(x, y, aspect), null)
                  }
                />
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <div className="space-y-3">
                {usedSurfaces(placed).map((sf) => (
                  <div key={sf}>
                    <div className="mb-1.5 flex items-baseline gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                        {sf}
                      </span>
                      <span className="text-[11px] text-[hsl(var(--ax-faint))]">
                        {placed.filter((p) => p.surface === sf).length} placement
                        {placed.filter((p) => p.surface === sf).length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <StaticMockup
                      image={sf === "front" ? frontImage : backImage}
                      placed={placed.filter((p) => p.surface === sf)}
                      designsById={designsById}
                      blankName={blank?.name ?? "Blank"}
                      onEdit={() => {
                        setSurface(sf);
                        setStep("placement");
                      }}
                    />
                  </div>
                ))}
                {placed.length === 0 && (
                  <p className="py-8 text-center text-[13px] text-[hsl(var(--ax-faint))]">
                    No artwork placed yet.
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                    Name
                  </span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                    Collection <span className="normal-case tracking-normal text-[hsl(var(--ax-faint))]">(optional)</span>
                  </span>
                  <select
                    value={collectionId}
                    onChange={(e) => setCollectionId(e.target.value)}
                    className="w-full rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
                  >
                    <option value="">No collection yet</option>
                    {entityCollections.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1.5 flex gap-1.5">
                    <input
                      value={newCollection}
                      onChange={(e) => setNewCollection(e.target.value)}
                      placeholder="…or type a new collection name"
                      className="min-w-0 flex-1 rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-1.5 text-[12px] outline-none focus:border-[hsl(var(--ax-accent))]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void addCollection();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void addCollection()}
                      disabled={!newCollection.trim() || createCollection.isPending}
                      className="shrink-0 rounded-lg border border-[hsl(var(--ax-border))] px-2.5 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] disabled:opacity-40"
                    >
                      {createCollection.isPending ? "Adding…" : "Add"}
                    </button>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                    Notes
                  </span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
                  />
                </label>

                <div className="ax-card space-y-1.5 px-3 py-2.5 text-[12px]">
                  <Line label="Entity" value={entity.name} />
                  <Line label="Design" value={design ? cleanDesignTitle(design.title) ?? design.title : "—"} />
                  <Line label="Blank" value={blank?.name ?? "—"} />
                  <Line label="Colour" value={colorName ?? "—"} />
                  <Line
                    label="Placement"
                    value={
                      placed.length === 0
                        ? "—"
                        : placed
                            .map((p) => `${p.surface} · ${p.zoneLabel ?? "free placement"}`)
                            .join(", ")
                    }
                  />
                  <Line
                    label={`${audience} price`}
                    value={blank ? fmtMoney(priceFor(blank, audience)) : "—"}
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
                  A concept needs no Shopify product, variants, inventory or final pricing. Those come later, and the
                  concept keeps its link to everything it was built from.
                </p>
              </div>
            </div>

            {/* ---------------------------------------------- add a back */}
            {!placed.some((p) => p.surface === "back") && (
              <section className="rounded-2xl border border-[hsl(var(--ax-border))] p-4">
                <h3 className="text-[13px] font-semibold">Add a back</h3>
                <p className="mt-0.5 max-w-[62ch] text-[12px] text-[hsl(var(--ax-faint))]">
                  This mockup is front-only, which is a perfectly good place to stop. If it needs a back hit, put
                  artwork on the back and this becomes a two-sided mockup.
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSurface("back");
                      setStep("placement");
                    }}
                    className="rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
                  >
                    Pick from existing designs
                  </button>
                  <label className="cursor-pointer rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]">
                    {upload.isPending ? "Uploading…" : "Upload artwork"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={upload.isPending}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void uploadBack(file);
                      }}
                    />
                  </label>
                  {!backImage.url && (
                    <span className="text-[11px] text-[hsl(var(--ax-amber))]">
                      This colourway has no back photograph — the placement still saves.
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* ------------------------------------------- make it a run */}
            {blank && (
              <section className="rounded-2xl border border-[hsl(var(--ax-border))] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-semibold">Make it in more colours, or on more blanks</h3>
                  <span className="text-[12px] tabular-nums text-[hsl(var(--ax-secondary))]">
                    {variants.length} mockup{variants.length === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-0.5 max-w-[70ch] text-[12px] text-[hsl(var(--ax-faint))]">
                  Every one is saved with this exact arrangement. Placement is stored as a percentage of the garment, so
                  a chest hit lands on the chest whether it is a tee or a hoodie.
                </p>

                <div className="mt-3">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                    More colourways of {blank.name}
                  </div>
                  <ColorChips
                    blank={blank}
                    selected={extraColors}
                    baseColorName={colorName}
                    onToggle={toggleExtraColor}
                  />
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                    Other blanks
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {blanks
                      .filter((b) => b.id !== blank.id)
                      .slice(0, 12)
                      .map((b) => (
                        <OtherBlankRow
                          key={b.id}
                          blank={b}
                          selected={b.id in extraBlanks}
                          colors={extraBlanks[b.id] ?? []}
                          onToggle={() => toggleExtraBlank(b.id)}
                          onToggleColor={(name) => toggleExtraBlankColor(b.id, name)}
                        />
                      ))}
                  </div>
                </div>

                {unphotographed(variants).length > 0 && (
                  <p className="mt-3 text-[11px] text-[hsl(var(--ax-amber))]">
                    {unphotographed(variants).length} of these have no photograph — those mockups save their placement
                    but will not have a garment image to show.
                  </p>
                )}
                {overLimit(variants.length) && (
                  <p className="mt-3 text-[11px] font-medium text-[hsl(var(--ax-amber))]">
                    That is {variants.length} mockups. The cap is {MAX_VARIANTS} in one go — trim the selection.
                  </p>
                )}
              </section>
            )}
            </div>
          )}
        </div>

        {/* footer */}
        {step !== "flow" && (
          <div className="flex items-center gap-3 border-t border-[hsl(var(--ax-line))] px-4 py-3">
            <div className="min-w-0 flex-1 truncate text-[12px] text-[hsl(var(--ax-faint))]">
              {[
                design && (cleanDesignTitle(design.title) ?? "Design"),
                blank?.name,
                colorName,
                placed.length > 0 ? `${placed.length} placement${placed.length === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join("  ·  ") || "Nothing chosen yet"}
            </div>
            {step === "confirm" ? (
              <button
                type="button"
                onClick={submit}
                disabled={create.isPending || update.isPending || (!design && !blank) || (!isEdit && overLimit(variants.length))}
                className="rounded-full bg-[hsl(var(--ax-accent))] px-5 py-2 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50"
              >
                {isEdit
                  ? update.isPending
                    ? "Saving…"
                    : "Save mockup"
                  : create.isPending
                    ? "Creating…"
                    : variants.length > 1
                      ? `Create ${variants.length} mockups`
                      : "Create mockup"}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={!canAdvance}
                className="rounded-full bg-[hsl(var(--ax-accent))] px-5 py-2 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-40"
              >
                Continue
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- parts */

function FlowCard({ title, blurb, onClick }: { title: string; blurb: string; onClick: () => void }) {
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
function GroupedDesignPicker({
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

function BandLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ax-secondary))]">
      {children}
    </div>
  );
}

function FlatDesignGrid({
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

/**
 * Step 2. Blanks are shared AX infrastructure — one canonical record per
 * garment, never a per-athlete duplicate — so the card leads with photography
 * and the colour range, which is what an operator is actually choosing between.
 */
function BlankCard({ blank, price }: { blank: Blank; price: string }) {
  const hero = resolveBlankImage({ blank });
  const coverage = photoCoverage(blank);
  const strip = blank.colors.filter((c) => c.available).slice(0, 9);

  return (
    <>
      <AssetImage url={hero.url} alt={blank.name} className="aspect-square w-full bg-white/[0.03]" fit="contain" />
      <div className="space-y-1.5 p-2.5">
        <div className="truncate text-[12px] font-medium">{blank.name}</div>
        <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
          {[blank.brand, blank.styleNumber].filter(Boolean).join(" · ") || "—"}
        </div>
        <div className="flex items-center gap-0.5">
          {strip.map((c) => (
            <span
              key={c.id}
              title={c.name}
              className="h-3 w-3 rounded-full border border-black/25"
              style={{ background: swatchFor(c) }}
            />
          ))}
          {coverage.total > strip.length && (
            <span className="ml-1 text-[10px] tabular-nums text-[hsl(var(--ax-faint))]">
              +{coverage.total - strip.length}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-medium text-[hsl(var(--ax-accent))]">{price}</span>
          <span
            className="text-[hsl(var(--ax-faint))]"
            title={`${coverage.withPhoto} of ${coverage.total} available colours have photography`}
          >
            {coverage.withPhoto}/{coverage.total} shot
          </span>
        </div>
      </div>
    </>
  );
}

function ColorStepHeader({ blank }: { blank: Blank }) {
  const coverage = photoCoverage(blank);
  const unshot = coverage.total - coverage.withPhoto;
  return (
    <div className="mb-3 space-y-1">
      <p className="text-[12px] text-[hsl(var(--ax-faint))]">
        {coverage.total} available colour{coverage.total === 1 ? "" : "s"} on {blank.name}.
      </p>
      {unshot > 0 && (
        <p className="text-[11px] text-[hsl(var(--ax-amber))]">
          {unshot} {unshot === 1 ? "has" : "have"} no photography yet and show as a flat swatch — still selectable, but
          the mockup preview will use the catalogue shot.
        </p>
      )}
    </div>
  );
}

/**
 * The artwork rail beside the canvas.
 *
 * Folders are the organising unit here exactly as they are on the shelf, so a
 * set of variations stays together while the operator tries them one after
 * another. Tiles are HTML5 drag sources — drag onto the garment to place at a
 * point, or click to drop into the centre zone for the surface being edited.
 */
/**
 * Colourway multi-select for building a run.
 *
 * The base colour is shown but locked — it is already in the batch, and letting
 * it be "deselected" would imply the mockup on screen could be excluded from
 * its own save.
 */
function ColorChips({
  blank,
  selected,
  baseColorName,
  onToggle,
}: {
  blank: Blank;
  selected: string[];
  baseColorName: string | null;
  onToggle: (name: string) => void;
}) {
  const available = blank.colors.filter((c) => c.available);
  if (available.length === 0) {
    return <p className="text-[12px] text-[hsl(var(--ax-faint))]">This blank has no colour records.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {available.map((c) => {
        const isBase = c.name === baseColorName;
        const on = isBase || selected.includes(c.name);
        return (
          <button
            key={c.id}
            type="button"
            disabled={isBase}
            onClick={() => onToggle(c.name)}
            title={isBase ? `${c.name} — the colourway you built` : c.name}
            className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] transition-colors ${
              on
                ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-accent))]"
                : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
            } ${isBase ? "opacity-70" : ""}`}
          >
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/25"
              style={{ background: swatchFor(c) }}
            />
            {c.name}
            {isBase && <span className="text-[9px] uppercase tracking-wider opacity-70">base</span>}
            {!c.imageUrl && <ImageOff className="h-2.5 w-2.5 opacity-60" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** One other blank in the run, with its own colour selection once ticked. */
function OtherBlankRow({
  blank,
  selected,
  colors,
  onToggle,
  onToggleColor,
}: {
  blank: Blank;
  selected: boolean;
  colors: string[];
  onToggle: () => void;
  onToggleColor: (name: string) => void;
}) {
  const hero = resolveBlankImage({ blank });
  return (
    <div
      className={`rounded-xl border p-2 transition-colors ${
        selected ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.05)]" : "border-[hsl(var(--ax-border))]"
      }`}
    >
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 text-left">
        <AssetImage
          url={hero.url}
          alt={blank.name}
          className="h-9 w-9 shrink-0 rounded-lg bg-white/[0.04]"
          fit="contain"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium">{blank.name}</span>
          <span className="block truncate text-[10px] text-[hsl(var(--ax-faint))]">
            {[blank.brand, blank.styleNumber].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
        <span
          className={`h-4 w-4 shrink-0 rounded-md border ${
            selected ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent))]" : "border-[hsl(var(--ax-border))]"
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5 text-[hsl(var(--ax-on-accent))]" />}
        </span>
      </button>

      {selected && (
        <div className="mt-2 border-t border-[hsl(var(--ax-accent)/0.2)] pt-2">
          <div className="mb-1 text-[10px] text-[hsl(var(--ax-faint))]">
            {colors.length === 0 ? "No colour chosen — saves one mockup" : `${colors.length} colourway${colors.length === 1 ? "" : "s"}`}
          </div>
          <div className="flex flex-wrap gap-1">
            {blank.colors
              .filter((c) => c.available)
              .slice(0, 10)
              .map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onToggleColor(c.name)}
                  title={c.name}
                  className={`h-4 w-4 rounded-full border transition-transform ${
                    colors.includes(c.name)
                      ? "border-[hsl(var(--ax-accent))] scale-110 ring-1 ring-[hsl(var(--ax-accent))]"
                      : "border-black/25 hover:scale-110"
                  }`}
                  style={{ background: swatchFor(c) }}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MockupDesignRail({ entityId, onQuickAdd }: { entityId: string; onQuickAdd: (d: Design) => void }) {
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

function RailTile({ design, onQuickAdd }: { design: Design; onQuickAdd: (d: Design) => void }) {
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
function StaticMockup({
  image,
  placed,
  designsById,
  blankName,
  onEdit,
}: {
  image: ReturnType<typeof resolveBlankImage>;
  placed: PlacedDesign[];
  designsById: Map<string, Design>;
  blankName: string;
  /**
   * Back to the canvas, on this surface.
   *
   * Reviewing is when you notice the logo sits 3% low, so the fix has to be
   * reachable from the thing you noticed it on. Making the preview itself the
   * way back beats asking the operator to find a step chip in the header.
   */
  onEdit?: () => void;
}) {
  return (
    <div className="group relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.04]">
      {image.url ? (
        <img src={image.url} alt={blankName} className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-[hsl(var(--ax-faint))]">
          No photograph for this side yet — the placement is saved regardless.
        </div>
      )}
      {placed.map((p) => {
        const d = designsById.get(p.designId);
        return (
          <div
            key={p.id}
            className="pointer-events-none absolute"
            style={{
              left: `${p.box.x}%`,
              top: `${p.box.y}%`,
              width: `${p.box.w}%`,
              height: `${p.box.h}%`,
              transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
            }}
          >
            <AssetImage
              bucket={d?.fileBucket}
              path={d?.filePath}
              alt={d?.title ?? "Artwork"}
              className="h-full w-full"
              fit="contain"
            />
          </div>
        );
      })}
      {image.approximate && image.url && (
        <span className="absolute right-2 top-2 rounded-full bg-[hsl(var(--ax-amber)/0.92)] px-2 py-1 text-[10px] font-semibold text-black">
          {image.source === "blank" ? "Catalogue photo — not this colour" : "Front photo shown"}
        </span>
      )}

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute inset-0 flex items-end justify-center bg-black/0 pb-4 opacity-0 transition-all hover:bg-black/25 focus:opacity-100 group-hover:opacity-100"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] shadow-lg">
            <Move className="h-3.5 w-3.5" />
            Adjust placement
          </span>
        </button>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-[hsl(var(--ax-faint))]">{label}</span>
      <span className="min-w-0 flex-1 truncate">{value}</span>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square" />
      ))}
    </div>
  );
}
