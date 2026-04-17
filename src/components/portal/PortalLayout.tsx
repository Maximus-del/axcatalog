import { Outlet } from "react-router-dom";

/**
 * Slim portal shell. The PortalHome page renders its own hero,
 * impersonation banner, and section nav, so the layout stays minimal
 * to match the reference design (no global top bar).
 */
export default function PortalLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  );
}
