// /l/:slug (and lockers.athletexclusive.com/:slug) — an entity's public locker.
//
// No login. The client's own look (Proactive: the gym, orange + lime), their
// collections as plaques, their gear at RETAIL price. Wholesale and cost never
// reach this page — public_locker() doesn't return them.
//
// Buying hands off to Shopify checkout via a cart permalink, which is where
// Apple Pay / Shop Pay / cards live. Out-of-stock blanks still sell ("made to
// order") — stock only changes ship time.
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { ShoppingBag, X, Minus, Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LoadingScreen } from "@/components/brand/LoadingScreen";
import { Wordmark } from "@/components/brand/Wordmark";
import { parsePortalTheme, themeCssVars } from "@/lib/portal/portal-theme";
import {
  cartPermalink,
  pickVariant,
  shopProductUrl,
  sortSizes,
  usePublicLocker,
  type LockerProduct,
} from "@/lib/portal/invites";

const money = (n: number) => `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;
const FREE_SHIP = 75;

interface BagLine {
  productId: string;
  variantId: string;
  title: string;
  option: string;
  price: number;
  image: string | null;
  quantity: number;
}

const bagKey = (slug: string) => `ax.locker.bag.${slug}`;
function loadBag(slug: string): BagLine[] {
  try {
    const raw = localStorage.getItem(bagKey(slug));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function saveBag(slug: string, lines: BagLine[]) {
  try {
    localStorage.setItem(bagKey(slug), JSON.stringify(lines));
  } catch {
    /* private mode — the bag just won't survive a reload */
  }
}

function ProductCard({ p, onOpen }: { p: LockerProduct; onOpen: () => void }) {
  const img = p.images[0]?.url ?? null;
  return (
    <button onClick={onOpen} className="group text-left">
      <div className="aspect-[4/5] overflow-hidden rounded-2xl border border-border/60 bg-[hsl(var(--dark))]">
        {img ? (
          <img src={img} alt={p.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : null}
      </div>
      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-snug">{p.title}</p>
      <p className="mt-1 text-sm">
        <span className="font-bold text-accent">{money(p.price)}</span>
        {p.compareAt ? <span className="ml-2 text-muted-foreground line-through">{money(p.compareAt)}</span> : null}
      </p>
    </button>
  );
}

function ProductSheet({ p, onClose, onAdd }: { p: LockerProduct | null; onClose: () => void; onAdd: (l: BagLine, buyNow: boolean) => void }) {
  const colors = useMemo(() => (p ? Array.from(new Set(p.variants.map((v) => v.color).filter((c): c is string => Boolean(c)))) : []), [p]);
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [img, setImg] = useState(0);

  useEffect(() => {
    setColor(colors[0] ?? null);
    setSize(null);
    setImg(0);
  }, [p, colors]);

  if (!p) return null;
  const sizes = sortSizes(p.variants.filter((v) => color === null || v.color === color).map((v) => v.size).filter((s): s is string => Boolean(s)));
  const needsSize = sizes.length > 0;
  const variant = pickVariant(p, colors.length ? color : null, needsSize ? size : null);
  const images = color ? [...p.images.filter((i) => i.color?.toLowerCase() === color.toLowerCase()), ...p.images.filter((i) => i.color?.toLowerCase() !== color.toLowerCase())] : p.images;
  const shown = images[Math.min(img, images.length - 1)]?.url ?? null;
  const fallback = shopProductUrl(p.handle);

  const add = (buyNow: boolean) => {
    if (!variant) return;
    onAdd(
      {
        productId: p.id,
        variantId: variant.id,
        title: p.title,
        option: [variant.color, variant.size].filter(Boolean).join(" / "),
        price: variant.price || p.price,
        image: shown,
        quantity: 1,
      },
      buyNow,
    );
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-border bg-background p-0 sm:mx-auto sm:max-w-lg">
        <div className="relative aspect-square w-full bg-[hsl(var(--dark))]">
          {shown ? <img src={shown} alt={p.title} className="h-full w-full object-contain" /> : null}
          {images.length > 1 ? (
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {images.slice(0, 8).map((_, i) => (
                <button key={i} aria-label={`Image ${i + 1}`} onClick={() => setImg(i)} className={`h-2 rounded-full transition-all ${i === img ? "w-6 bg-accent" : "w-2 bg-white/40"}`} />
              ))}
            </div>
          ) : null}
        </div>
        <div className="space-y-5 p-5">
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="text-xl leading-tight">{p.title}</SheetTitle>
            <p className="text-lg">
              <span className="font-bold text-accent">{money(variant?.price || p.price)}</span>
              {p.compareAt ? <span className="ml-2 text-sm text-muted-foreground line-through">{money(p.compareAt)}</span> : null}
            </p>
          </SheetHeader>

          {colors.length > 1 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Color · {color}</p>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button key={c} onClick={() => { setColor(c); setImg(0); setSize(null); }} className={`rounded-full border px-3.5 py-2 text-sm capitalize ${c === color ? "border-accent bg-accent/15 font-semibold" : "border-border"}`}>{c}</button>
                ))}
              </div>
            </div>
          ) : null}

          {needsSize ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Size</p>
              <div className="grid grid-cols-4 gap-2">
                {sizes.map((s) => (
                  <button key={s} onClick={() => setSize(s)} className={`rounded-xl border py-2.5 text-sm font-semibold ${s === size ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}>{s}</button>
                ))}
              </div>
            </div>
          ) : null}

          {variant && !variant.available ? (
            <p className="text-xs text-muted-foreground">Made to order — ships in 4–6 business days.</p>
          ) : variant ? (
            <p className="text-xs text-muted-foreground">In stock — ships in 2–4 business days.</p>
          ) : null}

          {p.variants.length === 0 ? (
            fallback ? (
              <Button asChild className="h-12 w-full rounded-xl bg-accent font-bold uppercase tracking-wider text-accent-foreground hover:bg-accent/90">
                <a href={fallback}>Shop this piece <ArrowUpRight className="ml-1 h-4 w-4" /></a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Coming soon.</p>
            )
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={!variant} onClick={() => add(false)} className="h-12 rounded-xl font-bold uppercase tracking-wider">
                Add to bag
              </Button>
              <Button disabled={!variant} onClick={() => add(true)} className="h-12 rounded-xl bg-accent font-bold uppercase tracking-wider text-accent-foreground hover:bg-accent/90">
                {needsSize && !size ? "Pick a size" : "Buy now"}
              </Button>
            </div>
          )}
          <p className="text-center text-[11px] text-muted-foreground">Apple Pay, Shop Pay & cards at checkout · Free shipping over {money(FREE_SHIP)}</p>
          {p.description ? <p className="whitespace-pre-line text-sm text-muted-foreground">{p.description.replace(/<[^>]+>/g, "")}</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function PublicLocker({ slugOverride }: { slugOverride?: string }) {
  const params = useParams<{ slug: string }>();
  const slug = (slugOverride ?? params.slug ?? "").toLowerCase();
  const locker = usePublicLocker(slug);
  const [active, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<LockerProduct | null>(null);
  const [bag, setBag] = useState<BagLine[]>(() => loadBag(slug));
  const [bagOpen, setBagOpen] = useState(false);

  useEffect(() => saveBag(slug, bag), [slug, bag]);
  useEffect(() => {
    if (locker.data) document.title = `${locker.data.entity.name} Locker`;
  }, [locker.data]);

  if (locker.isLoading) return <LoadingScreen />;
  if (!locker.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Wordmark size="lg" />
        <h1 className="text-2xl font-bold">This locker isn't open yet</h1>
        <a href="https://athletexclusive.com" className="text-sm text-accent underline">Shop Athlete Xclusive</a>
      </div>
    );
  }

  const { entity, collections, products } = locker.data;
  const theme = parsePortalTheme(entity.theme);
  const world = theme.world;
  const byId = new Map(products.map((p) => [p.id, p]));
  const activeCol = collections.find((c) => c.key === active) ?? null;
  const shown = activeCol ? activeCol.productIds.map((id) => byId.get(id)).filter((p): p is LockerProduct => Boolean(p)) : products;
  const headline = entity.locker.headline || `${entity.name}`;
  const tagline = entity.locker.tagline || world.tagline;

  const bagCount = bag.reduce((n, l) => n + l.quantity, 0);
  const subtotal = bag.reduce((n, l) => n + l.price * l.quantity, 0);
  const checkoutUrl = cartPermalink(bag.map((l) => ({ variantId: l.variantId, quantity: l.quantity })));

  const addLine = (line: BagLine, buyNow: boolean) => {
    if (buyNow) {
      const url = cartPermalink([{ variantId: line.variantId, quantity: 1 }]);
      if (url) window.location.href = url;
      return;
    }
    setBag((b) => {
      const i = b.findIndex((x) => x.variantId === line.variantId);
      if (i === -1) return [...b, line];
      const next = [...b];
      next[i] = { ...next[i], quantity: Math.min(99, next[i].quantity + 1) };
      return next;
    });
    setOpen(null);
    setBagOpen(true);
  };
  const setQty = (variantId: string, q: number) =>
    setBag((b) => (q <= 0 ? b.filter((x) => x.variantId !== variantId) : b.map((x) => (x.variantId === variantId ? { ...x, quantity: Math.min(99, q) } : x))));

  return (
    <div className="min-h-screen bg-background text-foreground" style={themeCssVars(theme) as CSSProperties}>
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-[hsl(var(--dark)/0.85)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          {world.logoUrl ? <img src={world.logoUrl} alt={entity.name} className="h-8 w-auto max-w-[140px] object-contain" /> : <span className="font-bold">{entity.name}</span>}
          <button onClick={() => setBagOpen(true)} className="relative flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm font-semibold" aria-label="Open bag">
            <ShoppingBag className="h-4 w-4" />
            {bagCount ? <span className="rounded-full bg-accent px-1.5 text-xs text-accent-foreground">{bagCount}</span> : null}
          </button>
        </div>
      </header>

      {/* hero: their room */}
      <section className="relative overflow-hidden">
        {world.heroUrl ? (
          <>
            <img src={world.heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" />
            <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/60 to-background" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--accent)/0.22),transparent_65%)]" />
        )}
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 sm:pt-24">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent">{world.roomName} · Official locker</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl">
            {headline}
            {world.headlineAccent ? <span className="block text-[hsl(var(--accent-2))]">{world.headlineAccent}</span> : null}
          </h1>
          {tagline ? <p className="mt-4 max-w-xl text-base text-muted-foreground">{tagline}</p> : null}
        </div>
      </section>

      {/* collections as plaques */}
      {collections.length ? (
        <section className="mx-auto max-w-6xl px-4">
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2">
            <button onClick={() => setActive(null)} className={`shrink-0 snap-start rounded-full border px-4 py-2 text-sm font-semibold ${active === null ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}>
              All gear
            </button>
            {collections.map((c) => (
              <button
                key={c.id}
                onClick={() => setActive(c.key)}
                className={`flex shrink-0 snap-start items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-sm font-semibold ${active === c.key ? "border-accent bg-accent/15" : "border-border"}`}
                style={c.accent ? ({ "--tw-ring-color": c.accent } as CSSProperties) : undefined}
              >
                {c.images[0] ? <img src={c.images[0]} alt="" className="h-8 w-8 rounded-full bg-[hsl(var(--dark))] object-contain p-0.5" /> : <span className="h-8 w-8" />}
                {c.label}
              </button>
            ))}
          </div>

          {/* plaque wall on the "All gear" view: one tile per collection */}
          {active === null ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {collections.map((c, i) => (
                <button key={c.id} onClick={() => setActive(c.key)} className="group relative overflow-hidden rounded-2xl border border-border/60 bg-[hsl(var(--dark))] p-4 text-left">
                  <div className="flex aspect-square items-center justify-center">
                    {c.images[0] ? <img src={c.images[0]} alt={`${c.label} plaque`} className="max-h-full max-w-full object-contain drop-shadow-[0_12px_30px_rgba(0,0,0,0.6)] transition-transform duration-500 group-hover:scale-105" /> : null}
                  </div>
                  <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Collection {String(i + 1).padStart(2, "0")}</p>
                  <p className="font-bold" style={c.accent ? { color: c.accent } : undefined}>{c.label}</p>
                  {c.caption ? <p className="text-xs text-muted-foreground">{c.caption}</p> : null}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* the gear */}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="mb-5 text-lg font-bold uppercase tracking-wider">{activeCol ? activeCol.label : "All gear"}</h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((p) => (
            <ProductCard key={p.id} p={p} onOpen={() => setOpen(p)} />
          ))}
        </div>
      </section>

      <footer className="border-t border-border/50 py-8 text-center text-xs text-muted-foreground">
        <p>Free shipping over {money(FREE_SHIP)} · Secure checkout with Apple Pay & Shop Pay</p>
        <p className="mt-2">Powered by <a href="https://athletexclusive.com" className="font-semibold text-foreground">Athlete Xclusive</a></p>
      </footer>

      <ProductSheet p={open} onClose={() => setOpen(null)} onAdd={addLine} />

      {/* bag */}
      <Sheet open={bagOpen} onOpenChange={setBagOpen}>
        <SheetContent side="right" className="flex w-full flex-col border-border bg-background sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Your bag</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-3 overflow-y-auto py-4">
            {bag.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here yet.</p> : null}
            {bag.map((l) => (
              <div key={l.variantId} className="flex gap-3 rounded-xl border border-border/60 p-2">
                <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-[hsl(var(--dark))]">{l.image ? <img src={l.image} alt="" className="h-full w-full object-cover" /> : null}</div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">{l.title}</p>
                  <p className="text-xs capitalize text-muted-foreground">{l.option}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button aria-label="Less" onClick={() => setQty(l.variantId, l.quantity - 1)} className="rounded-full border border-border p-1"><Minus className="h-3 w-3" /></button>
                      <span className="w-5 text-center text-sm">{l.quantity}</span>
                      <button aria-label="More" onClick={() => setQty(l.variantId, l.quantity + 1)} className="rounded-full border border-border p-1"><Plus className="h-3 w-3" /></button>
                    </div>
                    <span className="text-sm font-bold">{money(l.price * l.quantity)}</span>
                  </div>
                </div>
                <button aria-label="Remove" onClick={() => setQty(l.variantId, 0)} className="self-start p-1 text-muted-foreground"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          {bag.length ? (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-bold">{money(subtotal)}</span></div>
              <p className="text-xs text-muted-foreground">
                {subtotal >= FREE_SHIP ? "You've got free shipping." : `${money(FREE_SHIP - subtotal)} away from free shipping.`}
              </p>
              <Button asChild disabled={!checkoutUrl} className="h-12 w-full rounded-xl bg-accent font-bold uppercase tracking-wider text-accent-foreground hover:bg-accent/90">
                <a href={checkoutUrl ?? "#"}>Checkout</a>
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">Apple Pay, Shop Pay & cards on the next screen</p>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
