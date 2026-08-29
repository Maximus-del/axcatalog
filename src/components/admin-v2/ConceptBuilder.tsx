import { useEffect, useMemo, useState } from "react";
import { X, Check, ArrowLeft, ChevronDown, FolderOpen, ImageOff, Upload } from "lucide-react";
import { toast } from "sonner";
import { useBlanks, useCollections, useCreateConcept, useDesignShelf, useDesigns, usePrintZones } from "@/lib/v2/data";
import { presetById, presetsFor, type PlacementPreset } from "@/lib/v2/placements";
import { buildShelf, coverOf, type ShelfItem } from "@/lib/v2/design-groups";
import { photoCoverage, resolveBlankImage, swatchFor, type Surface } from "@/lib/v2/blank-image";
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
}: {
  entity: Entity;
  onClose: () => void;
  onCreated?: (id: string) => void;
  initialFlow?: Flow;
}) {
  const [flow, setFlow] = useState<Flow | null>(initialFlow ?? null);
  const [step, setStep] = useState<Step>(initialFlow ? (initialFlow === "design_first" ? "design" : "blank") : "flow");
  const [design, setDesign] = useState<Design | null>(null);
  const [blank, setBlank] = useState<Blank | null>(null);
  const [colorName, setColorName] = useState<string | null>(null);
  const [placement, setPlacement] = useState<PlacementPreset | null>(null);
  const [collectionId, setCollectionId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [scopeAllDesigns, setScopeAllDesigns] = useState(false);
  const [onlyEligible, setOnlyEligible] = useState(true);

  const designsQ = useDesigns(scopeAllDesigns ? undefined : entity.id);
  const blanksQ = useBlanks();
  const collectionsQ = useCollections();
  const create = useCreateConcept();

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

  // Which surface the operator is currently placing on, so the preview can show
  // the back of the garment when they pick a back placement.
  const surface: Surface = placement?.surface === "back" ? "back" : "front";
  const garmentImage = useMemo(
    () => resolveBlankImage({ blank, colorName, surface }),
    [blank, colorName, surface],
  );

  // Reset the colour when the blank changes; a colour name only means something
  // inside one blank.
  useEffect(() => {
    setColorName(null);
    setPlacement(null);
  }, [blank?.id]);

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
    (step === "placement" && Boolean(placement));

  const goNext = () => {
    const i = order.indexOf(step);
    if (i >= 0 && i < order.length - 1) setStep(order[i + 1]);
  };
  const goBack = () => {
    const i = order.indexOf(step);
    if (i > 0) setStep(order[i - 1]);
  };

  const submit = async () => {
    if (!design && !blank) return;
    try {
      const id = await create.mutateAsync({
        title: title.trim() || "Untitled concept",
        entityId: entity.id,
        organizationId: entity.organizationId,
        designId: design?.id ?? null,
        blankId: blank?.id ?? null,
        collectionId: collectionId || null,
        colorName,
        surface: placement?.surface ?? null,
        zoneId: placement?.zoneId ?? null,
        placementLabel: placement?.label ?? null,
        imageUrl: garmentImage.url,
        notes: notes.trim() || null,
        flow: flow ?? "design_first",
      });
      toast.success("Mockup created", {
        description: "Saved as a product concept. No product was created and nothing was sent to Shopify.",
      });
      onCreated?.(id);
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
            <div className="truncate text-[15px] font-semibold">Create mockup</div>
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
                (s === "placement" && placement);
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
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <Preview blank={blank} image={garmentImage} design={design} placement={placement} />
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                  Front
                </div>
                <div className="mb-4 grid gap-1.5">
                  {presets
                    .filter((p) => p.surface === "front")
                    .map((p) => (
                      <PlacementRow key={p.zoneId} preset={p} active={placement?.zoneId === p.zoneId} onSelect={setPlacement} />
                    ))}
                </div>
                {presets.some((p) => p.surface === "back") && (
                  <>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
                      Back
                    </div>
                    <div className="grid gap-1.5">
                      {presets
                        .filter((p) => p.surface === "back")
                        .map((p) => (
                          <PlacementRow key={p.zoneId} preset={p} active={placement?.zoneId === p.zoneId} onSelect={setPlacement} />
                        ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {step === "confirm" && (
            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <Preview blank={blank} image={garmentImage} design={design} placement={placement} />
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
                  <Line label="Placement" value={placement ? `${placement.surface} · ${placement.label}` : "—"} />
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
          )}
        </div>

        {/* footer */}
        {step !== "flow" && (
          <div className="flex items-center gap-3 border-t border-[hsl(var(--ax-line))] px-4 py-3">
            <div className="min-w-0 flex-1 truncate text-[12px] text-[hsl(var(--ax-faint))]">
              {[design && (cleanDesignTitle(design.title) ?? "Design"), blank?.name, colorName, placement?.label]
                .filter(Boolean)
                .join("  ·  ") || "Nothing chosen yet"}
            </div>
            {step === "confirm" ? (
              <button
                type="button"
                onClick={submit}
                disabled={create.isPending || (!design && !blank)}
                className="rounded-full bg-[hsl(var(--ax-accent))] px-5 py-2 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50"
              >
                {create.isPending ? "Creating…" : "Create mockup"}
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

function PlacementRow({
  preset,
  active,
  onSelect,
}: {
  preset: PlacementPreset;
  active: boolean;
  onSelect: (p: PlacementPreset) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(preset)}
      className={`ax-card flex items-center gap-3 px-3 py-2 text-left text-[13px] transition-all ${
        active ? "ring-2 ring-[hsl(var(--ax-accent))]" : "ax-card-hover"
      }`}
    >
      <span className="relative h-9 w-7 shrink-0 rounded border border-[hsl(var(--ax-border))] bg-white/[0.04]">
        <span
          className="absolute rounded-[1px] bg-[hsl(var(--ax-accent))]"
          style={{
            left: `${preset.x}%`,
            top: `${preset.y}%`,
            width: `${preset.w}%`,
            height: `${preset.h}%`,
          }}
        />
      </span>
      {preset.label}
    </button>
  );
}

function Preview({
  blank,
  image,
  design,
  placement,
}: {
  blank: Blank | null;
  image: ReturnType<typeof resolveBlankImage>;
  design: Design | null;
  placement: PlacementPreset | null;
}) {
  const box = placement ?? presetById("center_chest");
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.04]">
      {image.url ? (
        <img src={image.url} alt={blank?.name ?? "Blank"} className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center text-[12px] text-[hsl(var(--ax-faint))]">
          {blank ? "No photo for this blank yet" : "Choose a blank"}
        </div>
      )}
      {/* Say so when the garment on screen is not the colourway being built.
          Silently showing the wrong colour is how a mockup gets approved and
          then turns out to be something else. */}
      {image.approximate && (
        <span className="absolute right-2 top-2 rounded-full bg-[hsl(var(--ax-amber)/0.9)] px-2 py-1 text-[10px] font-semibold text-black">
          {image.source === "blank" ? "Catalogue photo — not this colour" : "Front photo shown"}
        </span>
      )}
      {design && box && (
        <div
          className="pointer-events-none absolute"
          style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
        >
          <AssetImage
            bucket={design.fileBucket}
            path={design.filePath}
            alt={design.title}
            className="h-full w-full"
            fit="contain"
          />
        </div>
      )}
      {placement && (
        <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
          {placement.surface} · {placement.label}
        </span>
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
