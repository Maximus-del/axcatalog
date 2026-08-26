import { useEffect, useMemo, useState } from "react";
import { X, Check, ArrowLeft, Upload } from "lucide-react";
import { toast } from "sonner";
import { useBlanks, useCollections, useCreateConcept, useDesigns } from "@/lib/v2/data";
import { presetsFor, presetById, type PlacementPreset } from "@/lib/v2/placements";
import { audienceForRoles, fmtMoney, hasAccess, priceFor } from "@/lib/v2/pricing";
import { cleanDesignTitle, suggestTitle } from "@/lib/v2/concepts";
import { AssetImage, Chip, Skeleton } from "./primitives";
import type { Blank, Design, Entity } from "@/lib/v2/types";

// The V2 product-creation proof.
//
// Two directions, one destination (§15): Design → Blank → Colour → Placement,
// or Blank → Colour → Design → Placement. The result is a Product Concept that
// keeps every relationship it was built from — no Shopify, no variants, no
// pricing required.

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
  const presets = presetsFor(blank?.garmentType);

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
        imageUrl: color?.imageUrl ?? blank?.imageUrl ?? null,
        notes: notes.trim() || null,
        flow: flow ?? "design_first",
      });
      toast.success("Product concept created");
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
            <div className="truncate text-[15px] font-semibold">New product concept</div>
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
              {designsQ.isLoading ? (
                <GridSkeleton />
              ) : (designsQ.data ?? []).length === 0 ? (
                <p className="py-10 text-center text-[13px] text-[hsl(var(--ax-faint))]">
                  No designs linked to this entity yet. Switch to “All designs”.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
                  {(designsQ.data ?? []).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setDesign(d);
                        goNext();
                      }}
                      className={`ax-card ax-card-hover overflow-hidden p-0 text-left transition-all ${
                        design?.id === d.id ? "ring-2 ring-[hsl(var(--ax-accent))]" : ""
                      }`}
                    >
                      <AssetImage
                        bucket={d.fileBucket}
                        path={d.filePath}
                        alt={d.title}
                        className="aspect-square w-full bg-black/30"
                        fit="contain"
                      />
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
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
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
                      <AssetImage url={b.imageUrl} alt={b.name} className="aspect-square w-full bg-white/[0.03]" fit="contain" />
                      <div className="p-2">
                        <div className="truncate text-[11px] font-medium">{b.name}</div>
                        <div className="truncate text-[10px] text-[hsl(var(--ax-faint))]">
                          {[b.brand, b.styleNumber].filter(Boolean).join(" · ")}
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[10px]">
                          <span className="text-[hsl(var(--ax-accent))]">{fmtMoney(priceFor(b, audience))}</span>
                          <span className="text-[hsl(var(--ax-faint))]">{b.colors.length} colours</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === "color" && blank && (
            <>
              <p className="mb-3 text-[12px] text-[hsl(var(--ax-faint))]">
                {blank.colors.length} colours on {blank.name}.
              </p>
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6 lg:grid-cols-8">
                {blank.colors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setColorName(c.name);
                      goNext();
                    }}
                    className={`ax-card ax-card-hover overflow-hidden p-0 text-left transition-all ${
                      colorName === c.name ? "ring-2 ring-[hsl(var(--ax-accent))]" : ""
                    }`}
                  >
                    {c.imageUrl ? (
                      <AssetImage url={c.imageUrl} alt={c.name} className="aspect-square w-full bg-white/[0.03]" fit="contain" />
                    ) : (
                      <div className="aspect-square w-full" style={{ background: c.hex ?? "#333" }} />
                    )}
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
              <Preview blank={blank} colorUrl={color?.imageUrl ?? blank?.imageUrl ?? null} design={design} placement={placement} />
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
              <Preview blank={blank} colorUrl={color?.imageUrl ?? blank?.imageUrl ?? null} design={design} placement={placement} />
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
                {create.isPending ? "Creating…" : "Create concept"}
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
  colorUrl,
  design,
  placement,
}: {
  blank: Blank | null;
  colorUrl: string | null;
  design: Design | null;
  placement: PlacementPreset | null;
}) {
  const box = placement ?? presetById("center_chest");
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[420px] overflow-hidden rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.04]">
      {colorUrl ? (
        <img src={colorUrl} alt={blank?.name ?? "Blank"} className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center text-[12px] text-[hsl(var(--ax-faint))]">
          {blank ? "No photo for this blank yet" : "Choose a blank"}
        </div>
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
