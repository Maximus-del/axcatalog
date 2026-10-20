import { Wordmark } from "./Wordmark";
import StudioLoader from "@/components/admin-v2/StudioLoader";

export function LoadingScreen() {
  // AX Studio OS is light. Its first load (auth resolving, the V2 chunk
  // arriving) gets the light animated loader instead of V1's dark screen, so
  // nothing flashes dark on the way in. V1, the portal and the catalog keep
  // their screen unchanged.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin-v2")) {
    return <StudioLoader fullScreen />;
  }
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
      <Wordmark size="lg" />
      <div className="ax-label">Loading…</div>
    </div>
  );
}
