// The portal adapter as React hooks — what Lovable's components call.
//
// Every hook takes its scope from the portal shell (useCurrentAthlete →
// PortalDataContext), never from a prop or URL a component invents: the
// athlete row that scope comes from is one the database already let this
// session read, and server functions re-check it.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePortalData } from "@/components/portal/PortalDataContext";
import type { PortalScope } from "@/lib/portal/api/contract";
import { defaultSummaryPeriod, fetchRevenue, fetchSummary } from "@/lib/portal/api/summary";
import { fetchDestinations } from "@/lib/portal/api/destinations";
import { lastMonths, viewerTimeZone, type Period } from "@/lib/portal/api/period";

export function usePortalScope(): PortalScope {
  const { athlete, isImpersonating } = usePortalData();
  return useMemo(
    () => ({ athleteId: athlete.id, organizationId: athlete.organization_id, viewingAs: isImpersonating }),
    [athlete.id, athlete.organization_id, isImpersonating],
  );
}

const keyFor = (scope: PortalScope, ...rest: unknown[]) => ["portal-api", scope.athleteId, scope.viewingAs, ...rest];

/** Locker Room / Brand HQ headline numbers. Period defaults to the last 12 months in the viewer's zone. */
export function usePortalSummary(period?: Period) {
  const scope = usePortalScope();
  const p = useMemo(() => period ?? defaultSummaryPeriod(viewerTimeZone()), [period]);
  return useQuery({
    queryKey: keyFor(scope, "summary", p.from, p.to, p.timeZone),
    queryFn: () => fetchSummary(scope, p),
    staleTime: 60_000,
  });
}

/** Brand HQ chart + top products for a period. */
export function usePortalRevenue(months = 12) {
  const scope = usePortalScope();
  const p = useMemo(() => lastMonths(months, viewerTimeZone()), [months]);
  return useQuery({
    queryKey: keyFor(scope, "revenue", p.from, p.to, p.timeZone),
    queryFn: () => fetchRevenue(scope, p),
    staleTime: 60_000,
  });
}

/** The Locker Room wall: one destination per active collection. */
export function usePortalDestinations() {
  const scope = usePortalScope();
  return useQuery({
    queryKey: keyFor(scope, "destinations"),
    queryFn: () => fetchDestinations(scope),
    staleTime: 5 * 60_000,
  });
}
