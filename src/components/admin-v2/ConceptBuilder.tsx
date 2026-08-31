import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { X, Check, ArrowLeft, ChevronDown, FolderOpen, ImageOff, Move, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  useBlanks,
  useCollections,
  useCreateCollection,
  useCreateMockupBatch,
  useDesignShelf,
  useDesigns,
  useMockupForEdit,
  useUpdateMockup,
  useUploadDesign,
} from "@/lib/v2/data";
import { expandVariants, overLimit, unphotographed, variantTitle, MAX_VARIANTS } from "@/lib/v2/variants";
import MockupCanvas from "./MockupCanvas";
import {
  DEFAULT_GUIDES,
  DRAG_MIME,
  boxCentredAt,
  toRows,
  usedSurfaces,
  type Guides,
  type PlacedDesign,
} from "@/lib/v2/placement-geometry";
import { defaultsFor, startGuidesBoth, startPoint } from "@/lib/v2/garment-placement";
import { buildShelf, coverOf, type ShelfItem } from "@/lib/v2/design-groups";
import { hasBackPhoto, isTwoSided, photoCoverage, resolveBlankImage, swatchFor, type Surface } from "@/lib/v2/blank-image";
import { storeMockupComposite } from "@/lib/v2/mockup-export";
import { audienceForRoles, fmtMoney, hasAccess, priceFor } from "@/lib/v2/pricing";
import { cleanDesignTitle, suggestTitle } from "@/lib/v2/concepts";
import {
  BUILDER_STEPS,
  DRAFT_VERSION,
  clearDraft,
  describeAge,
  loadDraft,
  saveDraft,
  type BuilderFlow,
  type BuilderStep,
  type MockupDraft,
} from "@/lib/v2/mockup-draft";
import { AssetImage, Chip, Skeleton } from "./primitives";
import { FlatDesignGrid, FlowCard, GridSkeleton, GroupedDesignPicker } from "./builder/DesignStep";
import { BlankCard, ColorChips, ColorStepHeader, OtherBlankRow } from "./builder/BlankStep";
import { MockupDesignRail } from "./builder/PlacementAside";
import { ColorwayStrip, Line, StaticMockup } from "./builder/ReviewStep";
import { ApproximateBadge, GarmentFrame, PlacedOverlay } from "./GarmentPreview";
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

