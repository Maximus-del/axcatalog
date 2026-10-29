import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, ShoppingBag, X } from "lucide-react";
import type { Entity } from "@/lib/v2/types";
import AddPersonPanel from "@/components/admin-v2/AddPersonPanel";
import { defaultTags, parseTags, useClientProducts, useShopifyCollections, type ClientProduct } from "@/lib/v2/studio-shopify";

// ADD TO SHOPIFY — the last step of Placement Studio, once the placement is right.
//
//   Who it's for   the client (pick one, or add a new one right here)
//   Product        add these colours to one of their existing products, or make
//                  a new product (title, price)
//   Collection     where it shows: an existing Shopify collection, a new one, or none
//   Tags           the client's name by default
//
// One button saves the mockups for the ticked colours and sends them to
// Shopify as a DRAFT (going live stays your call in Shopify).

export interface PublishPlan {
  target: { kind: "new"; title: string } | { kind: "existing"; product: ClientProduct };
  price: number;
  tags: string[];
  collection: { kind: "none" } | { kind: "existing"; id: string; title: string } | { kind: "new"; title: string };
}

const field = "w-full rounded-lg border border-[hsl(var(--ax-border))] bg-white px-2.5 py-1.5 text-[13px] text-[hsl(var(--ax-ink))]";
const label = "text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--ax-secondary))]";
const seg = (on: boolean) => `flex-1 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${on ? "bg-[hsl(var(--ax-ink))] text-white" : "text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"}`;

