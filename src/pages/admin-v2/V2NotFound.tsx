import { Link, useLocation } from "react-router-dom";
import { EmptyState, PageHeader } from "@/components/admin-v2/primitives";

// A wrong address inside V2 stays inside V2.
//
// Without this, /admin-v2/anything-unknown fell through to the app-wide 404,
// which renders outside the dashboard shell — no nav, no back, nothing to say
// where you were. A stale bookmark should not eject you from the product.

const PLACES = [
  { to: "/admin-v2", label: "Overview" },
  { to: "/admin-v2/people", label: "People" },
  { to: "/admin-v2/creative", label: "Creative" },
  { to: "/admin-v2/commerce", label: "Commerce" },
  { to: "/admin-v2/orders", label: "Orders" },
];

export default function V2NotFound() {
  const { pathname } = useLocation();
  return (
    <>
      <PageHeader title="Nothing at that address" subtitle={pathname} />
      <EmptyState>
        <div>This page does not exist in AX OS V2. It may have moved, or the link may be from V1.</div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {PLACES.map((p) => (
            <Link
              key={p.to}
              to={p.to}
              className="rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] transition-colors hover:text-[hsl(var(--ax-ink))]"
            >
              {p.label}
            </Link>
          ))}
        </div>
      </EmptyState>
    </>
  );
}
