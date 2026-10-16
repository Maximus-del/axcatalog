// Portal lineup — arrange what a client sees in My Gear.
//
// One screen per client: Live / Archive / Not shown, tag collections (their
// lockers), and choose the portal's Front and Back picture — which can differ
// from the website's first two photos — or add new pictures.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpRight, Check, FolderOpen, ImagePlus, Images, Loader2, Plus, RefreshCw, Trash2, WandSparkles, X } from "lucide-react";
import { Chip, EmptyState, ErrorState, PageHeader, Skeleton, TabBar } from "@/components/admin-v2/primitives";
import { useEntityWorkspace } from "@/lib/v2/data";
import { useSetProductCollection } from "@/lib/v2/product-collections";
import type { CollectionOption } from "@/lib/v2/product-collections";
import {
  imageProblem,
  parseDriveFolderId,
  useAddToLineup,
  useDriveSync,
  useSetDriveSources,
  useAddableProducts,
  useClientCollections,
  useClientLineup,
  useRemoveProductImage,
  useSetPortalSide,
  useUploadProductImages,
  type Lifecycle,
  type LineupImage,
  type LineupProduct,
  type Side,
} from "@/lib/v2/lineup";

const TAB_HELP: Record<Lifecycle, string> = {
  live: "On the website. The client sees these under Live.",
  archive: "Off the website, still orderable — reprinted from the design file. The client sees these under Archive.",
  hidden: "Drafts and internal products. The client does not see these until they are published.",
};
const TAB_LABEL: Record<Lifecycle, string> = { live: "Live", archive: "Archive", hidden: "Not shown" };

const btn =
  "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))] disabled:opacity-50";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50";