export function ShopifyPublishDialog({
  open, onClose, entities, clientId, onClientChange, productName, price, productType, summary, busy, onPublish,
}: {
  open: boolean;
  onClose: () => void;
  entities: Entity[];
  clientId: string | null;
  onClientChange: (id: string) => void;
  productName: string;
  price: string;
  productType: string;
  /** e.g. "Front + Back · 14 colours · AXISM 7010" */
  summary: string;
  busy: string | null;
  onPublish: (plan: PublishPlan) => void;
}) {
  const client = entities.find((e) => e.id === clientId) ?? null;
  const products = useClientProducts(clientId);
  const collections = useShopifyCollections(open);
  const [kind, setKind] = useState<"new" | "existing">("new");
  const [title, setTitle] = useState(productName);
  const [priceIn, setPriceIn] = useState(price);
  const [pick, setPick] = useState<string>("");
  const [productQuery, setProductQuery] = useState("");
  const [tags, setTags] = useState("");
  const [colMode, setColMode] = useState<"none" | "existing" | "new">("existing");
  const [colId, setColId] = useState("");
  const [colNew, setColNew] = useState("");
  const [colQuery, setColQuery] = useState("");
  const [adding, setAdding] = useState(false);

  // Fresh defaults each time it opens / the client changes.
  useEffect(() => {
    if (!open) return;
    setTitle(productName);
    setPriceIn(price);
    setTags(defaultTags(client?.name).join(", "));
    setPick("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, clientId]);

  // Default to the collection named after the client, when there is one.
  useEffect(() => {
    if (!open || colId || !collections.data?.length || !client) return;
    const first = client.name.split(/\s+/)[0].toLowerCase();
    const guess = collections.data.find((c) => c.title.toLowerCase().includes(first));
    if (guess) setColId(guess.id);
  }, [open, collections.data, client, colId]);

  const shownProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    return (products.data ?? []).filter((p) => !q || p.title.toLowerCase().includes(q));
  }, [products.data, productQuery]);
  const shownCollections = useMemo(() => {
    const q = colQuery.trim().toLowerCase();
    return (collections.data ?? []).filter((c) => !q || c.title.toLowerCase().includes(q));
  }, [collections.data, colQuery]);
  const picked = (products.data ?? []).find((p) => p.id === pick) ?? null;
  const pickedCollection = (collections.data ?? []).find((c) => c.id === colId) ?? null;

  if (!open) return null;

  const amount = Number(priceIn);
  const ready = !!client && (kind === "new" ? title.trim().length > 1 && amount > 0 : !!picked) && (colMode !== "new" || colNew.trim().length > 1);
  const submit = () => {
    if (!ready || busy) return;
    onPublish({
      target: kind === "new" ? { kind: "new", title: title.trim() } : { kind: "existing", product: picked! },
      price: amount > 0 ? amount : 0,
      tags: parseTags(tags),
      collection: colMode === "new" ? { kind: "new", title: colNew.trim() } : colMode === "existing" && pickedCollection ? { kind: "existing", id: pickedCollection.id, title: pickedCollection.title } : { kind: "none" },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Add to Shopify" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-[hsl(var(--ax-card))] text-[hsl(var(--ax-ink))] shadow-2xl sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-[hsl(var(--ax-border))] px-5 py-3.5">
          <ShoppingBag className="h-4 w-4" />
          <p className="flex-1 text-[15px] font-semibold">Add to Shopify</p>
          <button type="button" aria-label="Close" disabled={!!busy} onClick={onClose} className="rounded-full p-1 hover:bg-[hsl(var(--ax-ink)/0.06)]"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <p className="rounded-lg bg-[hsl(var(--ax-ink)/0.04)] px-3 py-2 text-[12.5px]">{summary}</p>

          {/* who */}
          <div>
            <p className={label}>Who it's for</p>
            <div className="mt-1.5 flex gap-2">
              <select className={field} value={clientId ?? ""} onChange={(e) => e.target.value && onClientChange(e.target.value)}>
                <option value="">Pick a client…</option>
                {[...entities].sort((a, b) => a.name.localeCompare(b.name)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[hsl(var(--ax-border))] px-2.5 text-[12px] font-semibold" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" />New</button>
            </div>
          </div>

          {/* product */}
          <div>
            <p className={label}>Product</p>
            <div className="mt-1.5 flex gap-1 rounded-xl bg-[hsl(var(--ax-ink)/0.05)] p-1">
              <button type="button" className={seg(kind === "new")} onClick={() => setKind("new")}>New product</button>
              <button type="button" className={seg(kind === "existing")} onClick={() => setKind("existing")}>Add to existing</button>
            </div>
            {kind === "new" ? (
              <div className="mt-2.5 grid grid-cols-[1fr_96px] gap-2">
                <input className={field} placeholder="Product title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Product title" />
                <label className={`${field} flex items-center gap-0.5`}>$<input className="w-full bg-transparent outline-none" inputMode="decimal" value={priceIn} onChange={(e) => setPriceIn(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Price" /></label>
                <p className="col-span-2 text-[11.5px] text-[hsl(var(--ax-faint))]">{productType} · S–3XL · created as a draft, linked to {client?.name ?? "the client"} in the dashboard.</p>
              </div>
            ) : (
              <div className="mt-2.5">
                <span className="relative block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
                  <input className={`${field} pl-8`} placeholder={`Search ${client?.name ?? "their"} products`} value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
                </span>
                <div className="mt-1.5 max-h-[180px] overflow-y-auto rounded-lg border border-[hsl(var(--ax-border))]">
                  {products.isLoading ? <p className="p-3 text-[12px] text-[hsl(var(--ax-faint))]">Loading…</p> : !shownProducts.length ? (
                    <p className="p-3 text-[12px] text-[hsl(var(--ax-faint))]">{client ? "No Shopify products linked to this client yet — make a new one." : "Pick a client first."}</p>
                  ) : shownProducts.map((p) => (
                    <label key={p.id} className={`flex cursor-pointer items-center gap-2 border-b border-[hsl(var(--ax-border))] px-3 py-2 text-[13px] last:border-0 ${pick === p.id ? "bg-[#03AC13]/10" : "hover:bg-[hsl(var(--ax-ink)/0.03)]"}`}>
                      <input type="radio" name="existing-product" checked={pick === p.id} onChange={() => setPick(p.id)} />
                      <span className="flex-1 truncate">{p.title}</span>
                      <span className="text-[11px] text-[hsl(var(--ax-faint))]">{p.status}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[11.5px] text-[hsl(var(--ax-faint))]">New colours are added with their photos; colours you unticked come off. Price stays what the product already charges.</p>
              </div>
            )}
          </div>

          {/* collection */}
          <div>
            <p className={label}>Collection</p>
            <div className="mt-1.5 flex gap-1 rounded-xl bg-[hsl(var(--ax-ink)/0.05)] p-1">
              <button type="button" className={seg(colMode === "existing")} onClick={() => setColMode("existing")}>Existing</button>
              <button type="button" className={seg(colMode === "new")} onClick={() => setColMode("new")}>New</button>
              <button type="button" className={seg(colMode === "none")} onClick={() => setColMode("none")}>None</button>
            </div>
            {colMode === "existing" && (
              <div className="mt-2.5">
                <input className={field} placeholder="Filter collections" value={colQuery} onChange={(e) => setColQuery(e.target.value)} />
                <div className="mt-1.5 max-h-[160px] overflow-y-auto rounded-lg border border-[hsl(var(--ax-border))]">
                  {collections.isLoading ? <p className="flex items-center gap-2 p-3 text-[12px] text-[hsl(var(--ax-faint))]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading Shopify collections…</p>
                    : collections.error ? <p className="p-3 text-[12px] text-[hsl(var(--ax-red))]">{(collections.error as Error).message}</p>
                    : shownCollections.map((c) => (
                      <label key={c.id} className={`flex cursor-pointer items-center gap-2 border-b border-[hsl(var(--ax-border))] px-3 py-1.5 text-[13px] last:border-0 ${colId === c.id ? "bg-[#03AC13]/10" : "hover:bg-[hsl(var(--ax-ink)/0.03)]"}`}>
                        <input type="radio" name="collection" checked={colId === c.id} onChange={() => setColId(c.id)} />
                        <span className="flex-1 truncate">{c.title}</span>
                        <span className="text-[11px] text-[hsl(var(--ax-faint))]">{c.count}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}
            {colMode === "new" && <input className={`${field} mt-2.5`} placeholder="New collection name, e.g. Provengers" value={colNew} onChange={(e) => setColNew(e.target.value)} />}
          </div>

          {/* tags */}
          <div>
            <p className={label}>Tags</p>
            <input className={`${field} mt-1.5`} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Comma separated" />
            <p className="mt-1 text-[11.5px] text-[hsl(var(--ax-faint))]">The client's name is added so storefront filters find it. "Athlete Xclusive", "Streetwear" and the product type are added automatically.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-[hsl(var(--ax-border))] px-5 py-3.5">
          <button type="button" className="rounded-full px-3 py-2 text-[12.5px] text-[hsl(var(--ax-secondary))]" disabled={!!busy} onClick={onClose}>Cancel</button>
          <button type="button" disabled={!ready || !!busy} onClick={submit}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#03AC13] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />}
            {busy ?? (kind === "new" ? "Save mockups & create on Shopify" : "Save mockups & update product")}
          </button>
        </div>
      </div>
      {adding && <AddPersonPanel onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); onClientChange(id); }} />}
    </div>
  );
}
