import { useMemo, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ClipboardList, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePortalCatalog, usePortalDestinations, usePortalScope } from "@/hooks/usePortalApi";
import { usePortalData } from "../PortalDataContext";
import { ProductOrderDialog } from "../ProductOrderDialog";
import { DesignsGrid } from "../products/DesignsGrid";
import { GearProductCard } from "./GearProductCard";
import { portalLink } from "./navigation";

export function MyGear() {
  const location = useLocation();
  const [tab, setTab] = useState<"products" | "designs">("products");
  const [collection, setCollection] = useState(() => new URLSearchParams(location.search).get("collection") ?? "all");
  const [lifecycle, setLifecycle] = useState<"live" | "archive">("live");
  const [showAll, setShowAll] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const { products, archivedProducts, openOrderSheet, refetchProducts } = usePortalData();
  const { viewingAs } = usePortalScope();
  const destinations = usePortalDestinations();
  const catalog = usePortalCatalog({ collection, lifecycle, hidden: "include" });
  const sourceProducts = useMemo(() => new Map([...products, ...archivedProducts].map((product) => [product.id, product])), [products, archivedProducts]);
  const orderProduct = orderId ? sourceProducts.get(orderId) : undefined;
  const activeDestination = destinations.data?.find((destination) => destination.id === collection);
  const items = showAll ? catalog.items : catalog.items.slice(0, 8);
  return <TooltipProvider><main className="mw-gear">
    <header className="mw-gear-header">
      <div><h1 className="mw-heading">Your gear. Your legacy.</h1><p>Manage your merch lineup. Share, promote, and reorder.</p></div>
      <div className="mw-gear-tabs" role="tablist" aria-label="My Gear views">
        {(["products", "designs"] as const).map((value) => <Button key={value} id={`gear-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`gear-panel-${value}`} variant="ghost" onClick={() => setTab(value)}>{value === "products" ? "My Products" : "My Designs"}</Button>)}
      </div>
    </header>
    {tab === "products" ? <section id="gear-panel-products" role="tabpanel" aria-labelledby="gear-tab-products" className="mw-gear-lineup">
      <h2 className="mw-section-title">Your Live Product Lineup <span className="mw-gear-count">{catalog.loading ? "—" : catalog.liveCount}</span></h2>
      <div className="mw-gear-toolbar">
        <div className="mw-gear-filters">
          <div className="mw-gear-collections" role="group" aria-label="Collection">
            <Button variant="outline" className="mw-gear-chip" aria-pressed={collection === "all"} onClick={() => { setCollection("all"); setShowAll(false); }}>All</Button>
            {destinations.data?.map((destination) => <Button key={destination.id} variant="outline" className="mw-gear-chip" style={{ "--mw-chip-accent": destination.accent } as CSSProperties} aria-pressed={collection === destination.id} onClick={() => { setCollection(destination.id); setShowAll(false); }}>{destination.label}{destination.jerseyNumber !== null && ` #${destination.jerseyNumber}`}</Button>)}
          </div>
          <div className="mw-gear-lifecycle" role="group" aria-label="Product lifecycle">
            {(["live", "archive"] as const).map((value) => <Button key={value} variant="outline" className="mw-gear-chip" aria-pressed={lifecycle === value} onClick={() => { setLifecycle(value); setShowAll(false); }}>{value === "live" ? "Live" : "Archive"} ({catalog.loading ? "—" : value === "live" ? catalog.liveCount : catalog.archiveCount})</Button>)}
          </div>
        </div>
        <Button variant="outline" className="mw-gear-bulk" disabled={viewingAs} onClick={openOrderSheet}><ClipboardList />Bulk order sheet</Button>
      </div>
      {viewingAs && <p className="mw-viewing">View-as is read-only. Orders are disabled.</p>}
      {destinations.isError ? <div className="mw-state" role="alert"><p>Unable to load collections.</p><Button variant="outline" className="mw-pill" onClick={() => { void destinations.refetch(); refetchProducts(); }}><RefreshCw />Try again</Button></div> : catalog.loading ? <div className="mw-gear-grid" role="status" aria-label="Loading products">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="mw-gear-skeleton" />)}</div> : items.length ? <>
        <div className="mw-gear-grid">{items.map((product) => <GearProductCard key={product.id} product={product} viewingAs={viewingAs} canOrder={product.orderable && sourceProducts.has(product.id)} onOrder={() => setOrderId(product.id)} />)}</div>
        {!showAll && catalog.items.length > 8 && <Button variant="outline" className="mw-gear-view-all" onClick={() => setShowAll(true)}>View all products<ArrowRight /></Button>}
      </> : <div className="mw-state"><p>No {lifecycle === "live" ? "live" : "archived"} products{activeDestination ? ` in ${activeDestination.label}` : ""} yet</p><Button variant="outline" asChild className="mw-pill"><Link to={portalLink("/portal/studio", location.search)}><Pencil />Start a design</Link></Button></div>}
    </section> : <section id="gear-panel-designs" role="tabpanel" aria-labelledby="gear-tab-designs" className="mw-gear-lineup mw-gear-designs"><h2 className="mw-section-title">My Designs</h2><DesignsGrid /></section>}
    {orderProduct && <ProductOrderDialog key={orderProduct.id} product={orderProduct} open={orderId !== null} onOpenChange={(open) => { if (!open) setOrderId(null); }} />}
  </main></TooltipProvider>;
}