import { Navigate, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { LoadingScreen } from "@/components/brand/LoadingScreen";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, role, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (role !== "admin") return <Navigate to="/portal" replace />;
  return <>{children}</>;
}

export function RequirePortal({ children }: { children: ReactNode }) {
  const { session, role, linkedAthleteIds, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  // Admins can view the portal (used for impersonation).
  if (role === "admin") return <>{children}</>;
  if (linkedAthleteIds.length === 0) return <Navigate to="/pending-access" replace />;
  return <>{children}</>;
}
