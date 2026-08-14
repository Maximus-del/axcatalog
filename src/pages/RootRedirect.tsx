import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { LoadingScreen } from "@/components/brand/LoadingScreen";

/**
 * Landing route. Sends users to the right surface:
 *  - admin role          → /admin
 *  - linked athlete user → /portal
 *  - signed in but neither → /pending-access
 *  - signed out          → /login
 */
export default function RootRedirect() {
  const { session, role, linkedAthleteIds, hasFanProfile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (role === "admin") return <Navigate to="/admin" replace />;
  if (linkedAthleteIds.length > 0) return <Navigate to="/portal" replace />;
  // Consumer users with a Goat Farm Access profile land on their fan feed.
  if (hasFanProfile) return <Navigate to="/feed" replace />;
  return <Navigate to="/pending-access" replace />;
}
