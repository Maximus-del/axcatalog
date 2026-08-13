// Mobile-first. Content Library: For You / Photos / Videos / Graphics /
// Products, with Save / Share / Copy Product Link and Post Kits.
import { useMemo, useState } from "react";
import { Bookmark, Share2, Link2, Check, LayoutGrid, ImageOff, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalData } from "@/components/portal/PortalDataContext";
import {
  flattenAssets,
  buildPostKits,
  copyText,
  shareLink,
  type ContentAsset,
  type PostKit,
} from "@/lib/portal-content";
import { cn } from "@/lib/utils";

type Filter = "for_you" | "photos" | "videos" | "graphics" | "products";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "for_you", label: "For You" },
  { key: "photos", label: "Photos" },
  { key: "videos", label: "Videos" },
  { key: "graphics", label: "Graphics" },
  { key: "products", label: "Products" },
];

export function ContentLibrary() {
  const { products, productsLoading, athlete } = usePortalData();
  const [filter, setFilter] = useState<Filter>("for_you");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [activeAsset, setActiveAsset] = useState<ContentAsset | null>(null);
  const [kit, setKit] = useState<PostKit | null>(null);

  const assets = useMemo(() => flattenAssets(products), [products]);
  const forYou = useMemo(() => assets.filter((a) => a.isPrimary).slice(0, 12), [assets]);
  const kits = useMemo(
    () => buildPostKits(products, athlete.first_name),
    [products, athlete.first_name],
  );

  function toggleSave(id: string) {
    setSaved((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function doShare(a: ContentAsset) {
    const res = await shareLink(a.productLink ?? a.url, a.productTitle);
    if (res === "copied") toast.success("Link copied");
    else if (res === "failed") toast.error("Couldn't share");
  }
  async function copyLink(link: string | null) {
    if (!link) {
      toast.info("No product link yet for this item.");
      return;
    }
    if (await copyText(link)) toast.success("Product link copied");
    else toast.error("Copy failed");
  }

  if (productsLoading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    );
  }

  const gridAssets = filter === "for_you" ? forYou : filter === "photos" ? assets : [];

  return (
    <div>
      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 mb-4 scroll-touch">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "shrink-0 h-8 px-3.5 rounded-full text-[13px] font-semibold border",
              filter === f.key ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Products → Post Kits */}
      {filter === "products" ? (
        kits.length === 0 ? (
          <Empty icon={LayoutGrid} text="Your products will appear here with ready-to-post kits." />
        ) : (
          <div className="space-y-3">
            {kits.map((k) => (
              <button
                key={k.productId}
                onClick={() => setKit(k)}
                className="w-full text-left rounded-2xl border border-border bg-card p-3 flex items-center gap-3 hover:border-accent/40 transition-colors"
              >
                <div className="h-16 w-16 rounded-xl overflow-hidden bg-muted shrink-0">
                  {k.assets[0] && <img src={k.assets[0].url} alt={k.productTitle} className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{k.productTitle}</div>
                  <div className="text-[12px] text-muted-foreground">
                    {k.photoCount} photo{k.photoCount === 1 ? "" : "s"} · caption · link
                  </div>
                </div>
                <span className="text-accent text-[12px] font-bold uppercase tracking-wider shrink-0">Post Kit</span>
              </button>
            ))}
          </div>
        )
      ) : filter === "videos" ? (
        <Empty icon={ImageOff} text="New videos & reels from AX will appear here." />
      ) : filter === "graphics" ? (
        <Empty icon={Sparkles} text="New graphics & story assets from AX will appear here." />
      ) : gridAssets.length === 0 ? (
        <Empty icon={ImageOff} text="New content from AX will appear here." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {gridAssets.map((a) => (
            <button
              key={a.id}
              onClick={() => setActiveAsset(a)}
              className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted group"
            >
              <img src={a.url} alt={a.productTitle} loading="lazy" className="h-full w-full object-cover" />
              {saved.has(a.id) && (
                <span className="absolute top-2 right-2 h-6 w-6 rounded-full bg-accent flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-accent-foreground" />
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-[11px] text-white truncate text-left opacity-0 group-hover:opacity-100 transition-opacity">
                {a.productTitle}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Asset actions sheet */}
      <Sheet open={!!activeAsset} onOpenChange={(o) => !o && setActiveAsset(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
          {activeAsset && (
            <>
              <div className="rounded-xl overflow-hidden bg-muted mb-4 max-h-[46vh]">
                <img src={activeAsset.url} alt={activeAsset.productTitle} className="w-full object-contain max-h-[46vh]" />
              </div>
              <div className="font-semibold mb-3">{activeAsset.productTitle}</div>
              <div className="grid grid-cols-3 gap-2">
                <Action icon={saved.has(activeAsset.id) ? Check : Bookmark} label={saved.has(activeAsset.id) ? "Saved" : "Save"} onClick={() => toggleSave(activeAsset.id)} />
                <Action icon={Share2} label="Share" onClick={() => doShare(activeAsset)} />
                <Action icon={Link2} label="Copy Link" onClick={() => copyLink(activeAsset.productLink)} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Post Kit sheet */}
      <Sheet open={!!kit} onOpenChange={(o) => !o && setKit(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[85vh] overflow-y-auto">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted" />
          <SheetHeader className="text-left">
            <SheetTitle>{kit?.productTitle} — Post Kit</SheetTitle>
          </SheetHeader>
          {kit && (
            <div className="mt-3 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {kit.assets.slice(0, 9).map((a) => (
                  <div key={a.id} className="aspect-square rounded-lg overflow-hidden bg-muted">
                    <img src={a.url} alt="" className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
              <div>
                <div className="ax-label mb-1.5">Suggested caption</div>
                <div className="rounded-xl border border-border bg-card p-3 text-sm">{kit.caption}</div>
                <button onClick={() => copyText(kit.caption).then((ok) => toast[ok ? "success" : "error"](ok ? "Caption copied" : "Copy failed"))} className="mt-2 text-[13px] font-semibold text-accent">
                  Copy caption
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => copyLink(kit.productLink)} className="flex-1 h-11 rounded-xl border border-border font-semibold text-sm flex items-center justify-center gap-2">
                  <Link2 className="h-4 w-4" /> Copy product link
                </button>
                <button onClick={() => kit.productLink && shareLink(kit.productLink, kit.productTitle)} className="flex-1 h-11 rounded-xl bg-accent text-accent-foreground font-bold text-sm flex items-center justify-center gap-2">
                  <Share2 className="h-4 w-4" /> Share
                </button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Action({ icon: Icon, label, onClick }: { icon: typeof Bookmark; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="pressable flex flex-col items-center gap-1.5 rounded-xl border border-border py-3 text-[12px] font-semibold">
      <Icon className="h-5 w-5 text-accent" />
      {label}
    </button>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof X; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-accent/12 flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-accent" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
