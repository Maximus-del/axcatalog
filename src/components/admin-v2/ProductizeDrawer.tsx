import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useBlanks, useCreateProductFromConcept, useMockupPlacements } from "@/lib/v2/data";
import { buildProductDraft, draftGaps, draftSlug, type ProductDraft } from "@/lib/v2/productize";
import { audienceForRoles, fmtMoney, fmtPct, marginFor, priceFor } from "@/lib/v2/pricing";
import type { Collection, Design, Entity, ProductConcept } from "@/lib/v2/types";
import { AssetImage, Chip } from "./primitives";

// Mockup -> Product, without leaving the athlete's workspace.
//
// Everything here is pre-filled from the concept's own lineage and the blank's
// commerce facts. The operator edits what they disagree with; they never retype
// what AX already knows.

export default function ProductizeDrawer({
  entity,
  concept,
  design,
  collections,
  onClose,
  onCreated,
}: {
  entity: Entity;
  concept: ProductConcept;
  design: Design | null;
  collections: Collection[];
  onClose: () => void;
  onCreated?: (productId: string) => void;
}) {
  const blanksQ = useBlanks();
  const create = useCreateProductFromConcept(entity.id, entity.organizationId);
  const audience = audienceForRoles(entity.roles);

  const blank = useMemo(
    () => (blanksQ.data ?? []).find((b) => b.id === concept.blankId) ?? null,
    [blanksQ.data, concept.blankId],
  );
  const collectionName = collections.find((c) => c.id === concept.collectionId)?.name ?? null;

  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [allColors, setAllColors] = useState(false);

  // Read the real arrangement rather than the concept row's single headline
  // placement: a two-sided mockup carries two, and saying "1 placement" about
  // it would undersell exactly the work being preserved.
  const placementsQ = useMockupPlacements(concept.id);
  const placementSummary = useMemo(() => {
    const rows = placementsQ.data ?? [];
    if (rows.length === 0) return "The placement comes across as saved";
    const surfaces = [...new Set(rows.map((r) => r.surface))];
    return `${rows.length} placement${rows.length === 1 ? "" : "s"} (${surfaces.join(" and ")}) copied exactly`;
  }, [placementsQ.data]);

  // Rebuild when the blank finally loads, or when the colour scope changes.
  useEffect(() => {
    setDraft((prev) => {
      const next = buildProductDraft({ entity, concept, blank, design, collectionName, audience, allColors });
      // Preserve what the operator has already typed.
      if (!prev) return next;
      return { ...next, title: prev.title, price: prev.price, slug: prev.slug };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blank?.id, allColors]);

  if (!draft) return null;

  const gaps = draftGaps(draft);
  const margin = blank ? marginFor(blank, audience) : null;

  const submit = async () => {
    try {
      const id = await create.mutateAsync(draft);
      toast.success("Product created — it starts as a draft", {
        description: "Artwork, placement and the mockup's image came with it. Nothing has gone to Shopify.",
      });
      onCreated?.(id);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create the product";
      toast.error(msg.includes("duplicate") ? "A product with that name already exists — change the name." : msg);
    }
  };

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="admin-os relative flex h-full w-full max-w-lg flex-col border-l border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-canvas))] text-[hsl(var(--ax-ink))]">
        <div className="flex items-center gap-3 border-b border-[hsl(var(--ax-line))] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Graduate to a product</div>
            <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
              {entity.name} · from “{concept.title}”
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-touch p-4">
          {/*
            WHAT COMES WITH IT, SAID BEFORE ANYTHING IS ASKED FOR.

            The creative work is done — artwork, garment, colour and the exact
            placement are all decided and all carried over. An operator who is
            not told that reasonably assumes a product means starting again,
            and the fields below stop reading as "confirm this" and start
            reading as "re-enter this".
          */}
          <div className="mb-4 flex gap-3">
            <AssetImage
              url={concept.imageUrl}
              bucket={concept.imageBucket}
              path={concept.imagePath}
              alt={concept.title}
              className="h-24 w-24 shrink-0 rounded-xl bg-white/[0.03]"
              fit="contain"
            />
            <div className="min-w-0 flex-1 space-y-1 text-[12px]">
              <Line label="Design" value={design?.title ?? "—"} />
              <Line label="Blank" value={blank?.name ?? "not set on this mockup"} />
              <Line label="Colour" value={concept.colorName ?? "—"} />
              <Line label="Owner" value={entity.name} />
            </div>
          </div>

          <div className="mb-5 rounded-xl border border-[hsl(var(--ax-accent)/0.35)] bg-[hsl(var(--ax-accent)/0.06)] px-3 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-accent))]">
              Carried over, not rebuilt
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--ax-secondary))]">
              {placementSummary}. The artwork, the garment and the colourway come with it, the mockup's image becomes
              the product's, and the product keeps a link back to the mockup it came from.
            </p>
            <p className="mt-1.5 text-[11px] text-[hsl(var(--ax-faint))]">
              What is left is the commerce side — everything below.
            </p>
          </div>

          <Field label="Name">
            <input
              value={draft.title}
              onChange={(e) =>
                setDraft({ ...draft, title: e.target.value, slug: draftSlug(e.target.value, concept.id) })
              }
              className="w-full rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
            />
          </Field>

          <Field label={`Price · ${audience} tier`}>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                value={draft.price ?? ""}
                onChange={(e) => setDraft({ ...draft, price: e.target.value === "" ? null : Number(e.target.value) })}
                className="w-32 rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2 text-[13px] tabular-nums outline-none focus:border-[hsl(var(--ax-accent))]"
              />
              {blank && (
                <span className="text-[11px] text-[hsl(var(--ax-faint))]">
                  blank cost {fmtMoney(blank.cost)} · tier {fmtMoney(priceFor(blank, audience))}
                  {margin != null && ` · margin ${fmtPct(margin)}`}
                </span>
              )}
            </div>
          </Field>

          {blank && blank.colors.length > 0 && (
            <Field label={`Colours (${draft.colors.length})`}>
              <div className="mb-2">
                <Chip active={allColors} onClick={() => setAllColors(!allColors)}>
                  {allColors ? "All available colours" : "Just this colourway"}
                </Chip>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {blank.colors.map((c) => (
                  <Chip
                    key={c.id}
                    active={draft.colors.includes(c.name)}
                    onClick={() => setDraft({ ...draft, colors: toggle(draft.colors, c.name) })}
                  >
                    {c.name}
                  </Chip>
                ))}
              </div>
            </Field>
          )}

          {blank && blank.sizes.length > 0 && (
            <Field label={`Sizes (${draft.sizes.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {blank.sizes.map((s) => (
                  <Chip
                    key={s}
                    active={draft.sizes.includes(s)}
                    onClick={() => setDraft({ ...draft, sizes: toggle(draft.sizes, s) })}
                  >
                    {s}
                  </Chip>
                ))}
              </div>
            </Field>
          )}

          <Field label="Collection">
            <select
              value={draft.collectionId ?? ""}
              onChange={(e) => setDraft({ ...draft, collectionId: e.target.value || null })}
              className="w-full rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
            >
              <option value="">No collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Description">
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={3}
              className="w-full resize-none rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]"
            />
          </Field>

          <p className="text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
            The product is created as a <strong>draft</strong> and linked back to this mockup, so the trail from artwork
            to storefront stays intact. Nothing is sent to Shopify — approval and publishing stay separate steps.
          </p>
        </div>

        <div className="flex items-center gap-3 border-t border-[hsl(var(--ax-line))] px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-[12px] text-[hsl(var(--ax-faint))]">
            {gaps.length > 0 ? `Still needs ${gaps.join(", ")}` : `${draft.colors.length} colours · ${draft.sizes.length} sizes`}
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={gaps.length > 0 || create.isPending}
            className="rounded-full bg-[hsl(var(--ax-accent))] px-5 py-2 text-[13px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-40"
          >
            {create.isPending ? "Creating…" : "Create product"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ax-secondary))]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-16 shrink-0 text-[hsl(var(--ax-faint))]">{label}</span>
      <span className="min-w-0 flex-1 truncate">{value}</span>
    </div>
  );
}
