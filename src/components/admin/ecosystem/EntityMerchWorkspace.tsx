// The merch workspace — what you see when you open any entity.
//
// A profile with twelve mockups and no Shopify products is not empty; it is a
// creative board that hasn't become commerce yet. So this leads with imagery:
// collections with real thumbnails, concepts as full-size cards, designs, and
// live products last. A concept looks like a good product card with a quieter
// status line, never like a broken one.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  FolderPlus, Images, Plus, Loader2, CheckSquare, Square, Send, X, Package, Palette, ExternalLink,
  Lightbulb, ArrowUpCircle, GripVertical, Trash2, FileImage, Layers,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createCollection } from "@/lib/ecosystem/commerce";
import { lifecycleOf, shopifyProductUrl, toProductLike, type ProductLike } from "@/lib/ecosystem/merch";
import { displayNameOf, hasRole, type EntityLike } from "@/lib/ecosystem/entity";
import { ProductStatusChip, PendingClock } from "@/components/admin/ecosystem/ProductStatusChip";

import { useSignedUrls, storageKey } from "@/hooks/useSignedUrls";
import { useDragReorder } from "@/hooks/useDragReorder";
import {
  saveConceptOrder, saveMockupOrder, saveInspirationOrder,
  promoteMockupToConcept, removeInspiration, inspirationUrl, type InspirationImage,
} from "@/lib/ecosystem/board";
import { CHECKERBOARD, ImageLightbox, type LightboxItem } from "@/components/admin/ecosystem/ImageLightbox";
import { CreatePngDialog } from "@/components/admin/ecosystem/CreatePngDialog";
import { productionPngState } from "@/lib/ecosystem/prompts";
import { backState, type BackTarget } from "@/hooks/useBackTarget";
import { ApplyToBlanksDialog } from "@/components/admin/ecosystem/ApplyToBlanksDialog";
import { Input } from "@/components/ui/input";

export interface WorkspaceProduct {
  id: string;
  title: string;
  price: number | null;
  status: string;
  description?: string | null;
  blank_id?: string | null;
  updated_at?: string | null;
  approval_state?: string | null;
  shopify_product_id?: string | null;
  shopify_handle?: string | null;
  shopify_sync_status?: string | null;
  shopify_last_synced_at?: string | null;
  metadata?: Record<string, unknown> | null;
  images: { storage_path: string; storage_bucket: string }[];
  designs?: { design_id: string }[];
  collection_ids?: string[];
}

export interface WorkspaceDesign {
  id: string;
  title: string;
  status: string;
  files: { storage_path: string; storage_bucket: string }[];
}

export interface WorkspaceMockup {
  id: string;
  title: string;
  shot_type: string | null;
  status: string;
  storage_bucket: string | null;
  storage_path: string | null;
}

export interface WorkspaceCollection {
  id: string;
  name: string;
  description: string | null;
  status: string;
  product_count: number;
}

