import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { X, Check, ArrowLeft, ChevronDown, FolderOpen, ImageOff, Move, Repeat, RotateCcw, Upload } from "lucide-react";
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
import { overLimit, unphotographed, variantTitle, MAX_VARIANTS } from "@/lib/v2/variants";
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
import { useAddToCart, useCart } from "@/lib/v2/cart-data";
import { entityCartHref } from "@/lib/v2/entity-nav";
import { useAuth } from "@/auth/AuthProvider";
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
import { BlankCard, ColorChips, ColorStepHeader } from "./builder/BlankStep";
import { MockupDesignRail } from "./builder/PlacementAside";
import { ColorwayStrip, Line, StaticMockup } from "./builder/ReviewStep";
import { OrderQuantities } from "./builder/OrderQuantities";
import DesignSwitcher from "./builder/DesignSwitcher";
import SessionStrip from "./builder/SessionStrip";
import { swapDesign } from "@/lib/v2/design-swap";
import {
  activeProduct,
  addProduct,
  adjustedColors,
  applyToAll,
  isAdjusted,
  placementFor,
  resetToShared,
  setPlacement,
  emptySession,
  needsPlacement,
  newProduct,
  orderedColors,
  removeProduct,
  sessionNeedsPlacement,
  sessionVariants,
  setActive,
  setMaster,
  markSaved,
  toggleColor as toggleProductColor,
  updateActive,
  type StudioProduct,
  type StudioSession,
} from "@/lib/v2/studio-session";
import { gridUnits, rowUnits, sizesForRun, type QuantityGrid } from "@/lib/v2/cart";
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
  varyFromId,
}: {
  entity: Entity;
  onClose: () => void;
  onCreated?: (id: string) => void;
  initialFlow?: Flow;
  /** Opened from a design's own page — skip straight to choosing the blank. */
  initialDesign?: Design | null;
  /** Reopening a saved mockup. Everything is loaded and the flow becomes an edit. */
  editMockupId?: string | null;
  /**
   * VARIATIONS. Load a saved mockup exactly as editing would — blank, colour,
   * every placement, the guides — but save as NEW mockups rather than over the
   * original.
   *
   * This is the whole variation workflow, and it is a mode rather than a
   * separate screen on purpose: a variation is a mockup, made the same way,
   * from a starting point that is already right. Every tool it needs — the
   * colourway grid, other blanks, the design switcher, the quantity grid, the
   * three save actions — is already on this screen. A second builder that did
   * "the same but for variations" would drift from this one within a month.
   */
  varyFromId?: string | null;
}) {
  const isEdit = Boolean(editMockupId);
  const isVariation = Boolean(varyFromId) && !isEdit;
  /** The saved mockup this session started from, whichever mode we are in. */
  const sourceMockupId = editMockupId ?? (isVariation ? varyFromId : null);

  /*
    UNSAVED WORK SURVIVES A REFRESH.

    Read once, synchronously, before any state is initialised — so the wizard
    comes up already holding what was there rather than flickering through an
    empty one. Editing a saved mockup never restores: that row is the truth.
    See mockup-draft.ts for why this is local storage and not a table.
  */
  const [restored] = useState<MockupDraft | null>(() =>
    editMockupId || varyFromId ? null : loadDraft(entity.id),
  );
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

  /*
    THE SESSION IS THE STATE.

    One StudioSession holds every product being worked on, and each product
    owns its own arrangement. The builder used to hold a single `placed[]` and
    a bag of "extra blanks" that inherited it — which is how a hoodie's chest
    placement ended up on a pair of sweatpants. See studio-session.ts.

    Everything below reads the ACTIVE product, so the canvas, the design rail
    and the placement step work exactly as they did.
  */
  const [session, setSession] = useState<StudioSession>(() => ({
    ...emptySession(entity.id),
    products: restored?.products ?? [],
    activeKey: restored?.activeKey ?? restored?.products?.[0]?.key ?? null,
  }));
  const [surface, setSurface] = useState<"front" | "back">(restored?.surface ?? "front");
  /** True while the blank step is choosing a NEW product rather than re-choosing this one's. */
  const [addingProduct, setAddingProduct] = useState(false);

  const active = activeProduct(session);
  const [collectionId, setCollectionId] = useState<string>(restored?.collectionId ?? "");
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState(restored?.title ?? "");
  const [notes, setNotes] = useState(restored?.notes ?? "");
  const [scopeAllDesigns, setScopeAllDesigns] = useState(false);
  const [newCollection, setNewCollection] = useState("");
  /**
   * How many of each, per colourway. Empty is the ordinary case: most
   * mockups are made to look at. Nothing here is persisted in the draft —
   * quantities are an ordering decision made once, not creative work worth
   * restoring a week later.
   */
  const [qtyGrid, setQtyGrid] = useState<QuantityGrid>({});
  const [switching, setSwitching] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [onlyEligible, setOnlyEligible] = useState(true);

  const designsQ = useDesigns(scopeAllDesigns ? undefined : entity.id);
  const shelfQ = useDesignShelf(entity.id);
  const blanksQ = useBlanks();
  const collectionsQ = useCollections();
  const create = useCreateMockupBatch();
  const update = useUpdateMockup(entity.id);
  const editing = useMockupForEdit(sourceMockupId ?? undefined);
  const createCollection = useCreateCollection();
  const upload = useUploadDesign(entity.id, entity.organizationId);
  const { user } = useAuth();
  const addToCart = useAddToCart(entity.id, entity.organizationId, user?.id);
  const cartQ = useCart(entity.id, user?.id);
  const cartUnits = cartQ.data?.units ?? 0;

  const audience = audienceForRoles(entity.roles);

  const blanks = useMemo(() => {
    const all = blanksQ.data ?? [];
    const eligible = onlyEligible ? all.filter((b) => hasAccess(b, audience)) : all;
    return [...eligible].sort((a, b) => a.name.localeCompare(b.name));
  }, [blanksQ.data, onlyEligible, audience]);

  const blanksById = useMemo(
    () => new Map((blanksQ.data ?? []).map((b) => [b.id, b])),
    [blanksQ.data],
  );

  /* ------------------------------------------------ the active product, as
     the rest of this component already expects to read it. These are the only
     bridge between the session and the canvas/placement code, which is
     unchanged. */

  const blank: Blank | null = active ? (blanksById.get(active.blankId) ?? null) : null;
  const colorName = active?.masterColor ?? null;

  /*
    THE CANVAS SHOWS ONE COLOURWAY, AND EDITS ONLY THAT ONE.

    Colourway photography is not pixel-aligned — the same hoodie shot in Cream
    and in Shadow can sit a couple of percent apart in frame — so a placement
    that is right on one can read low on another. Percentages carry the intent
    between colours; only the operator can see whether the result landed.

    The first placement still goes to the shared slot, so "place once, get
    thirteen" is intact and a colourway added tomorrow inherits it. Every drag
    after that is local to the colour on screen, and Apply to all is how
    propagation happens on purpose rather than by accident.
  */
  const placed = useMemo(() => (active ? placementFor(active, colorName) : []), [active, colorName]);
  const colorIsAdjusted = Boolean(active && isAdjusted(active, colorName));
  const adjustedCount = active ? adjustedColors(active).length : 0;
  const guides = useMemo(
    () => active?.guides ?? { front: DEFAULT_GUIDES, back: DEFAULT_GUIDES },
    [active],
  );

  const setPlaced = (next: PlacedDesign[] | ((prev: PlacedDesign[]) => PlacedDesign[])) =>
    setSession((s) =>
      updateActive(s, (p) => {
        const current = placementFor(p, p.masterColor);
        return setPlacement(p, p.masterColor, typeof next === "function" ? next(current) : next);
      }),
    );

  /** Push what is on screen out to every colourway of this product. */
  const applyPlacementToAll = () =>
    setSession((s) => updateActive(s, (p) => applyToAll(p, p.masterColor)));

  /** Put this colourway back on the product's shared arrangement. */
  const resetPlacement = () =>
    setSession((s) => updateActive(s, (p) => (p.masterColor ? resetToShared(p, p.masterColor) : p)));

  const setGuides = (
    next: Record<string, Guides> | ((prev: Record<string, Guides>) => Record<string, Guides>),
  ) =>
    setSession((s) =>
      updateActive(s, (p) => ({ ...p, guides: typeof next === "function" ? next(p.guides) : next })),
    );

  /**
   * Choose the garment for the product being worked on.
   *
   * `addingProduct` is what separates "I picked the wrong hoodie, change it"
   * from "now do the sweatpants". The second creates a NEW product with an
   * EMPTY placement — inheriting the hoodie's would put a chest hit on a
   * thigh — and the alignment lines start where this garment's print starts.
   */
  const setBlank = (b: Blank | null) => {
    if (!b) return;
    setSession((s) => {
      const fresh = newProduct({ blankId: b.id, guides: startGuidesBoth(b.garmentType) });
      if (addingProduct || !s.activeKey) return addProduct(s, fresh);
      return updateActive(s, (p) =>
        p.blankId === b.id
          ? p
          : { ...p, blankId: b.id, masterColor: null, colorNames: [], guides: startGuidesBoth(b.garmentType) },
      );
    });
    setAddingProduct(false);
  };

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
  const reattached = useRef({ design: !restored?.designId });
  useEffect(() => {
    if (reattached.current.design || !restored?.designId) return;
    const found = (designsQ.data ?? []).find((d) => d.id === restored.designId);
    if (!found) return;
    reattached.current.design = true;
    setDesign(found);
  }, [designsQ.data, restored?.designId]);

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
    return sessionVariants(session, blanksById);
  }, [session, blanksById]);

  /* ------------------------------------------------------------- ordering */

  /** Every size any garment in this run offers, in apparel order. */
  const orderSizes = useMemo(
    () => sizesForRun(variants, (id) => blanksById.get(id)?.sizes ?? []),
    [variants, blanksById],
  );

  /** Audience price for a variant's garment. Null means AX has never priced it. */
  const priceOfVariant = (index: number): number | null => {
    const v = variants[index];
    const b = v ? blanksById.get(v.blankId) : undefined;
    return b ? (priceFor(b, audience) ?? null) : null;
  };

  const orderUnits = useMemo(() => gridUnits(qtyGrid), [qtyGrid]);

  /** Any of the three actions in flight disables all three. */
  const busy = create.isPending || update.isPending || addToCart.isPending;

  /** The product on screen still has nothing on it. */
  const needsPlacementNow = Boolean(active) && needsPlacement(active as StudioProduct);

  /**
   * Swap the artwork and leave everything else alone.
   *
   * The headline `design` follows the swap when the whole garment was swapped,
   * because that is the design the mockup row records; a partial swap leaves it
   * be, since the garment still carries the original.
   */
  const applySwap = (toDesignId: string, fromDesignId: string | null) => {
    setPlaced((prev) => swapDesign(prev, toDesignId, { fromDesignId }));
    if (fromDesignId == null || fromDesignId === design?.id) {
      const next = (designsQ.data ?? []).find((d) => d.id === toDesignId);
      if (next) setDesign(next);
    }
  };

  const setQty = (variantIndex: number, size: string, quantity: number) =>
    setQtyGrid((prev) => ({
      ...prev,
      [variantIndex]: { ...(prev[variantIndex] ?? {}), [size]: quantity },
    }));

  /**
   * THE COLOURWAYS OF THE PRODUCT ON SCREEN, MASTER FIRST.
   *
   * The master is the colourway the canvas shows and the one the placement was
   * judged against; the rest inherit that product's arrangement. Placing once
   * and inheriting is the whole point — a centre-chest logo is centre-chest on
   * all thirteen colours of the same hoodie, and asking the operator to repeat
   * the drag thirteen times would be asking them to do a computer's job.
   *
   * It inherits ACROSS COLOURS OF ONE GARMENT and never across garments. That
   * is the rule the session model enforces; see studio-session.ts.
   */
  const selectedColors = useMemo(() => (active ? orderedColors(active) : []), [active]);

  const availableColors = useMemo(
    // Only colours the supplier actually has. Building a mockup on a
    // discontinued colourway wastes everyone's time and the flag already exists.
    () => (blank?.colors ?? []).filter((c) => c.available),
    [blank],
  );

  /* ------------------------------------------------------ the studio moves */

  /**
   * + Add another product.
   *
   * Keeps the athlete, the design and everything already in the session, and
   * sends the operator to the blank catalog to pick the next garment. What it
   * deliberately does NOT do is carry the placement across: the new product
   * arrives empty and the studio marks it "Place artwork", because a hoodie's
   * chest coordinates are a sweatpants thigh.
   */
  const startAnotherProduct = () => {
    setAddingProduct(true);
    setStep("blank");
  };

  /** Bring a product already in the session back into the editor. */
  const openProduct = (key: string) => {
    setSession((s) => setActive(s, key));
    setAddingProduct(false);
    setSurface("front");
    setStep(needsPlacement(session.products.find((p) => p.key === key) ?? { placed: [] } as StudioProduct)
      ? "placement"
      : "confirm");
  };

  const dropProduct = (key: string) => setSession((s) => removeProduct(s, key));

  const toggleColor = (name: string) =>
    setSession((s) => updateActive(s, (p) => toggleProductColor(p, name)));

  /** Make this colour the one the canvas shows. */
  const makeMaster = (name: string) => setSession((s) => updateActive(s, (p) => setMaster(p, name)));

  const selectAllColors = () => {
    const names = availableColors.map((c) => c.name);
    if (names.length === 0) return;
    setSession((s) =>
      updateActive(s, (p) => ({
        ...p,
        masterColor: p.masterColor ?? names[0],
        colorNames: names,
      })),
    );
  };

  const clearColors = () =>
    setSession((s) =>
      // The master survives: it is the colour the arrangement was made against,
      // and a product with none is a product whose placement refers to nothing.
      updateActive(s, (p) => ({ ...p, colorNames: p.masterColor ? [p.masterColor] : [] })),
    );

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

  /*
    Changing the garment resets the colour and the alignment lines — a colour
    name only means something inside one blank. That used to be an effect
    watching blank.id, which then needed guards for every path that set the
    two together. It now happens inside setBlank, where the intent is known.
  */

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
    // A variation is a new mockup and needs its own name. Inheriting the
    // original's would leave two rows with the same title, which is the
    // library problem the naming rules exist to avoid.
    setTitle(isVariation ? `${m.title} — variation` : m.title);
    setNotes(m.notes ?? "");
    setCollectionId(m.collectionId ?? "");
    /*
      Reopening builds a session of exactly one product: this mockup, its
      garment, its colourway and its own arrangement. Everything the studio can
      do afterwards — more colourways, another product, another design — starts
      from here.
    */
    const restoredProduct = newProduct({
      blankId: m.blankId ?? "",
      colorName: m.colorName,
      placed: m.placed,
      guides:
        Object.keys(m.guides).length > 0
          ? { front: DEFAULT_GUIDES, back: DEFAULT_GUIDES, ...m.guides }
          : undefined,
    });
    setSession((s) => (m.blankId ? addProduct({ ...s, products: [], activeKey: null }, restoredProduct) : s));
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
    if (!design || isEdit || isVariation) return;
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

  /**
   * Is there anything to write?
   *
   * In edit mode the answer is always yes — there is a row on screen. In the
   * studio it is however many unsaved variants the session holds, which drops
   * to zero the moment everything has been saved, and the Save button goes
   * quiet rather than writing duplicates.
   */
  const savable = isEdit ? 1 : variants.length;

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
      products: session.products,
      activeKey: session.activeKey,
      surface,
      title,
      notes,
      collectionId,
    });
  }, [isEdit, entity.id, flow, step, design?.id, session, surface, title, notes, collectionId]);

  /** Throw the restored work away and start from an empty wizard. */
  const startFresh = () => {
    clearDraft(entity.id);
    setQtyGrid({});
    setShowRestored(false);
    setDesign(null);
    setSession(emptySession(entity.id));
    setAddingProduct(false);
    setTitle("");
    setNotes("");
    setCollectionId("");
    setFlow(null);
    setStep("flow");
  };

  /**
   * THE THREE WAYS OUT OF THE BUILDER.
   *
   *   save           — the mockups exist. Nothing is ordered. The default,
   *                    because most mockups are made to be looked at.
   *   cart           — the mockups exist AND the quantities go into this
   *                    entity's draft order. The builder closes.
   *   cart-continue  — the same, but the wizard empties itself and stays open,
   *                    because "one more colourway" is the actual rhythm of
   *                    building a run and closing the sheet to reopen it is
   *                    four clicks of nothing.
   *
   * Ordering never happens without saving: a cart line points at a mockup, so
   * the mockup has to be real first. If the save half fails, nothing is added.
   */
  type SubmitMode = "save" | "cart" | "cart-continue" | "add-product";

  /**
   * Put what was just created into the cart.
   *
   * `ids` lines up with `variants`, which is what the quantity grid is keyed
   * on, so each colourway's numbers land on its own mockup rather than on
   * whichever one happened to be on screen. Colourways with no quantities are
   * skipped rather than added at zero — the table rejects a zero line.
   */
  const sendToCart = async (ids: Array<string | null>, titleAt: (i: number) => string) => {
    const inputs = ids.flatMap((id, i) => {
      const v = variants[i];
      if (!id || !v || rowUnits(qtyGrid, i) === 0) return [];
      return [
        {
          mockupId: id,
          title: titleAt(i),
          blankId: v.blankId,
          colorName: v.colorName,
          unitRetail: priceOfVariant(i) ?? 0,
          lines: Object.entries(qtyGrid[i] ?? {}).map(([size, quantity]) => ({ size, quantity })),
        },
      ];
    });
    if (inputs.length === 0) return 0;
    await addToCart.mutateAsync(inputs);
    return inputs.reduce((n, i) => n + i.lines.reduce((m, l) => m + Math.max(0, l.quantity), 0), 0);
  };

  /**
   * The preview failed but the mockup did not.
   *
   * `garment` is the one worth naming: it means the blank's photograph could
   * not be drawn, which for a Drive-hosted garment used to happen every single
   * time and produced an artwork-only square nobody could tell was wrong.
   */
  const warnAboutPreview = (reason: "garment" | "render", count: number) => {
    const many = count > 1 ? `${count} previews` : "The preview";
    toast.warning(`${many} could not be rendered`, {
      description:
        reason === "garment"
          ? "The garment photograph could not be loaded, so the mockup is showing the blank instead. Try Regenerate preview from the mockup."
          : "The mockup saved correctly and is showing the blank instead.",
    });
  };

  const submit = async (mode: SubmitMode = "save") => {
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
        const editPreview = await storeMockupComposite({
          mockupId: editMockupId,
          garmentUrl: frontImage.url,
          placed: placed.filter((p) => p.surface === "front"),
          designsById,
        });
        if (editPreview.ok === false) warnAboutPreview(editPreview.reason, 1);

        const editedTitle = title.trim() || "Untitled mockup";
        const ordered = mode === "save" ? 0 : await sendToCart([editMockupId], () => editedTitle);

        toast.success(ordered > 0 ? `Mockup saved · ${ordered} units in the cart` : "Mockup saved", {
          description: ordered > 0 ? "The cart is a draft order. Nothing has been submitted." : undefined,
        });
        onCreated?.(editMockupId);
        if (mode === "add-product") {
          startAnotherProduct();
          return;
        }
        // Adding to the cart is not the end of anything; only Save closes.
        if (mode === "cart" || mode === "cart-continue") return;
        onClose();
        return;
      }

      // The headline placement mirrors onto each mockup row's own columns so V1
      // and every existing V2 read keep working unchanged; the full arrangement
      // lives in product_print_placements.
      const multipleBlanks = new Set(variants.map((v) => v.blankId)).size > 1;

      /*
        EACH VARIANT CARRIES ITS OWN PRODUCT'S ARRANGEMENT.

        This used to build `rows` once, from the single `placed` the builder
        held, and write it onto every mockup in the batch — including mockups
        on entirely different garments. A run of a hoodie and a pair of
        sweatpants got the hoodie's coordinates twice.

        v.placed is its product's, so the hoodie's colourways share the hoodie's
        placement and the sweatpants have their own.
      */
      const jobs = variants.map((v) => {
        const headline = v.placed.find((p) => p.surface === "front") ?? v.placed[0] ?? null;
        return {
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
            guides: v.guides,
          },
          placements: toRows(v.placed),
        };
      });

      const { created, failed } = await create.mutateAsync(jobs);

      // Flatten artwork onto the garment for each one that saved.
      //
      // After the insert, because the mockups bucket authorises an object by
      // resolving its first path folder back to a mockup row. `created` comes
      // back in the same order as `jobs`, which is the order of `variants`, so
      // each composite gets its own colourway's garment shot rather than the
      // one that happened to be on screen.
      const previews = await Promise.all(
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
            placed: v.placed.filter((p) => p.surface === "front"),
            designsById,
          });
        }),
      );
      /*
        A MOCKUP THAT SAVED WITHOUT ITS PREVIEW IS STILL SAVED.

        The row, the placements and the arrangement are all correct; only the
        flattened picture is missing, so the card falls back to the garment
        photograph. Worth one line, not an error — but it must not be silent,
        because a silent version of exactly this is why every preview in the
        library was the bare blank.
      */
      const previewFailures = previews.filter(
        (p): p is { ok: false; reason: "garment" | "render"; message?: string } => p != null && !p.ok,
      );
      if (previewFailures.length > 0) {
        warnAboutPreview(
          previewFailures.some((p) => p.reason === "garment") ? "garment" : "render",
          previewFailures.length,
        );
      }

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

      /*
        THE CART HALF.

        `created` comes back in the order of `jobs`, which is the order of
        `variants` — the same order the quantity grid is keyed on. Anything
        that failed to save is a null in that position and is skipped, so a
        partial run puts exactly the mockups that exist into the cart and
        silently orders nothing that does not.
      */
      let ordered = 0;
      if (mode !== "save") {
        const alignedIds = jobs.map((_, i) => created[i] ?? null);
        try {
          ordered = await sendToCart(alignedIds, (i) => jobs[i]?.draft.title ?? "Untitled mockup");
        } catch (err) {
          // The mockups are real and saying otherwise would be a lie. The
          // quantities are still on screen, so the add can simply be retried.
          toast.error(err instanceof Error ? err.message : "Saved, but could not add to the cart");
        }
      }

      if (ordered > 0) {
        toast.success(`${ordered} unit${ordered === 1 ? "" : "s"} added to the cart`, {
          description: `${entity.name}'s cart is a draft order — review and submit it from Orders.`,
        });
      }

      /*
        THE STUDIO DOES NOT CLOSE WHEN YOU SAVE.

        Mark what was actually written so a second Save does not create it
        again, then decide where the operator goes. Only "save" ends the
        session; the other two are mid-session moves and stay put.
      */
      setSession((s) =>
        markSaved(
          s,
          created
            .map((id, i) => (id ? variants[i] : null))
            .filter((v): v is (typeof variants)[number] => Boolean(v))
            .map((v) => ({ productKey: v.productKey, colorName: v.colorName })),
        ),
      );
      onCreated?.(created[0]);

      if (mode === "add-product") {
        startAnotherProduct();
        return;
      }
      if (mode === "cart" || mode === "cart-continue") {
        // Stays in the studio on purpose: adding to the cart is not the end of
        // anything, and closing the sheet to reopen it is four clicks of nothing.
        return;
      }

      // Saved and finished: the wizard's copy is no longer the only one.
      clearDraft(entity.id);
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
            <div className="truncate text-[15px] font-semibold">
              {isEdit ? "Edit mockup" : isVariation ? "New variation" : "Create mockup"}
            </div>
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
                  const isPicked = selectedColors.includes(c.name);
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

              {/*
                WHOSE PLACEMENT AM I EDITING?

                Only shown once there is more than one colourway, because with
                one there is nothing to propagate to and the question does not
                arise. It states the rule rather than explaining it: edits are
                local, Apply to all is the way out.
              */}
              {selectedColors.length > 1 && placed.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--ax-border))] bg-white/[0.02] px-3 py-2">
                  <span className="min-w-0 flex-1 text-[11.5px] text-[hsl(var(--ax-secondary))]">
                    Editing <strong className="font-semibold text-[hsl(var(--ax-ink))]">{colorName}</strong> only
                    {colorIsAdjusted ? (
                      <span className="ml-1.5 text-[hsl(var(--ax-amber))]">· adjusted from the shared placement</span>
                    ) : (
                      <span className="ml-1.5 text-[hsl(var(--ax-faint))]">
                        · {selectedColors.length - 1} other{selectedColors.length === 2 ? "" : "s"} keep theirs
                      </span>
                    )}
                  </span>
                  {colorIsAdjusted && (
                    <button
                      type="button"
                      onClick={resetPlacement}
                      className="shrink-0 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1 text-[11.5px] text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]"
                    >
                      Reset to shared
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={applyPlacementToAll}
                    title={`Give all ${selectedColors.length} colourways this arrangement`}
                    className="shrink-0 rounded-full border border-[hsl(var(--ax-accent)/0.5)] px-3 py-1 text-[11.5px] font-semibold text-[hsl(var(--ax-accent))] hover:bg-[hsl(var(--ax-accent)/0.1)]"
                  >
                    Apply to all {selectedColors.length}
                  </button>
                </div>
              )}

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
                    placedFor={(name) => (active ? placementFor(active, name) : [])}
                    adjusted={active ? adjustedColors(active) : []}
                    designsById={designsById}
                    surface={surface}
                    onMakeMaster={makeMaster}
                  />
                )}
                <div className="space-y-2">
                  {placed.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSwitching(true)}
                      title="Put different artwork in exactly these boxes"
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--ax-accent)/0.4)] px-3 py-2 text-[12px] font-semibold text-[hsl(var(--ax-accent))] transition-colors hover:bg-[hsl(var(--ax-accent)/0.1)]"
                    >
                      <Repeat className="h-3.5 w-3.5" />
                      Add / change design
                    </button>
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
            </div>
          )}

          {step === "confirm" && (
            <div className="space-y-5">
            {isVariation && (
              <p className="rounded-xl border border-[hsl(var(--ax-accent)/0.35)] bg-[hsl(var(--ax-accent)/0.06)] px-3.5 py-2.5 text-[12px] text-[hsl(var(--ax-secondary))]">
                These save as <strong className="font-semibold text-[hsl(var(--ax-ink))]">new mockups</strong>. The one
                you started from is not changed — add colourways or other blanks below, or swap the artwork, and this
                becomes a run of its own.
              </p>
            )}
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
                {/*
                  Notes are occasional, so they do not get permanent furniture.
                  Opened automatically when there is something to read, because
                  a note nobody can see is worse than no note.
                */}
                {showNotes || notes.trim() ? (
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                      Notes
                    </span>
                    <textarea
                      value={notes}
                      autoFocus={showNotes && !notes.trim()}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNotes(true)}
                    className="text-left text-[12px] text-[hsl(var(--ax-accent))] hover:underline"
                  >
                    + Add notes
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSwitching(true)}
                  disabled={placed.length === 0}
                  title={
                    placed.length === 0
                      ? "Place some artwork first"
                      : "Put different artwork in exactly these boxes"
                  }
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[hsl(var(--ax-border))] px-3 py-2 text-[12px] font-medium text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent)/0.6)] hover:text-[hsl(var(--ax-ink))] disabled:opacity-40"
                >
                  <Repeat className="h-3.5 w-3.5" />
                  Add / change design
                </button>

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

            {/* ------------------------------------------ order quantities */}
            {blank && variants.length > 0 && (
              <OrderQuantities
                variants={variants}
                sizes={orderSizes}
                grid={qtyGrid}
                priceOf={priceOfVariant}
                onChange={setQty}
                onClear={() => setQtyGrid({})}
              />
            )}

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
                  <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em]">Colorways</h3>
                  <span className="text-[12px] tabular-nums text-[hsl(var(--ax-secondary))]">
                    {variants.length} mockup{variants.length === 1 ? "" : "s"} in this session
                  </span>
                </div>
                {/*
                  ONE LINE, NOT A PARAGRAPH.

                  What used to sit here was two sentences explaining percentage
                  geometry, above a grid of every other blank — which made
                  copying a hoodie's placement onto pants look like the intended
                  workflow. The colours below belong to THIS garment; another
                  garment gets its own placement, through Add another product.
                */}
                <p className="mt-0.5 text-[11.5px] text-[hsl(var(--ax-faint))]">
                  Selected colors use this product&rsquo;s placement.
                </p>

                <div className="mt-3">
                  <ColorChips
                    blank={blank}
                    selected={selectedColors}
                    baseColorName={colorName}
                    onToggle={toggleColor}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllColors}
                    className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[11.5px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
                  >
                    Select all colors
                  </button>
                  {selectedColors.length > 1 && (
                    <button
                      type="button"
                      onClick={clearColors}
                      className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[11.5px] text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={startAnotherProduct}
                    className="ml-auto rounded-full border border-[hsl(var(--ax-accent)/0.5)] px-3.5 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-accent))] hover:bg-[hsl(var(--ax-accent)/0.1)]"
                  >
                    + Add another product
                  </button>
                </div>

                {unphotographed(variants).length > 0 && (
                  <p className="mt-3 text-[11px] text-[hsl(var(--ax-amber))]">
                    {unphotographed(variants).length} of these have no photograph of their own.
                  </p>
                )}
                {overLimit(variants.length) && (
                  <p className="mt-3 text-[11px] font-medium text-[hsl(var(--ax-amber))]">
                    {variants.length} mockups. The cap is {MAX_VARIANTS} in one go — trim the selection.
                  </p>
                )}
              </section>
            )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------- the session strip */}
        {step !== "flow" && session.products.length > 0 && (
          <SessionStrip
            products={session.products}
            activeKey={session.activeKey}
            blanksById={blanksById}
            designsById={designsById}
            onOpen={openProduct}
            onRemove={dropProduct}
            onAdd={startAnotherProduct}
          />
        )}

        {/* footer */}
        {step !== "flow" && (
          <div className="flex flex-wrap items-center gap-3 border-t border-[hsl(var(--ax-line))] px-4 py-3">
            <div className="min-w-0 flex-1 truncate text-[12px] text-[hsl(var(--ax-faint))]">
              {[
                design && (cleanDesignTitle(design.title) ?? "Design"),
                blank?.name,
                colorName,
                needsPlacementNow ? "needs placement" : null,
              ]
                .filter(Boolean)
                .join("  ·  ") || "Nothing chosen yet"}
            </div>

            {/*
              The cart is a draft order that outlives this sheet, so it is shown
              here rather than left to be discovered on the athlete's page.
              Quiet: a count, not a call to action.
            */}
            {cartUnits > 0 && (
              <Link
                to={entityCartHref(entity.id)}
                title="A draft order. Nothing has been submitted."
                className="shrink-0 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[11.5px] text-[hsl(var(--ax-secondary))] hover:border-[hsl(var(--ax-accent)/0.6)] hover:text-[hsl(var(--ax-ink))]"
              >
                Cart ({cartUnits})
              </Link>
            )}

            {step === "confirm" ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {/*
                  THREE ACTIONS. Saving is the common case and keeps the filled
                  button. Add to cart stays disabled until a quantity has been
                  typed — a button called "Add to cart" that adds nothing
                  teaches an operator to distrust the whole screen. Add product
                  saves first, then carries the session on.
                */}
                <button
                  type="button"
                  onClick={() => void submit("add-product")}
                  disabled={busy || savable === 0}
                  title="Save what is here and pick the next garment"
                  className="rounded-full border border-[hsl(var(--ax-border))] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--ax-secondary))] hover:border-[hsl(var(--ax-accent)/0.6)] hover:text-[hsl(var(--ax-ink))] disabled:opacity-40"
                >
                  + Add product
                </button>
                <button
                  type="button"
                  onClick={() => void submit("cart")}
                  disabled={busy || orderUnits === 0}
                  title={orderUnits === 0 ? "Enter some quantities above first" : undefined}
                  className="rounded-full border border-[hsl(var(--ax-accent)/0.5)] px-4 py-2 text-[13px] font-semibold text-[hsl(var(--ax-accent))] hover:bg-[hsl(var(--ax-accent)/0.1)] disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  {orderUnits > 0 ? `Add ${orderUnits} to cart` : "Add to cart"}
                </button>
                <button
                  type="button"
                  onClick={() => void submit("save")}
                  disabled={busy || savable === 0 || (!isEdit && overLimit(variants.length))}
                  className="rounded-full bg-[hsl(var(--ax-accent))] px-5 py-2 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50"
                >
                  {isEdit
                    ? update.isPending
                      ? "Saving…"
                      : "Save mockup"
                    : create.isPending
                      ? "Saving…"
                      : variants.length > 1
                        ? `Save ${variants.length} mockups`
                        : "Save mockup"}
                </button>
              </div>
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

      {switching && (
        <DesignSwitcher
          entityId={entity.id}
          placed={placed}
          designsById={designsById}
          onSwap={applySwap}
          onClose={() => setSwitching(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- parts */
