// "Collection wall" — what stands on this client's home page, and in what order.
//
// One row per collection: its pictures (one = a single plaque, several = a
// fanned deck), the name the client reads, a small caption, whether it shows,
// and its place in the line. Products are put INTO a collection from Portal
// lineup or a product's page; this card only dresses the wall.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ImagePlus, LayoutGrid, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useCollectionWall, useSaveWallItem, type WallItem } from "@/lib/v2/collection-wall";
import { useCreateCollection } from "@/lib/v2/data";
import { uploadPortalAsset } from "@/lib/v2/portal-assets";

const input =
  "w-full rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2.5 py-1.5 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]";
const btn =
  "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))] disabled:opacity-40";

type Draft = WallItem & { live: boolean };

function WallRow({
  entityId,
  item,
  index,
  count,
  onMove,
}: {
  entityId: string;
  item: WallItem;
  index: number;
  count: number;
  onMove: (dir: -1 | 1) => void;
}) {
  const initial = useMemo<Draft>(() => ({ ...item, live: item.status === "active" && !item.hidden }), [item]);
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const save = useSaveWallItem(entityId);
  useEffect(() => setD(initial), [initial]);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) urls.push(await uploadPortalAsset(entityId, "plaque", f));
      setD((x) => ({ ...x, images: [...x.images, ...urls].slice(0, 6) }));
    } catch (e) {
      toast.error("Upload failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  const shift = (i: number, dir: -1 | 1) =>
    setD((x) => {
      const list = [...x.images];
      const j = i + dir;
      if (j < 0 || j >= list.length) return x;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...x, images: list };
    });

  return (
    <li className="flex flex-col gap-3 border-t border-[hsl(var(--ax-line))] py-3 first:border-t-0 sm:flex-row">
      <div className="flex shrink-0 items-start gap-1">
        <div className="flex flex-col">
          <button type="button" aria-label="Move earlier" disabled={index === 0} onClick={() => onMove(-1)} className="rounded p-1 disabled:opacity-25">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Move later" disabled={index === count - 1} onClick={() => onMove(1)} className="rounded p-1 disabled:opacity-25">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="w-6 pt-1.5 text-[11px] tabular-nums text-[hsl(var(--ax-faint))]">{String(index + 1).padStart(2, "0")}</span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {d.images.map((src, i) => (
          <figure key={src} className="relative h-28 w-[88px] overflow-hidden rounded-lg bg-[#141414]">
            <img src={src} alt="" className="h-full w-full object-contain" />
            <span className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 px-1 py-0.5 text-white">
              <button type="button" aria-label="Earlier" disabled={i === 0} onClick={() => shift(i, -1)} className="disabled:opacity-30">
                <ArrowLeft className="h-3 w-3" />
              </button>
              <button type="button" aria-label="Remove picture" onClick={() => setD((x) => ({ ...x, images: x.images.filter((s) => s !== src) }))}>
                <X className="h-3 w-3" />
              </button>
              <button type="button" aria-label="Later" disabled={i === d.images.length - 1} onClick={() => shift(i, 1)} className="disabled:opacity-30">
                <ArrowRight className="h-3 w-3" />
              </button>
            </span>
            {i === 0 && d.images.length > 1 && <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9px] uppercase text-white">Top</span>}
          </figure>
        ))}
        {d.images.length < 6 && (
          <button
            type="button"
            onClick={() => file.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void add(e.dataTransfer.files);
            }}
            className="flex h-28 w-[88px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[hsl(var(--ax-border))] text-[11px] text-[hsl(var(--ax-faint))]"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {d.images.length ? "Add to deck" : "Add plaque"}
          </button>
        )}
        <input ref={file} type="file" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => void add(e.target.files)} />
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={input} value={d.label} onChange={(e) => setD((x) => ({ ...x, label: e.target.value }))} placeholder={item.name} aria-label="Name the client sees" />
          <input className={input} value={d.caption} onChange={(e) => setD((x) => ({ ...x, caption: e.target.value }))} placeholder="Caption (optional)" aria-label="Caption" maxLength={60} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={d.live} onChange={(e) => setD((x) => ({ ...x, live: e.target.checked, hidden: !e.target.checked }))} />
            Show on their home page
          </label>
          <span className="text-[hsl(var(--ax-faint))]">
            {item.name} · {item.productCount} product{item.productCount === 1 ? "" : "s"}
          </span>
          {dirty && (
            <span className="ml-auto flex gap-2">
              <button type="button" className={btn} onClick={() => setD(initial)}>
                Discard
              </button>
              <button
                type="button"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(d, {
                    onSuccess: () => toast.success(`${d.label || item.name} saved`),
                    onError: (e) => toast.error(e.message),
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-3.5 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))] disabled:opacity-50"
              >
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save
              </button>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

export default function CollectionWallCard({ entityId, entityName, organizationId }: { entityId: string; entityName: string; organizationId: string }) {
  const { data, isLoading, isError, error } = useCollectionWall(entityId);
  const save = useSaveWallItem(entityId);
  const create = useCreateCollection();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const items = data ?? [];
  const showing = items.filter((i) => i.status === "active" && !i.hidden).length;

  // Reorder = renumber every item 10, 20, 30… so the order is explicit and gaps leave room.
  const move = (index: number, dir: -1 | 1) => {
    const list = [...items];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    void Promise.all(
      list.map((it, i) => (it.sort === (i + 1) * 10 ? null : save.mutateAsync({ ...it, sort: (i + 1) * 10, live: it.status === "active" && !it.hidden }))),
    ).catch((e: Error) => toast.error(e.message));
  };

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await create.mutateAsync({ name: newName, entityId, organizationId });
      setNewName("");
      toast.success("Collection added — fill it from Portal lineup, then show it here.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the collection");
    }
  };

  return (
    <div className="mb-6">
      <div className="ax-card flex flex-wrap items-center gap-3 px-3.5 py-3">
        <LayoutGrid className="h-4 w-4 shrink-0 text-[hsl(var(--ax-secondary))]" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Collection wall</div>
          <div className="truncate text-[12px] text-[hsl(var(--ax-faint))]">
            {isLoading ? "Loading…" : `${showing} of ${items.length} collection${items.length === 1 ? "" : "s"} on ${entityName}'s home page`}
          </div>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className={btn}>
          {open ? "Close" : "Arrange"}
        </button>
      </div>
      {open && (
        <div className="ax-card mt-1.5 px-3.5 py-2">
          {isError && <p className="py-3 text-[12px] text-[hsl(var(--ax-amber))]">{error instanceof Error ? error.message : "Could not load collections."}</p>}
          {!isLoading && items.length === 0 && <p className="py-3 text-[12px] text-[hsl(var(--ax-faint))]">No collections yet.</p>}
          <ol>
            {items.map((item, i) => (
              <WallRow key={item.id} entityId={entityId} item={item} index={i} count={items.length} onMove={(dir) => move(i, dir)} />
            ))}
          </ol>
          <form
            className="flex items-center gap-2 border-t border-[hsl(var(--ax-line))] py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input className={input} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New collection — e.g. Provengers" />
            <button type="submit" disabled={!newName.trim() || create.isPending} className={btn}>
              {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
