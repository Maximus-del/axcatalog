// Query hooks for content, events, plans, subscribers (fan + operator).
import { useQuery } from "@tanstack/react-query";
import * as c from "@/lib/ecosystem/content";

export function useAthleteContent(athleteId: string | undefined) {
  return useQuery({ queryKey: ["athlete-content", athleteId], enabled: !!athleteId, queryFn: () => c.fetchAthleteContent(athleteId!) });
}
export function useAthleteEvents(athleteId: string | undefined) {
  return useQuery({ queryKey: ["athlete-events", athleteId], enabled: !!athleteId, queryFn: () => c.fetchAthleteEvents(athleteId!) });
}
export function useFollowedContent(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({ queryKey: ["followed-content", key], enabled: ids.length > 0, queryFn: () => c.fetchPublicContentByAthletes(ids) });
}
export function useFollowedEvents(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({ queryKey: ["followed-events", key], enabled: ids.length > 0, queryFn: () => c.fetchEventsByAthletes(ids) });
}

// Operator
export function useOperatorContent(athleteId: string | undefined) {
  return useQuery({ queryKey: ["op-content", athleteId], enabled: !!athleteId, queryFn: () => c.listAthleteContent(athleteId!) });
}
export function useOperatorEvents(athleteId: string | undefined) {
  return useQuery({ queryKey: ["op-events", athleteId], enabled: !!athleteId, queryFn: () => c.listAthleteOrgEvents(athleteId!) });
}
export function useAthletePlans(athleteId: string | undefined) {
  return useQuery({ queryKey: ["athlete-plans", athleteId], enabled: !!athleteId, queryFn: () => c.listAthletePlans(athleteId!) });
}
export function useAthleteSubscribers(athleteId: string | undefined) {
  return useQuery({ queryKey: ["athlete-subs", athleteId], enabled: !!athleteId, queryFn: () => c.listAthleteSubscribers(athleteId!) });
}