type Flow = BuilderFlow;
type Step = BuilderStep;

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
  const isEdit = Boolean(editMockupId);

  /*
    UNSAVED WORK SURVIVES A REFRESH.

    Read once, synchronously, before any state is initialised — so the wizard
    comes up already holding what was there rather than flickering through an
    empty one. Editing a saved mockup never restores: that row is the truth.
    See mockup-draft.ts for why this is local storage and not a table.
  */
  const [restored] = useState<MockupDraft | null>(() => (editMockupId ? null : loadDraft(entity.id)));
  const [showRestored, setShowRestored] = useState(Boolean(restored));

  /*
    WHICH STEP, IN THE ADDRESS BAR.

    A refresh mid-placement used to reopen on step one even with the work
    intact. `?step=` is written with replace, so the wizard does not fill the
    history stack — Back still closes the builder, which is what Back means
    here.
  */
  const [params, setParams] = useSearchParams();
  const stepParam = params.get("step");
  const initialStep: Step = restored
    ? restored.step
    : initialDesign
      ? "blank"
      : initialFlow
        ? initialFlow === "design_first"
          ? "design"
          : "blank"
        : "flow";
  const step: Step = (BUILDER_STEPS as readonly string[]).includes(stepParam ?? "")
    ? (stepParam as Step)
    : initialStep;
  const setStep = (next: Step) => {
    const p = new URLSearchParams(params);
    p.set("step", next);
    setParams(p, { replace: true });
  };

  const [flow, setFlow] = useState<Flow | null>(
    restored?.flow ?? initialFlow ?? (initialDesign ? "design_first" : null),
  );
  const [design, setDesign] = useState<Design | null>(initialDesign ?? null);
  const [blank, setBlank] = useState<Blank | null>(null);
  const [colorName, setColorName] = useState<string | null>(restored?.colorName ?? null);
  // Artwork actually placed on the garment, front and back. `design` above stays
  // the concept's headline design (the `design_id` column V1 and the rest of V2
  // already read); this is the full arrangement.
  const [placed, setPlaced] = useState<PlacedDesign[]>(restored?.placed ?? []);
  const [surface, setSurface] = useState<"front" | "back">(restored?.surface ?? "front");
  // Alignment lines are per surface — where you want a reference on the chest
  // is not where you want one on the back.
  const [guides, setGuides] = useState<Record<string, Guides>>(
    restored?.guides && Object.keys(restored.guides).length > 0
      ? { front: DEFAULT_GUIDES, back: DEFAULT_GUIDES, ...restored.guides }
      : { front: DEFAULT_GUIDES, back: DEFAULT_GUIDES },
  );
  const [collectionId, setCollectionId] = useState<string>(restored?.collectionId ?? "");
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState(restored?.title ?? "");
  const [notes, setNotes] = useState(restored?.notes ?? "");
  const [scopeAllDesigns, setScopeAllDesigns] = useState(false);
  // The run this mockup will be saved as: extra colourways of the same blank,
  // and other blanks entirely. Empty means "just the one I built".
  const [extraColors, setExtraColors] = useState<string[]>(restored?.extraColors ?? []);
  const [extraBlanks, setExtraBlanks] = useState<Record<string, string[]>>(restored?.extraBlanks ?? {});
  const [newCollection, setNewCollection] = useState("");
  const [onlyEligible, setOnlyEligible] = useState(true);

  const designsQ = useDesigns(scopeAllDesigns ? undefined : entity.id);
  const shelfQ = useDesignShelf(entity.id);
  const blanksQ = useBlanks();
  const collectionsQ = useCollections();
  const create = useCreateMockupBatch();
  const update = useUpdateMockup(entity.id);
  const editing = useMockupForEdit(editMockupId ?? undefined);
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

  /*
    A restored draft holds IDS, because objects go stale. These re-attach the
    real Design and Blank as soon as their queries land, once each. A draft can
    outlive what it points at — a design unlinked, a blank retired — and the
    honest outcome then is an empty slot the operator re-picks, not a crash and
    not a phantom.
  */
  const reattached = useRef({ design: !restored?.designId, blank: !restored?.blankId });
  useEffect(() => {
    if (reattached.current.design || !restored?.designId) return;
    const found = (designsQ.data ?? []).find((d) => d.id === restored.designId);
    if (!found) return;
    reattached.current.design = true;
    setDesign(found);
  }, [designsQ.data, restored?.designId]);

  useEffect(() => {
    if (reattached.current.blank || !restored?.blankId) return;
    const found = (blanksQ.data ?? []).find((b) => b.id === restored.blankId);
    if (!found) return;
    reattached.current.blank = true;
    setBlank(found);
  }, [blanksQ.data, restored?.blankId]);

  const color = blank?.colors.find((c) => c.name === colorName) ?? null;

  /*
    WHERE ARTWORK STARTS, PER GARMENT.
    A hoodie's pocket and hood, a zip up the front, a leg instead of a chest —
    these change where a print goes and how big it lands, and they used to be
    one hardcoded 34%-wide square in the middle of everything. Still just a
    starting point: nothing snaps and one drag overrides it.
  */
  const garment = useMemo(() => defaultsFor(blank?.garmentType), [blank?.garmentType]);

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

  /**
   * THE COLOURWAY SELECTION, MASTER FIRST.
   *
   * `colorName` is the master — the colourway you actually place artwork on —
   * and `extraColors` is everything else that inherits that arrangement. They
   * are two fields rather than one array because the master is the only colour
   * the canvas can show, and the save path already keys off it.
   *
   * Placing once and inheriting is the whole point: a centre-chest logo on the
   * heavyweight hoodie is centre-chest on all thirteen colours, and asking the
   * operator to repeat the same drag thirteen times would be asking them to do
   * a computer's job.
   */
  const selectedColors = useMemo(
    () => (colorName ? [colorName, ...extraColors.filter((n) => n !== colorName)] : []),
    [colorName, extraColors],
  );

  const availableColors = useMemo(
    // Only colours the supplier actually has. Building a mockup on a
    // discontinued colourway wastes everyone's time and the flag already exists.
    () => (blank?.colors ?? []).filter((c) => c.available),
    [blank],
  );

  const toggleColor = (name: string) => {
    if (name === colorName) {
      // Deselecting the master promotes the next colour rather than wiping the
      // selection — the operator meant "not this one", not "start over".
      const [next, ...rest] = extraColors;
      setColorName(next ?? null);
      setExtraColors(rest);
      return;
    }
    if (extraColors.includes(name)) {
      setExtraColors((prev) => prev.filter((n) => n !== name));
      return;
    }
    if (!colorName) setColorName(name);
    else setExtraColors((prev) => [...prev, name]);
  };

  /** Make this colour the one the canvas shows, without changing the selection. */
  const makeMaster = (name: string) => {
    if (name === colorName || !colorName) {
      setColorName(name);
      return;
    }
    setExtraColors((prev) => [...prev.filter((n) => n !== name), colorName]);
    setColorName(name);
  };

  const selectAllColors = () => {
    const names = availableColors.map((c) => c.name);
    if (names.length === 0) return;
    setColorName((cur) => cur ?? names[0]);
    setExtraColors(names.slice(colorName ? 0 : 1).filter((n) => n !== (colorName ?? names[0])));
  };

  const clearColors = () => {
    setColorName(null);
    setExtraColors([]);
  };

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
  const restoredBlankId = useRef(restored?.blankId ?? null);
  useEffect(() => {
    // Reopening sets the blank and the colour together; clearing here would
    // undo the restored colourway a tick after it was set. Same for a draft:
    // re-attaching its blank must not throw away the colour it was built on.
    if (isEdit && hydrated) return;
    if (blank && restoredBlankId.current === blank.id) {
      restoredBlankId.current = null;
      return;
    }
    setColorName(null);
    // The alignment lines start where this garment's print starts, so "centre
    // on lines" is a no-op on a fresh placement rather than a surprise.
    if (blank) setGuides(startGuidesBoth(blank.garmentType));
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
    // setStep writes a search param and is re-created every render; depending
    // on it would re-run this hydration on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing.data, blanksQ.data, hydrated]);

  // Choosing the headline design seeds a front placement, so the common case —
  // one design, sitting where a print sits on THIS garment — needs no canvas
  // work at all. The blank may not be chosen yet, in which case the plain-top
  // baseline applies and the operator adjusts once they pick one.
  useEffect(() => {
    if (!design || isEdit) return;
    setPlaced((prev) =>
      prev.length > 0
        ? prev
        : [
            {
              id: `${design.id}-front-seed`,
              designId: design.id,
              surface: "front",
              box: boxCentredAt(startPoint(blank?.garmentType, "front"), garment.width, 1),
              rotation: 0,
              zoneId: null,
              zoneLabel: null,
            },
          ],
    );
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

  /**
   * Upload artwork and start a mockup on it.
   *
   * The freshly-created design is constructed locally rather than waited for:
   * the insert returns its id and storage path, which is everything the picker
   * and the canvas need, and the shelf query refetches behind us.
   */
  const uploadAndStart = async (file: File) => {
    setUploading(true);
    try {
      const title = file.name.replace(/\.[^.]+$/, "") || "Untitled design";
      const { designId, path } = await upload.mutateAsync({ file, title, productionReady: false });
      setDesign({
        id: designId,
        title,
        status: "concept",
        entityId: entity.id,
        fileBucket: "design-files",
        filePath: path,
        fileType: "source",
        productionReady: false,
        clientVisibility: "hidden",
        hasPreview: false,
        previewPath: null,
        createdAt: new Date().toISOString(),
      });
      setFlow("design_first");
      setStep("blank");
      toast.success("Uploaded", {
        description: "Filed as concept art — mark it production-ready on the design's own page.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload that artwork");
    } finally {
      setUploading(false);
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
      // NO ZONE. This was the last path in V2 that snapped artwork into a
      // print-zone rectangle — center_back — and stamped the record with a zone
      // the operator never chose. Placement is freeform everywhere else; a file
      // arriving by upload is not a reason to make it the exception.
      setPlaced((prev) => [
        ...prev,
        {
          id: `${designId}-back-${Date.now()}`,
          designId,
          surface: "back",
          box: boxCentredAt(startPoint(blank?.garmentType, "back"), garment.width, 1),
          rotation: 0,
          zoneId: null,
          zoneLabel: null,
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

  /*
    Persist on every change.
    Cheap — one small JSON write to local storage — and the alternative is
    choosing a moment to save, which is always the moment before the one where
    the tab closed.
  */
  useEffect(() => {
    if (isEdit) return;
    saveDraft({
      version: DRAFT_VERSION,
      entityId: entity.id,
      savedAt: new Date().toISOString(),
      flow,
      step,
      designId: design?.id ?? null,
      blankId: blank?.id ?? null,
      colorName,
      extraColors,
      extraBlanks,
      placed,
      guides,
      surface,
      title,
      notes,
      collectionId,
    });
  }, [
    isEdit,
    entity.id,
    flow,
    step,
    design?.id,
    blank?.id,
    colorName,
    extraColors,
    extraBlanks,
    placed,
    guides,
    surface,
    title,
    notes,
    collectionId,
  ]);

  /** Throw the restored work away and start from an empty wizard. */
  const startFresh = () => {
    clearDraft(entity.id);
    setShowRestored(false);
    setDesign(null);
    setBlank(null);
    setColorName(null);
    setPlaced([]);
    setExtraColors([]);
    setExtraBlanks({});
    setTitle("");
    setNotes("");
    setCollectionId("");
    setFlow(null);
    setStep("flow");
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

      if (created.length === 0) {
        // The draft is deliberately NOT cleared here. Nothing was saved, so the
        // work only exists in the wizard, and throwing it away on the one
        // outcome where it is the only copy would be the worst possible moment.
        toast.error("Nothing could be saved", {
          description: failed.length > 0 ? failed.slice(0, 3).join(" · ") : "No mockup was written.",
        });
        return;
      }

      /*
        SAY WHAT HAPPENED, AND WHERE IT WENT.
        A run of twelve colourways that saves ten is not a success and not a
        failure, and "12 mockups created" would have been a lie either way.
      */
      const where = `In ${entity.name}'s Mockups.`;
      if (failed.length > 0) {
        toast.warning(`${created.length} of ${jobs.length} mockups saved`, {
          description: `${failed.length} could not be saved: ${failed.slice(0, 3).join(" · ")}${
            failed.length > 3 ? "…" : ""
          }`,
        });
      } else {
        toast.success(created.length === 1 ? "Mockup created" : `${created.length} mockups created`, {
          description: `${where} No products were created and nothing was sent to Shopify.`,
        });
      }

      // Saved: the wizard's copy is no longer the only one.
      clearDraft(entity.id);
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

        {/*
          Restored work says so, and says from when.
          "We put your unsaved mockup back" is unsettling without a timestamp —
          from this morning, or from three weeks ago? The answer decides whether
          you carry on or start over, so both choices are right here.
        */}
        {showRestored && restored && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--ax-accent)/0.35)] bg-[hsl(var(--ax-accent)/0.07)] px-4 py-2 text-[11px]">
            <RotateCcw className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-accent))]" aria-hidden />
            <span className="min-w-0 flex-1">
              Picked up where you left off — unsaved work from {describeAge(restored.savedAt)}.
            </span>
            <button
              type="button"
              onClick={startFresh}
              className="rounded-full border border-[hsl(var(--ax-border))] px-2.5 py-0.5 text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))]"
            >
              Start fresh
            </button>
            <button
              type="button"
              onClick={() => setShowRestored(false)}
              aria-label="Dismiss"
              className="rounded-lg p-1 text-[hsl(var(--ax-faint))] hover:bg-white/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
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
              {/*
                This card said "not wired in this first pass" long after upload
                was wired — the confirm step has used it for back artwork for
                weeks. A control that describes itself as broken is worse than
                no control.
              */}
              <label className="ax-card ax-card-hover flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-all">
                <Upload className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="text-[13px]">
                  <div className="font-medium">{uploading ? "Uploading…" : "Upload my own design"}</div>
                  <div className="text-[12px] text-[hsl(var(--ax-faint))]">
                    Filed against {entity.name} as concept art, then straight to choosing the blank.
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadAndStart(file);
                  }}
                />
              </label>
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

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] text-[hsl(var(--ax-secondary))]">
                  {selectedColors.length === 0 ? (
                    "Pick every colourway you want. You place the artwork once — the rest inherit it."
                  ) : (
                    <>
                      <span className="font-semibold text-[hsl(var(--ax-ink))]">
                        {selectedColors.length} colourway{selectedColors.length === 1 ? "" : "s"}
                      </span>{" "}
                      selected · you will place on{" "}
                      <span className="font-semibold text-[hsl(var(--ax-accent))]">{colorName}</span>
                    </>
                  )}
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={selectAllColors}
                    className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-1 text-[11px] font-medium text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-accent))]"
                  >
                    Select all {availableColors.length}
                  </button>
                  <button
                    type="button"
                    onClick={clearColors}
                    disabled={selectedColors.length === 0}
                    className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-1 text-[11px] font-medium text-[hsl(var(--ax-faint))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/*
                MULTI-SELECT. The first colour picked becomes the master purely
                because the canvas needs one definite garment to place on; a
                small badge says which, and any selected colour can take over.
              */}
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6 lg:grid-cols-8">
                {availableColors.map((c) => {
                  const isMaster = colorName === c.name;
                  const isPicked = isMaster || extraColors.includes(c.name);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleColor(c.name)}
                      onDoubleClick={() => makeMaster(c.name)}
                      title={
                        isPicked
                          ? `${c.name} — click to remove${isMaster ? "" : ", double-click to place on this one"}`
                          : c.imageUrl
                            ? c.name
                            : `${c.name} — no photography yet`
                      }
                      className={`ax-card ax-card-hover overflow-hidden p-0 text-left transition-all ${
                        isMaster
                          ? "ring-2 ring-[hsl(var(--ax-accent))]"
                          : isPicked
                            ? "ring-1 ring-[hsl(var(--ax-accent)/0.55)]"
                            : ""
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
                        {isPicked && (
                          <span className="absolute left-1 top-1 rounded-full bg-[hsl(var(--ax-accent))] p-0.5 text-[hsl(var(--ax-on-accent))]">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                        {isMaster && selectedColors.length > 1 && (
                          <span className="absolute right-1 top-1 rounded-full bg-[hsl(var(--ax-accent))] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[hsl(var(--ax-on-accent))]">
                            Place
                          </span>
                        )}
                      </div>
                      <div className="truncate p-1.5 text-[10px]">{c.name}</div>
                    </button>
                  );
                })}
              </div>

              {blank.colors.length === 0 && (
                <p className="py-10 text-center text-[13px] text-[hsl(var(--ax-faint))]">
                  This blank has no colour records yet. You can still create the concept without one.
                </p>
              )}
            </>
          )}

          {step === "placement" && (
            /*
              THE GARMENT GETS THE ROOM.
              The design rail used to sit in a 240px column beside the canvas,
              which cost the preview a quarter of its width on every screen for
              a list that is only touched between placements. Rail and
              colourways moved to a tray underneath; the canvas now spans the
              full width, which is the one thing here that benefits from size.
            */
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-[hsl(var(--ax-border))] p-0.5">
                  {(["front", "back"] as const).map((sf) => {
                    const count = placed.filter((p) => p.surface === sf).length;
                    // resolveBlankImage falls back to the front when a back shot
                    // is missing, so asking it whether the back "has an image"
                    // always said yes and this warning never fired. Ask the
                    // photography directly instead.
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
                defaultGuides={surface === "back" ? garment.guides.back : garment.guides.front}
                garmentNote={garment.note}
                onGuidesChange={(next) => setGuides((prev) => ({ ...prev, [surface]: next }))}
                onChange={setPlaced}
                onDropDesign={(designId, x, y, aspect) =>
                  addPlacement(designId, boxCentredAt({ x, y }, garment.width, aspect), null)
                }
              />

              <div className="grid gap-3 lg:grid-cols-[1fr_minmax(240px,300px)]">
                {blank && selectedColors.length > 0 && (
                  <ColorwayStrip
                    blank={blank}
                    selected={selectedColors}
                    master={colorName}
                    placed={placed}
                    designsById={designsById}
                    surface={surface}
                    onMakeMaster={makeMaster}
                  />
                )}
                <MockupDesignRail
                  entityId={entity.id}
                  onQuickAdd={(d) => {
                    const at = dropCentre();
                    addPlacement(d.id, boxCentredAt(at, garment.width, 1), null);
                  }}
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
