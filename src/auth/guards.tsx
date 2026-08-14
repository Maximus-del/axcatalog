import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { LoadingScreen } from "@/components/brand/LoadingScreen";

function mustChangePassword(
  user: { user_metadata?: { must_change_password?: boolean } } | null,
): boolean {
  return user?.user_metadata?.must_change_password === true;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (mustChangePassword(user)) return <Navigate to="/set-password" replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, user, role, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (mustChangePassword(user)) return <Navigate to="/set-password" replace />;
  if (role !== "admin") return <Navigate to="/portal" replace />;
  return <>{children}</>;
}

export function RequirePortal({ children }: { children: ReactNode }) {
  const { session, user, role, linkedAthleteIds, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (mustChangePassword(user)) return <Navigate to="/set-password" replace />;
  // Admins can view the portal (used for impersonation).
  if (role === "admin") return <>{children}</>;
  if (linkedAthleteIds.length === 0) return <Navigate to="/pending-access" replace />;
  return <>{children}</>;
}

export function RequireAffiliate({ children }: { children: ReactNode }) {
  const { session, user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (mustChangePassword(user)) return <Navigate to="/set-password" replace />;
  return <>{children}</>;
}

// Goat Farm Access (fan) surface. Requires a session + a fan profile; users
// without one are sent to /join to create Goat Farm Access.
export function RequireFan({ children }: { children: ReactNode }) {
  const { session, user, hasFanProfile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/join" state={{ from: location }} replace />;
  if (mustChangePassword(user)) return <Navigate to="/set-password" replace />;
  if (!hasFanProfile) return <Navigate to="/join" replace />;
  return <>{children}</>;
}