function imageUrl(bucket: string, path: string): string | null {
  if (!bucket || !path) return null;
  if (bucket === "external") return path;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

function productImage(p: WorkspaceProduct): string | null {
  const img = p.images?.[0];
  return img ? imageUrl(img.storage_bucket, img.storage_path) : null;
}

/** The label an approval request should carry — the entity decides the wording. */
export function approvalLabelFor(entity: EntityLike): string {
  if (hasRole(entity, "athlete")) return "Send to athlete";
  if (hasRole(entity, "client")) return "Send to client";
  return "Send for approval";
}

export function EntityMerchWorkspace({
  entity, teamId, backTo, products, designs, mockups, inspiration, collections, onChanged, onAddProduct, onUploadConcepts, onAddDesign, onCreateCollection, onAddMockups, onAddInspiration,
}: {
  entity: EntityLike & { id: string; organization_id: string };
  teamId?: string | null;
  /** Where the detail pages this board links into should send you back to. */
  backTo?: BackTarget;
  products: WorkspaceProduct[];
  designs: WorkspaceDesign[];
  mockups: WorkspaceMockup[];
  inspiration: InspirationImage[];
  collections: WorkspaceCollection[];
  onChanged: () => void;
  onAddProduct: () => void;
  onUploadConcepts: () => void;
  onAddDesign: () => void;
  onCreateCollection: () => void;
  onAddMockups: () => void;
  onAddInspiration: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [namingCollection, setNamingCollection] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [pngFor, setPngFor] = useState<{ product: WorkspaceProduct; url: string | null } | null>(null);
  const [applyDesign, setApplyDesign] = useState<{ id: string; title: string; url: string } | null>(null);

  const name = displayNameOf(entity);

  // design-files and mockups are private buckets — these need signing or the
  // thumbnails silently render as blanks.
  const privateFiles = useMemo(
    () => [
      ...designs.flatMap((d) => d.files ?? []),
      ...mockups.map((m) => ({ storage_bucket: m.storage_bucket, storage_path: m.storage_path })),
    ],
    [designs, mockups],
  );
  const signed = useSignedUrls(privateFiles);

  // Concepts and in-progress items on one board; anything live moves to commerce.
  const { concepts, live } = useMemo(() => {
    const c: WorkspaceProduct[] = [];
    const l: WorkspaceProduct[] = [];
    for (const p of products) {
      (lifecycleOf(toProductLike(p)) === "live" ? l : c).push(p);
    }
    return { concepts: c, live: l };
  }, [products]);

  // Board order is committed on drop; the grid reorders live while dragging.
  const conceptDrag = useDragReorder(concepts, async (ordered) => {
    try {
      await saveConceptOrder(entity.id, ordered.map((p) => p.id));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save order");
    }
  });

  const mockupDrag = useDragReorder(mockups, async (ordered) => {
    try {
      await saveMockupOrder(ordered.map((m) => m.id));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save order");
    }
  });

  const inspirationDrag = useDragReorder(inspiration, async (ordered) => {
    try {
      await saveInspirationOrder(ordered.map((i) => i.id));
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save order");
    }
  });

  /** A mockup that turned out to be a product idea, promoted without losing the original. */
  async function promote(m: WorkspaceMockup) {
    setBusy(true);
    try {
      await promoteMockupToConcept({
        organization_id: entity.organization_id,
        athlete_id: entity.id,
        mockup: m,
        team_id_at_release: teamId ?? null,
      });
      toast.success(`${m.title} is now a concept`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not promote");
    } finally { setBusy(false); }
  }

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function addSelectedToCollection(collectionId: string) {
    setBusy(true);
    try {
      const rows = selected.map((product_id, i) => ({ collection_id: collectionId, product_id, sort_order: i }));
      const { error } = await supabase.from("collection_products" as never).upsert(rows as never, { onConflict: "collection_id,product_id" });
      if (error) throw error;
      toast.success(`${selected.length} added`);
      setSelected([]);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  async function createCollectionFromSelection() {
    if (newName.trim().length < 2) return;
    setBusy(true);
    try {
      const collectionId = await createCollection({
        organization_id: entity.organization_id,
        athlete_id: entity.id,
        name: newName,
      });
      const rows = selected.map((product_id, i) => ({ collection_id: collectionId, product_id, sort_order: i }));
      if (rows.length) {
        const { error } = await supabase.from("collection_products" as never).insert(rows as never);
        if (error) throw error;
      }
      toast.success(`${newName} created with ${selected.length} item${selected.length === 1 ? "" : "s"}`);
      setSelected([]);
      setNamingCollection(false);
      setNewName("");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  /** Approval is on the visual — the entity is agreeing to the idea, not a SKU. */
  async function sendSelectedForApproval() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("products" as never)
        .update({ approval_state: "pending", updated_at: new Date().toISOString() } as never)
        .in("id", selected);
      if (error) throw error;
      toast.success(`${selected.length} sent for approval`);
      setSelected([]);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-8 pb-24">
      {/* COLLECTIONS */}
      <section className="space-y-3">
        <SectionHead
          title="Collections"
          count={collections.length}
          action={<HeadAction onClick={onCreateCollection} icon={<FolderPlus className="h-3.5 w-3.5" />}>Create collection</HeadAction>}
        />
        {collections.length === 0 ? (
          <Empty
            text={`No collections yet for ${name}.`}
            hint="A collection is the permanent creative family — it can hold concepts long before any of them are real products."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {collections.map((c) => {
              const inCollection = products.filter((p) => p.collection_ids?.includes(c.id));
              const thumbs = inCollection.map(productImage).filter(Boolean).slice(0, 4) as string[];
              const approved = inCollection.filter((p) => p.approval_state === "approved").length;
              const liveCount = inCollection.filter((p) => !!p.shopify_product_id).length;
              return (
                <Link
                  key={c.id}
                  to={`/admin/collections/${c.id}`}
                  state={backTo ? backState(backTo) : undefined}
                  className="ax-card-hover block"
                >
                  <div className="grid grid-cols-2 gap-1 rounded-[10px] overflow-hidden h-32">
                    {thumbs.length > 0 ? (
                      thumbs.map((t, i) => (
                        <span key={i} className={`block ${thumbs.length === 1 ? "col-span-2" : ""}`} style={CHECKERBOARD}>
                          <img src={t} alt="" className="h-full w-full object-cover" />
                        </span>
                      ))
                    ) : (
                      <span className="col-span-2 bg-[hsl(var(--ax-line))] flex items-center justify-center">
                        <Images className="h-5 w-5 text-[hsl(var(--ax-faint))]" />
                      </span>
                    )}
                  </div>
                  <div className="mt-3 font-semibold truncate">{c.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                    {inCollection.length} item{inCollection.length === 1 ? "" : "s"} · {approved} approved · {liveCount} live
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* CONCEPTS */}
      <section className="space-y-3">
        <SectionHead
          title="Product concepts"
          count={concepts.length}
          action={
            <>
              <HeadAction onClick={onUploadConcepts} icon={<Images className="h-3.5 w-3.5" />}>Upload concepts</HeadAction>
              <HeadAction onClick={onAddProduct} icon={<Plus className="h-3.5 w-3.5" />}>Add product</HeadAction>
            </>
          }
        />
        {concepts.length === 0 ? (
          <Empty
            text={`No concepts yet for ${name}.`}
            hint="Drop in mockups — they become items you can collect and get approved before any commerce setup."
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {conceptDrag.items.map((p, index) => {
              const url = productImage(p);
              const like = toProductLike(p);
              const on = selected.includes(p.id);
              const png = productionPngState(p);
              return (
                <div
                  key={p.id}
                  {...conceptDrag.itemProps(index)}
                  className={`ax-card p-2.5 relative transition-opacity ${on ? "ring-2 ring-[hsl(var(--ax-accent))]" : ""} ${
                    conceptDrag.draggingIndex === index ? "opacity-50" : ""
                  }`}
                >
                  <span className="absolute bottom-3.5 right-3.5 z-10 cursor-grab active:cursor-grabbing text-white/60" title="Drag to reorder">
                    <GripVertical className="h-4 w-4 drop-shadow" />
                  </span>
                  <button
                    onClick={() => toggle(p.id)}
                    className="absolute top-3.5 left-3.5 z-10 text-white drop-shadow"
                    aria-label={on ? "Deselect" : "Select"}
                  >
                    {on ? <CheckSquare className="h-5 w-5 text-[hsl(var(--ax-accent))]" /> : <Square className="h-5 w-5 opacity-70" />}
                  </button>
                  <span className="absolute top-3.5 right-3.5 z-10"><PendingClock product={like} /></span>
                  <Link
                    to={`/admin/products/${p.id}`}
                    state={backTo ? backState(backTo) : undefined}
                    className="block aspect-square rounded-md overflow-hidden"
                    style={CHECKERBOARD}
                  >
                    {url ? (
                      <img src={url} alt={p.title} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="h-full w-full flex items-center justify-center bg-[hsl(var(--ax-line))]">
                        <Package className="h-5 w-5 text-[hsl(var(--ax-faint))]" />
                      </span>
                    )}
                  </Link>
                  <div className="mt-2 text-[13px] font-semibold truncate">{p.title}</div>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <ProductStatusChip product={like} />
                    {p.price != null && <span className="text-[11px] text-muted-foreground">${Number(p.price).toFixed(0)}</span>}
                  </div>
                  {/* The print file is a separate question from the product's
                      lifecycle — a concept can be approved and still have no
                      artwork to send to production. */}
                  <div className="mt-1.5 pt-1.5 border-t border-[hsl(var(--ax-border))] flex items-center justify-between gap-1">
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                      png === "ready" ? "text-[hsl(var(--ax-accent))]" : "text-[hsl(var(--ax-faint))]"
                    }`}>
                      PNG {png}
                    </span>
                    {png === "ready" ? (
                      <Link
                        to={`/admin/designs/${p.designs![0].design_id}`}
                        state={backTo ? backState(backTo) : undefined}
                        className="text-[11px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1"
                      >
                        <FileImage className="h-3 w-3" /> View PNG
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPngFor({ product: p, url })}
                        className="text-[11px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1"
                      >
                        <FileImage className="h-3 w-3" /> Create PNG
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MOCKUPS */}
      <section className="space-y-3">
        <SectionHead
          title="Mockups"
          count={mockups.length}
          action={<HeadAction onClick={onAddMockups} icon={<Images className="h-3.5 w-3.5" />}>Upload mockups</HeadAction>}
        />
        {mockups.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Presentation imagery — flat lays, on-model shots, lookbook frames. Not tied to a product until you attach one.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {mockupDrag.items.map((m, i) => {
              const url = signed[storageKey(m)] ?? null;
              return (
                <div
                  key={m.id}
                  {...mockupDrag.itemProps(i)}
                  className={`ax-card p-2 relative group ${mockupDrag.draggingIndex === i ? "opacity-50" : ""}`}
                >
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); promote(m); }}
                    disabled={busy}
                    className="absolute top-3 right-3 z-10 h-6 w-6 rounded-full bg-black/75 flex items-center justify-center opacity-0 group-hover:opacity-100 disabled:opacity-40"
                    title="Make this a product concept"
                  >
                    <ArrowUpCircle className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightbox(i)}
                    className="block w-full text-left"
                    title="Click to view full size"
                  >
                  <span className="block aspect-square rounded-md overflow-hidden" style={CHECKERBOARD}>
                    {url ? (
                      <img src={url} alt={m.title} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="h-full w-full flex items-center justify-center bg-[hsl(var(--ax-line))]">
                        <Images className="h-4 w-4 text-[hsl(var(--ax-faint))]" />
                      </span>
                    )}
                  </span>
                  <div className="mt-1.5 text-[12px] font-semibold truncate">{m.title}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {(m.shot_type ?? "").replace(/_/g, " ") || m.status}
                  </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* DESIGNS */}
      <section className="space-y-3">
        <SectionHead
          title="Designs"
          count={designs.length}
          action={<HeadAction onClick={onAddDesign} icon={<Palette className="h-3.5 w-3.5" />}>Add design</HeadAction>}
        />
        {designs.length === 0 ? (
          <Empty text="No designs yet." hint="Final artwork — transparent PNG, isolated, reusable across many products." />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {designs.map((d) => {
              const f = d.files?.[0];
              const url = f ? signed[storageKey(f)] ?? null : null;
              return (
                <div key={d.id} className="ax-card p-2 group">
                  <Link
                    to={`/admin/designs/${d.id}`}
                    state={backTo ? backState(backTo) : undefined}
                    className="block"
                  >
                    <span className="block aspect-square rounded-md overflow-hidden" style={CHECKERBOARD}>
                      {url ? (
                        <img src={url} alt={d.title} loading="lazy" className="h-full w-full object-contain" />
                      ) : (
                        <span className="h-full w-full flex items-center justify-center bg-[hsl(var(--ax-line))]">
                          <Palette className="h-4 w-4 text-[hsl(var(--ax-faint))]" />
                        </span>
                      )}
                    </span>
                    <div className="mt-1.5 text-[12px] font-semibold truncate">{d.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.status}</div>
                  </Link>
                  {/* The step that was missing: a finished design becoming
                      products, without six trips through the product form. */}
                  <button
                    type="button"
                    disabled={!url}
                    onClick={() => url && setApplyDesign({ id: d.id, title: d.title, url })}
                    title={url ? "Put this on garments" : "No artwork file to place"}
                    className="mt-1 w-full h-7 rounded-md text-[11px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center justify-center gap-1 hover:bg-[hsl(var(--ax-accent)/0.1)] disabled:opacity-40"
                  >
                    <Layers className="h-3 w-3" /> Put on garments
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* INSPIRATION — what we looked at, kept apart from what we made */}
      <section className="space-y-3">
        <SectionHead
          title="Inspiration"
          count={inspiration.length}
          action={<HeadAction onClick={onAddInspiration} icon={<Lightbulb className="h-3.5 w-3.5" />}>Add inspiration</HeadAction>}
        />
        {inspiration.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Reference imagery you drew from — kept here so you can check later that the finished work didn't land too
            close to it. Never shown to clients.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
            {inspirationDrag.items.map((img, i) => {
              const url = inspirationUrl(img);
              return (
                <div
                  key={img.id}
                  {...inspirationDrag.itemProps(i)}
                  className={`relative group aspect-square ${inspirationDrag.draggingIndex === i ? "opacity-50" : ""}`}
                >
                  <a
                    href={url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full w-full rounded overflow-hidden border border-[hsl(var(--ax-border))]"
                    style={CHECKERBOARD}
                    title={img.title ?? "Inspiration"}
                  >
                    {url && <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  </a>
                  <button
                    onClick={async () => { await removeInspiration(img.id); onChanged(); }}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/85 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* LIVE — small when empty, because zero live products is normal early on */}
      <section className="space-y-3">
        <SectionHead title="Live products" count={live.length} />
        {live.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Approved products appear here once published to Shopify.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {live.map((p) => {
              const url = productImage(p);
              const shop = shopifyProductUrl(p.shopify_handle);
              return (
                <div key={p.id} className="ax-card p-2.5">
                  <Link
                    to={`/admin/products/${p.id}`}
                    state={backTo ? backState(backTo) : undefined}
                    className="block aspect-square rounded-md overflow-hidden"
                    style={CHECKERBOARD}
                  >
                    {url && <img src={url} alt={p.title} loading="lazy" className="h-full w-full object-cover" />}
                  </Link>
                  <div className="mt-2 text-[13px] font-semibold truncate">{p.title}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-muted-foreground">
                      {p.price != null ? `$${Number(p.price).toFixed(0)}` : "—"}
                    </span>
                    {shop && (
                      <a href={shop} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" /> View
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {applyDesign && (
        <ApplyToBlanksDialog
          entity={{ id: entity.id, organization_id: entity.organization_id, name }}
          design={applyDesign}
          teamId={teamId}
          onClose={() => setApplyDesign(null)}
          onCreated={onChanged}
        />
      )}

      {pngFor && (
        <CreatePngDialog
          entity={{ id: entity.id, organization_id: entity.organization_id }}
          product={{ id: pngFor.product.id, title: pngFor.product.title }}
          sourceUrl={pngFor.url}
          onClose={() => setPngFor(null)}
          onCreated={onChanged}
        />
      )}

      {lightbox !== null && (
        <ImageLightbox
          items={mockups
            .map((m) => ({ id: m.id, url: signed[storageKey(m)] ?? "", title: m.title }))
            .filter((i) => i.url) as LightboxItem[]}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* BULK BAR */}
      {selected.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 ax-card px-4 py-3 shadow-xl flex items-center gap-3 flex-wrap max-w-[95vw]">
          <span className="text-[13px] font-semibold tabular-nums">{selected.length} selected</span>

          {namingCollection ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createCollectionFromSelection(); }}
                placeholder="Collection name"
                className="h-8 w-56 text-[13px]"
              />
              <button
                onClick={createCollectionFromSelection}
                disabled={busy || newName.trim().length < 2}
                className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}
              </button>
              <button onClick={() => setNamingCollection(false)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setNamingCollection(true)}
                className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5"
              >
                <FolderPlus className="h-3.5 w-3.5" /> Create collection
              </button>

              {collections.length > 0 && (
                <select
                  onChange={(e) => { if (e.target.value) addSelectedToCollection(e.target.value); e.target.value = ""; }}
                  disabled={busy}
                  className="h-8 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent text-[12px] px-2"
                  defaultValue=""
                >
                  <option value="">Add to collection…</option>
                  {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}

              <button
                onClick={sendSelectedForApproval}
                disabled={busy}
                className="h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Send className="h-3.5 w-3.5" /> {approvalLabelFor(entity)}
              </button>

              <button onClick={() => setSelected([])} className="text-muted-foreground hover:text-foreground" aria-label="Clear selection">
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHead({ title, count, action }: { title: string; count: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="ax-section-header flex items-center gap-2">
        <span>{title}</span>
        <span className="text-muted-foreground normal-case tracking-normal text-xs">({count})</span>
      </div>
      <div className="flex items-center gap-3">{action}</div>
    </div>
  );
}

function HeadAction({ onClick, icon, children }: { onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold text-[hsl(var(--ax-accent))] hover:underline inline-flex items-center gap-1 whitespace-nowrap"
    >
      {icon} {children}
    </button>
  );
}

function Empty({ text, hint }: { text: string; hint: string }) {
  return (
    <div className="ax-card p-6 text-center space-y-1">
      <div className="text-sm text-muted-foreground">{text}</div>
      <div className="text-xs text-[hsl(var(--ax-faint))] max-w-[60ch] mx-auto">{hint}</div>
    </div>
  );
}
