// lockers.athletexclusive.com is the same app on its own domain. There, a bare
// /<slug> is a locker (lockers.athletexclusive.com/proactive) and the root has
// nothing to sign in to, so it goes to the main store. On every other host
// this component is invisible: the root keeps its normal redirect and an
// unknown /<slug> is still a 404.
import { lazy, type ReactNode } from "react";
import { isLockerHost } from "@/lib/portal/invites";
import NotFound from "./NotFound";

const PublicLocker = lazy(() => import("./PublicLocker"));

export default function LockerHostRoute({ root = false, fallback }: { root?: boolean; fallback?: ReactNode }) {
  const onLockers = typeof window !== "undefined" && isLockerHost(window.location.hostname);
  if (!onLockers) return <>{root ? fallback : <NotFound />}</>;
  if (root) {
    window.location.replace("https://athletexclusive.com");
    return null;
  }
  return <PublicLocker />;
}
