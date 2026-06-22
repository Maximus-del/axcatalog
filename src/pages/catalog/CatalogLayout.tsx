import { Link, Outlet } from "react-router-dom";

export default function CatalogLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/catalog" className="font-bold tracking-wider uppercase text-sm">
            Wholesale Catalog
          </Link>
          <span className="text-xs text-muted-foreground">Trade pricing · MOQ applies</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}