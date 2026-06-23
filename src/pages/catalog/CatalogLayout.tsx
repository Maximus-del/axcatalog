import { Link, Outlet } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { CartProvider, useCart } from "./CartContext";
import { CatalogAccessProvider, useCatalogAccess } from "./CatalogAccessContext";

function CartLink() {
  const { totalUnits } = useCart();
  return (
    <Link
      to="/catalog/checkout"
      className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
    >
      <ShoppingBag className="h-4 w-4" />
      Cart{totalUnits > 0 ? ` (${totalUnits})` : ""}
    </Link>
  );
}

function CustomerBanner() {
  const { customerName, tier } = useCatalogAccess();
  if (!customerName) return null;
  return (
    <div className="border-b border-border bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 py-2 text-xs text-muted-foreground flex items-center justify-between gap-3">
        <span>
          Pricing for <span className="font-medium text-foreground">{customerName}</span>
        </span>
        <span className="uppercase tracking-wider">{tier} tier</span>
      </div>
    </div>
  );
}

export default function CatalogLayout() {
  return (
    <CatalogAccessProvider>
      <CartProvider>
        <div className="min-h-screen bg-background text-foreground">
          <header className="border-b border-border">
            <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
              <Link
                to="/catalog"
                className="font-bold tracking-wider uppercase text-sm"
              >
                Wholesale Catalog
              </Link>
              <div className="flex items-center gap-4">
                <span className="hidden sm:inline text-xs text-muted-foreground">
                  Trade pricing · MOQ applies
                </span>
                <CartLink />
              </div>
            </div>
          </header>
          <CustomerBanner />
          <main className="max-w-6xl mx-auto px-4 py-6">
            <Outlet />
          </main>
        </div>
      </CartProvider>
    </CatalogAccessProvider>
  );
}