const inputCls =
  "w-full rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-3xl rounded-2xl border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] p-5">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="flex-1 text-[16px] font-semibold">{title}</h2>
          <button type="button" className={btn} onClick={onClose} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Thumb({ img, label }: { img: LineupImage | null; label: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="aspect-[4/5] overflow-hidden rounded-lg bg-white/[0.04]">
        {img?.url ? <img src={img.url} alt={label} className="h-full w-full object-contain" loading="lazy" /> : <div className="flex h-full items-center justify-center text-[11px] text-[hsl(var(--ax-faint))]">No picture</div>}
      </div>
      <div className="mt-1 text-center text-[10.5px] uppercase tracking-[0.12em] text-[hsl(var(--ax-faint))]">
        {label}
        {img?.portalView && " · chosen"}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ drive */
function syncedLabel(iso: string | null): string {
  if (!iso) return "Not synced yet";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "Synced just now";
  if (mins < 60) return `Synced ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `Synced ${hrs} h ago` : `Synced ${new Date(iso).toLocaleDateString()}`;
}

function DriveSection({ athleteId, product }: { athleteId: string; product: LineupProduct }) {
  const setSources = useSetDriveSources(athleteId);
  const sync = useDriveSync(athleteId);
  const [link, setLink] = useState("");
  const [label, setLabel] = useState("");
  const sources = product.drive?.sources ?? [];
  const busy = setSources.isPending || sync.isPending;

  function runSync() {
    sync.mutate(
      { productId: product.id, force: true },
      {
        onSuccess: (r) => {
          if (!r.configured) return void toast.error("Drive isn't connected yet. Add the Google service account secret in Supabase.");
          const res = r.results?.[0];
          if (res?.error) return void toast.error(res.error);
          toast.success(res ? `Synced — ${res.shown ?? 0} picture${res.shown === 1 ? "" : "s"} from Drive` : "Up to date");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function save(next: typeof sources, then?: () => void) {
    setSources.mutate(
      { productId: product.id, sources: next },
      {
        onSuccess: () => {
          then?.();
          if (next.length) runSync();
          else toast.success("Drive unlinked — the client sees the other pictures again");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  function add() {
    const id = parseDriveFolderId(link);
    if (!id) return void toast.error("Paste a Drive folder link");
    if (sources.some((s) => s.id === id)) return void toast.error("That folder is already linked");
    save([...sources, { id, label: label.trim() || null }], () => {
      setLink("");
      setLabel("");
    });
  }

  return (
    <div className="mb-4 rounded-xl border border-[hsl(var(--ax-line))] p-3">
      <div className="mb-2 flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
        <span className="flex-1 text-[13px] font-semibold">Pictures from Drive</span>
        {sources.length > 0 && (
          <button type="button" className={btn} disabled={busy} onClick={runSync}>
            {sync.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Sync now
          </button>
        )}
      </div>
      {sources.length > 0 ? (
        <>
          <ul className="space-y-1">
            {sources.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 text-[12px]">
                <span className="w-4 text-[hsl(var(--ax-faint))]">{i + 1}</span>
                <a className="min-w-0 flex-1 truncate hover:text-[hsl(var(--ax-accent))]" href={`https://drive.google.com/drive/folders/${s.id}`} target="_blank" rel="noreferrer">
                  {s.label || s.id}
                </a>
                <button type="button" className={btn} disabled={busy} aria-label="Unlink folder" onClick={() => save(sources.filter((x) => x.id !== s.id))}>
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          <p className={`mt-2 text-[11px] ${product.drive?.error ? "text-[hsl(var(--ax-red))]" : "text-[hsl(var(--ax-faint))]"}`}>
            {product.drive?.error ?? `${syncedLabel(product.drive?.syncedAt ?? null)}${product.drive?.shown != null ? ` · ${product.drive.shown} shown` : ""}`}
          </p>
          <p className="mt-1 text-[11px] text-[hsl(var(--ax-faint))]">
            The client sees only these. Link a garment folder (e.g. HOODIE) and every colorway folder inside it comes along, Black first. Files named PREVIEW, FLAT or MODEL show; PRINT and MASTER files never do.
          </p>
        </>
      ) : (
        <p className="mb-2 text-[12px] text-[hsl(var(--ax-secondary))]">Link Drive folders and the portal shows what&apos;s in them — change a file in Drive and the client&apos;s My Gear follows.</p>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_160px_auto]">
        <input className={inputCls} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a Drive folder link" aria-label="Drive folder link" />
        <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" aria-label="Folder label" />
        <button type="button" className={btnPrimary} disabled={busy || !link.trim()} onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Link folder
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pictures */
function PicturesModal({ athleteId, product, onClose }: { athleteId: string; product: LineupProduct; onClose: () => void }) {
  const setSide = useSetPortalSide(athleteId);
  const upload = useUploadProductImages(athleteId);
  const remove = useRemoveProductImage(athleteId);
  const busy = setSide.isPending || upload.isPending || remove.isPending;

  function choose(img: LineupImage, side: Side) {
    const clearing = img.portalView === side;
    setSide.mutate(
      { product, imageId: img.id, side: clearing ? null : side },
      { onSuccess: () => toast.success(clearing ? `${side === "front" ? "Front" : "Back"} back to automatic` : `${side === "front" ? "Front" : "Back"} picture set`), onError: (e) => toast.error(e.message) },
    );
  }

  return (
    <Modal title={`Pictures — ${product.title}`} onClose={onClose}>
      <p className="mb-3 text-[12px] text-[hsl(var(--ax-secondary))]">
        Choose what the client sees as Front and Back in My Gear. This doesn&apos;t change the website. Without a choice, the portal uses the first two photos.
      </p>
      <DriveSection athleteId={athleteId} product={product} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {product.images.map((img) => {
          const isFront = product.front?.id === img.id;
          const isBack = product.back?.id === img.id;
          return (
            <div key={img.id} className={`overflow-hidden rounded-xl border ${img.portalView ? "border-[hsl(var(--ax-accent)/0.6)]" : "border-[hsl(var(--ax-line))]"}`}>
              <div className="relative aspect-square bg-white/[0.04]">
                {img.url && <img src={img.url} alt="" className="h-full w-full object-contain" loading="lazy" />}
                <div className="absolute left-1.5 top-1.5 flex gap-1">
                  {isFront && <Chip tone="var(--ax-accent)">Front</Chip>}
                  {isBack && <Chip tone="var(--ax-blue)">Back</Chip>}
                  {img.fromDrive && <Chip>Drive</Chip>}
                </div>
              </div>
              {img.driveName && (
                <div className="truncate px-2 pt-1.5 text-[10.5px] text-[hsl(var(--ax-faint))]" title={img.driveName}>
                  {[img.driveColor, product.drive?.sources.find((src) => src.id === img.driveFolderId)?.label || (img.driveColor ? null : img.driveName)].filter(Boolean).join(" · ")}
                </div>
              )}
              <div className="flex flex-wrap gap-1 p-2">
                <button type="button" className={btn} disabled={busy} aria-pressed={img.portalView === "front"} onClick={() => choose(img, "front")}>
                  {img.portalView === "front" && <Check className="h-3 w-3" />} Front
                </button>
                <button type="button" className={btn} disabled={busy} aria-pressed={img.portalView === "back"} onClick={() => choose(img, "back")}>
                  {img.portalView === "back" && <Check className="h-3 w-3" />} Back
                </button>
                {img.axUpload && (
                  <button
                    type="button"
                    className={btn}
                    disabled={busy}
                    aria-label="Remove picture"
                    title="Remove this picture"
                    onClick={() => remove.mutate(img, { onSuccess: () => toast.success("Picture removed"), onError: (e) => toast.error(e.message) })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[hsl(var(--ax-border))] text-center text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]">
          {upload.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          Add pictures
          <span className="text-[10.5px] text-[hsl(var(--ax-faint))]">PNG, JPG or WebP</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            disabled={upload.isPending}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              const bad = files.map(imageProblem).find(Boolean);
              if (bad) return void toast.error(bad);
              if (files.length) upload.mutate({ product, files }, { onSuccess: () => toast.success(`${files.length} picture${files.length > 1 ? "s" : ""} added`), onError: (er) => toast.error(er.message) });
            }}
          />
        </label>
      </div>
      <p className="mt-3 text-[11px] text-[hsl(var(--ax-faint))]">
        {product.drive
          ? "Drive is this product's picture source, so pictures added here stay hidden from the client. Add them to the Drive folder instead."
          : "Pictures added here stay in AX and survive Shopify syncs. Website photos can only be changed in Shopify."}
      </p>
    </Modal>
  );
}

/* ------------------------------------------------------------ add product */
function AddProductModal({ athleteId, organizationId, linkedIds, collections, onClose }: { athleteId: string; organizationId: string; linkedIds: string[]; collections: CollectionOption[]; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const addable = useAddableProducts(organizationId, linkedIds, q);
  const add = useAddToLineup(athleteId);
  return (
    <Modal title="Add a product to the lineup" onClose={onClose}>
      <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
        <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this organisation's products" autoFocus aria-label="Search products" />
        <select className={inputCls} value={collectionId} onChange={(e) => setCollectionId(e.target.value)} aria-label="Collection">
          <option value="">No collection</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              Add to {c.label ?? c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto">
        {addable.isLoading ? (
          <Skeleton className="h-24" />
        ) : addable.isError ? (
          <ErrorState error={addable.error} what="products" onRetry={() => addable.refetch()} />
        ) : (addable.data ?? []).length === 0 ? (
          <EmptyState>{q ? "No products match." : "Every product in this organisation is already on the lineup."}</EmptyState>
        ) : (
          (addable.data ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[hsl(var(--ax-line))] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px]">{p.title}</span>
              <Chip>{p.status}</Chip>
              <button
                type="button"
                className={btnPrimary}
                disabled={add.isPending}
                onClick={() =>
                  add.mutate({ productId: p.id, collectionId: collectionId || null }, { onSuccess: () => toast.success(`${p.title} added`), onError: (e) => toast.error(e.message) })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
          ))
        )}
      </div>
      <p className="mt-3 text-[12px] text-[hsl(var(--ax-secondary))]">
        Making something new? Start from a design in the{" "}
        <Link to={`/admin-v2/people/${athleteId}/library`} className="text-[hsl(var(--ax-accent))]">
          client&apos;s library
        </Link>{" "}
        — configure a mockup into a product and pick the collection there. New artwork? Start with the{" "}
        <Link to={`/admin-v2/creative?tab=prompts&owner=${athleteId}`} className="text-[hsl(var(--ax-accent))]">
          production brief
        </Link>
        .
      </p>
    </Modal>
  );
}

/* ------------------------------------------------------------------- card */
function LineupCard({ product, collections, onPictures }: { product: LineupProduct; collections: CollectionOption[]; onPictures: () => void }) {
  const set = useSetProductCollection(product.id);
  const tagged = new Set(product.collectionIds);
  return (
    <div className="rounded-2xl border border-[hsl(var(--ax-line))] bg-[hsl(var(--ax-card))] p-3">
      <div className="flex gap-2">
        <Thumb img={product.front} label="Front" />
        <Thumb img={product.back} label="Back" />
      </div>
      <div className="mt-2 flex items-start gap-2">
        <Link to={`/admin-v2/products/${product.id}`} className="min-w-0 flex-1 text-[13px] font-semibold hover:text-[hsl(var(--ax-accent))]">
          {product.title}
        </Link>
        {product.drive && <Chip tone={product.drive.error ? "var(--ax-red)" : undefined}>Drive</Chip>}
        <button type="button" className={btn} onClick={onPictures}>
          <Images className="h-3.5 w-3.5" /> Pictures
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {collections.map((c) => {
          const on = tagged.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              disabled={set.isPending}
              onClick={() =>
                set.mutate(
                  { collectionId: c.id, on: !on },
                  {
                    onSuccess: () => {
                      toast.success(on ? `Removed from ${c.label ?? c.name}` : `Added to ${c.label ?? c.name}`);
                    },
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-60 ${
                on ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-ink))]" : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-faint))]"
              }`}
            >
              {c.accent && <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.accent }} aria-hidden />}
              {c.label ?? c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- page */
export default function V2Lineup() {
  const { id } = useParams();
  const athleteId = id ?? "";
  const ws = useEntityWorkspace(id);
  const lineup = useClientLineup(id);
  const collections = useClientCollections(id);
  const [tab, setTab] = useState<Lifecycle>("live");
  const [coll, setColl] = useState<string>("all");
  const [pictures, setPictures] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const driveSync = useDriveSync(athleteId);
  const syncOnOpen = driveSync.mutate;

  // Pull the latest from Drive when the lineup opens (the server skips
  // products synced in the last few minutes).
  useEffect(() => {
    if (athleteId) syncOnOpen({});
  }, [athleteId, syncOnOpen]);

  const all = lineup.data ?? [];
  const counts = useMemo(() => ({ live: all.filter((p) => p.lifecycle === "live").length, archive: all.filter((p) => p.lifecycle === "archive").length, hidden: all.filter((p) => p.lifecycle === "hidden").length }), [all]);
  const items = all.filter((p) => p.lifecycle === tab && (coll === "all" || p.collectionIds.includes(coll)));
  const picturesProduct = all.find((p) => p.id === pictures) ?? null;
  const entity = ws.data?.entity;
  const cols = collections.data ?? [];

  return (
    <div>
      <Link to={`/admin-v2/people/${athleteId}`} className="mb-3 inline-block text-[11px] text-[hsl(var(--ax-faint))]">
        ← {entity?.name ?? "Client"}
      </Link>
      <PageHeader
        title="Portal lineup"
        subtitle={`What ${entity?.name ?? "the client"} sees in My Gear — collections and Front / Back pictures.`}
        actions={
          <>
            <Link className={btn} to={`/admin-v2/creative?tab=prompts&owner=${athleteId}`} title="ChatGPT prompt + brief to package a new design for this client">
              <WandSparkles className="h-3.5 w-3.5" /> Production brief
            </Link>
            <a className={btn} href={`/portal/products?as=${athleteId}`} target="_blank" rel="noreferrer">
              Their My Gear <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
            <button type="button" className={btnPrimary} onClick={() => setAdding(true)} disabled={!entity}>
              <Plus className="h-3.5 w-3.5" /> Add product
            </button>
          </>
        }
      />
      <TabBar<Lifecycle> tabs={["live", "archive", "hidden"]} active={tab} onSelect={setTab} label={(t) => `${TAB_LABEL[t]} · ${counts[t]}`} />
      <p className="-mt-3 mb-4 text-[12px] text-[hsl(var(--ax-faint))]">{TAB_HELP[tab]}</p>
      {cols.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Chip active={coll === "all"} onClick={() => setColl("all")}>
            All
          </Chip>
          {cols.map((c) => (
            <Chip key={c.id} active={coll === c.id} onClick={() => setColl(c.id)}>
              {c.label ?? c.name}
            </Chip>
          ))}
        </div>
      )}
      {lineup.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : lineup.isError ? (
        <ErrorState error={lineup.error} what="the lineup" onRetry={() => lineup.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState>{coll === "all" ? `No ${TAB_LABEL[tab].toLowerCase()} products.` : "Nothing in this collection here yet — tag products into it from their cards."}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((p) => (
            <LineupCard key={p.id} product={p} collections={cols} onPictures={() => setPictures(p.id)} />
          ))}
        </div>
      )}
      {picturesProduct && <PicturesModal athleteId={athleteId} product={picturesProduct} onClose={() => setPictures(null)} />}
      {adding && entity && (
        <AddProductModal athleteId={athleteId} organizationId={entity.organizationId} linkedIds={all.map((p) => p.id)} collections={cols} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}
