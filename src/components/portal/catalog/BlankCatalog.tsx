// The blank catalog: AX's approved garments at this client's price.
// Pick a blank, pick colourways, "Add to my shop" → AX designs it with your
// brand and adds it to your gear. Owners only (the nav and the database both
// enforce that). Theme tokens only, so it sits in either shell.
import { useMemo, useState } from "react";
import { Check, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { usePortalBlankCatalog, usePortalRequestBlank, usePortalScope } from "@/hooks/usePortalApi";
import {
  driveThumb,
  GARMENT_GROUPS,
  groupOf,
  latestRequest,
  type CatalogBlank,
  type CatalogRequest,
} from "@/lib/portal/api/blank-catalog";

const money = (n: number) => `$${n.toFixed(2)}`;

const STATUS: Record<CatalogRequest["status"], string> = {
  pending: "Requested",
  in_progress: "In design",
  added: "In your shop",
  declined: "Not available",
};

function BlankCard({ blank, request, onOpen }: { blank: CatalogBlank; request: CatalogRequest | null; onOpen: () => void }) {
  const lead = blank.colors.find((c) => c.front) ?? blank.colors[0];
  const img = driveThumb(lead?.front ?? lead?.back ?? null, 800);
  const [failed, setFailed] = useState(false);
  return (
    <button onClick={onOpen} className="group text-left">
      <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-card">
        {img && !failed ? (
          <img src={img} alt={blank.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : null}
        {request ? (
          <span className="absolute left-2 top-2 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-foreground">
            {STATUS[request.status]}
          </span>
        ) : null}
      </div>
      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-snug">{blank.name}</p>
      <p className="mt-1 text-sm">
        <span className="font-bold text-accent">{money(blank.price)}</span>
        {blank.retail && blank.retail > blank.price ? <span className="ml-2 text-xs text-muted-foreground line-through">{money(blank.retail)}</span> : null}
        <span className="ml-2 text-xs text-muted-foreground">· {blank.colors.length} {blank.colors.length === 1 ? "color" : "colors"}</span>
      </p>
    </button>
  );
}

function BlankSheet({ blank, request, onClose }: { blank: CatalogBlank | null; request: CatalogRequest | null; onClose: () => void }) {
  const scope = usePortalScope();
  const ask = usePortalRequestBlank();
  const [colorIdx, setColorIdx] = useState(0);
  const [side, setSide] = useState<"front" | "back">("front");
  const [picked, setPicked] = useState<string[]>([]);
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  if (!blank) return null;
  const color = blank.colors[colorIdx] ?? null;
  const src = driveThumb((side === "front" ? color?.front : color?.back) ?? color?.front ?? color?.back ?? null, 1400);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    const quantity = qty.trim() ? Math.max(1, Math.min(10000, Math.floor(Number(qty)))) : null;
    try {
      await ask.mutateAsync({ blankId: blank.id, colorIds: picked, quantity: Number.isFinite(quantity) ? quantity : null, notes });
      toast.success("Added to your requests — AX will design it with your brand and add it to your gear.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that request.");
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-border bg-background p-0 sm:mx-auto sm:max-w-xl">
        <div className="relative aspect-square w-full bg-card">
          {src && !failed[src] ? (
            <img src={src} alt={`${blank.name} — ${color?.name ?? ""} ${side}`} referrerPolicy="no-referrer" onError={() => setFailed((f) => ({ ...f, [src]: true }))} className="h-full w-full object-contain p-6" />
          ) : null}
          <button
            onClick={() => setSide((s) => (s === "front" ? "back" : "front"))}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold backdrop-blur"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {side === "front" ? "See back" : "See front"}
          </button>
        </div>
        <div className="space-y-5 p-5">
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="text-xl leading-tight">{blank.name}</SheetTitle>
            <p>
              <span className="text-lg font-bold text-accent">{money(blank.price)}</span>
              <span className="ml-1 text-xs text-muted-foreground">/ piece, blank — your price</span>
              {blank.retail && blank.retail > blank.price ? <span className="ml-2 text-xs text-muted-foreground line-through">{money(blank.retail)}</span> : null}
            </p>
            <p className="text-xs text-muted-foreground">Printing and design are quoted with your order. Volume discounts from 50 pieces.</p>
          </SheetHeader>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Colors · {color?.name} — tap to preview, check the ones you want
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {blank.colors.map((c, i) => {
                const on = picked.includes(c.id);
                return (
                  <div key={c.id} className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-sm ${i === colorIdx ? "border-accent" : "border-border"}`}>
                    <button onClick={() => { setColorIdx(i); setSide("front"); }} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="h-4 w-4 shrink-0 rounded-full border border-border" style={c.hex ? { background: c.hex } : undefined} />
                      <span className="truncate">{c.name}</span>
                    </button>
                    <button
                      onClick={() => toggle(c.id)}
                      aria-pressed={on}
                      aria-label={on ? `Remove ${c.name}` : `Add ${c.name}`}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${on ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
                    >
                      {on ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-[120px_1fr] gap-3">
            <label className="text-xs">
              <span className="mb-1 block font-semibold uppercase tracking-wider text-muted-foreground">Est. qty</span>
              <input
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 50"
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-semibold uppercase tracking-wider text-muted-foreground">Notes (optional)</span>
              <Textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder="Logo front, staff names on back…" className="min-h-[40px] bg-background" />
            </label>
          </div>

          {request ? (
            <p className="text-xs text-muted-foreground">You requested this {request.status === "pending" ? "already — AX has it." : `— ${STATUS[request.status].toLowerCase()}.`} You can send another with different colors.</p>
          ) : null}

          <Button
            onClick={submit}
            disabled={ask.isPending || scope.viewingAs}
            className="h-12 w-full rounded-xl bg-accent font-bold uppercase tracking-wider text-accent-foreground hover:bg-accent/90"
          >
            {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Add to my shop${picked.length ? ` · ${picked.length} ${picked.length === 1 ? "color" : "colors"}` : ""}`}
          </Button>
          {scope.viewingAs ? <p className="text-center text-xs text-muted-foreground">Viewing only — requests are turned off here.</p> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function BlankCatalogView() {
  const catalog = usePortalBlankCatalog();
  const [group, setGroup] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);

  const blanks = catalog.data?.blanks ?? [];
  const groups = useMemo(() => GARMENT_GROUPS.filter((g) => blanks.some((b) => groupOf(b.type) === g.key)), [blanks]);
  const shown = group === "all" ? blanks : blanks.filter((b) => groupOf(b.type) === group);
  const openBlank = blanks.find((b) => b.id === open) ?? null;
  const requests = catalog.data?.requests ?? [];

  return (
    <main className="mx-auto max-w-[1200px] px-4 py-6 pb-bottom-nav sm:px-6 md:pb-24">
      <header className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">Blank catalog</p>
        <h1 className="mt-2 text-2xl font-black uppercase leading-tight sm:text-3xl" style={{ color: "hsl(var(--portal-title, var(--foreground)))" }}>
          Pick your base. We'll make it yours.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The garments AX prints on, at your price. Add the ones you like and we'll put your brand on them and add them to your gear.
        </p>
      </header>

      <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1">
        {[{ key: "all", label: "All" }, ...groups].map((g) => (
          <button
            key={g.key}
            onClick={() => setGroup(g.key)}
            className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${group === g.key ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {catalog.isLoading ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}
        </div>
      ) : catalog.isError ? (
        <div className="rounded-2xl border border-border p-6 text-center text-sm text-muted-foreground">
          The catalog couldn't load. <button className="text-accent underline" onClick={() => void catalog.refetch()}>Try again</button>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-border p-6 text-center text-sm text-muted-foreground">Nothing here yet — AX is adding more blanks.</div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((b) => (
            <BlankCard key={b.id} blank={b} request={latestRequest(requests, b.id)} onOpen={() => setOpen(b.id)} />
          ))}
        </div>
      )}

      <BlankSheet key={open ?? "none"} blank={openBlank} request={openBlank ? latestRequest(requests, openBlank.id) : null} onClose={() => setOpen(null)} />
    </main>
  );
}
