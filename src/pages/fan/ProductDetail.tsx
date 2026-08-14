// Public product detail at /p/:id. In-app detail; purchase hands off to the
// AX store. Includes Save and "More from {athlete}". Product-linked content
// ("Shop the Look") ties merch back to the athlete.
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, ImageOff, Lock, Timer } from "lucide-react";
import { useProductById, useAthleteProducts, useDiscoverAthletes } from "@/hooks/useDiscoverAthletes";
import { useAthleteAccess } from "@/hooks/useFan";
import { earlyAccess } from "@/lib/ecosystem/access";
import { athleteName, type PublicAthlete } from "@/lib/ecosystem/types";
import { productImageUrl, shopLink, fmtPrice } from "@/lib/ecosystem/image";
import { SaveButton } from "@/components/fan/ui/SaveButton";
import { AthletePhoto } from "@/components/fan/ui/AthletePhoto";
import { ProductCard } from "@/components/fan/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading } = useProductById(id);
  const { data: athletes = [] } = useDiscoverAthletes();
  const { data: more = [] } = useAthleteProducts(product?.athlete_id);
  const access = useAthleteAccess(product?.athlete_id);
  const early = product ? earlyAccess(product.access_date, product.public_date, access.isMember) : { phase: "none" as const, label: "" };

  const athlete = useMemo<PublicAthlete | undefined>(
    () => (athletes as PublicAthlete[]).find((a) => a.id === product?.athlete_id),
    [athletes, product],
  );

  const img = product ? productImageUrl(product) : null;
  const href = product ? shopLink(product.shopify_handle) : null;
  const price = product ? fmtPrice(product.price) : null;

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      <header className="sticky top-0 z-40 bg-[hsl(var(--dark))]/95 backdrop-blur-md border-b border-border">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <Link to="/feed/shop" className="h-9 w-9 -ml-2 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <span className="font-black tracking-tight text-[15px]">GOAT FARM <span className="text-accent">ACCESS</span></span>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 py-5">
        {isLoading ? (
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="aspect-square rounded-3xl" />
            <div className="space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-1/3" /></div>
          </div>
        ) : !product ? (
          <div className="py-20 text-center text-muted-foreground">
            <p>This product isn’t available.</p>
            <Link to="/feed/shop" className="text-accent font-semibold mt-3 inline-block">Back to Shop</Link>
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="aspect-square rounded-3xl overflow-hidden bg-muted border border-border">
                {img ? (
                  <img src={img} alt={product.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground"><ImageOff className="h-8 w-8" /></div>
                )}
              </div>

              <div>
                {athlete && (
                  <Link to={`/a/${athlete.slug}`} className="inline-flex items-center gap-2 mb-3">
                    <AthletePhoto athlete={athlete} className="h-8 w-8 rounded-full" textClass="text-[10px]" />
                    <span className="text-sm font-bold text-accent">{athleteName(athlete)}</span>
                  </Link>
                )}
                <h1 className="text-2xl font-black tracking-tight">{product.title}</h1>
                {price && <div className="text-lg font-bold mt-1">{price}</div>}
                {early.phase !== "none" && early.phase !== "public_open" && (
                  <div className="mt-3 rounded-xl border border-accent/30 bg-accent/[0.06] p-3 flex items-center gap-2">
                    {early.phase === "access_open" ? <Timer className="h-4 w-4 text-accent shrink-0" /> : <Lock className="h-4 w-4 text-accent shrink-0" />}
                    <span className="text-[13px] font-semibold text-accent flex-1">{early.label}</span>
                    {early.phase === "upcoming" && !access.isMember && athlete && (
                      <Link to={`/a/${athlete.slug}?tab=access`} className="h-8 px-3 rounded-lg bg-accent text-accent-foreground text-[12px] font-bold shrink-0">Get Access</Link>
                    )}
                  </div>
                )}
                {product.description && <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line line-clamp-6">{product.description}</p>}

                <div className="flex gap-2 mt-5">
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="flex-1 h-12 rounded-xl bg-accent text-accent-foreground font-bold flex items-center justify-center gap-2">
                      Shop on AX <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="flex-1 h-12 rounded-xl bg-white/8 text-muted-foreground font-bold flex items-center justify-center">Coming soon</span>
                  )}
                  <SaveButton item={{ type: "product", ref: product.id, athleteId: product.athlete_id, title: product.title }} variant="inline" stopLink={false} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">Checkout is handled securely on the AthleteXclusive store.</p>
              </div>
            </div>

            {athlete && more.length > 1 && (
              <section className="mt-10">
                <h2 className="ax-section-header mb-3">More from {athlete.first_name}</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {more.filter((p) => p.id !== product.id).slice(0, 8).map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
