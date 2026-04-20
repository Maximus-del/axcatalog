// Mobile-first. Test at 375px before merging.
import { Outlet } from "react-router-dom";
import { PortalBottomNav } from "./PortalBottomNav";

/**
 * Slim portal shell. The PortalHome page renders its own hero,
 * impersonation banner, and section nav. On phones we add a fixed
 * bottom tab bar; pages reserve space via `pb-bottom-nav`.
 */
export default function PortalLayout() {
  return (
    <div className="min-h-screen bg-background">
      <div className="pb-bottom-nav md:pb-0">
        <Outlet />
      </div>
      <PortalBottomNav />
    </div>
  );
}
