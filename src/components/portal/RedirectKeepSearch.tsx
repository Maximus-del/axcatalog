import { Navigate, useLocation } from "react-router-dom";

/** Redirect that keeps the query string — `?as=` (View as) and filters like `?collection=`. */
export function RedirectKeepSearch({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}
