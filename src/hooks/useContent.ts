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
export function useDomainEvents(limit = 80) {
  return useQuery({ queryKey: ["domain-events", limit], queryFn: () => c.fetchDomainEvents(limit) });
}
export function useTemplates() {
  return useQuery({ queryKey: ["templates"], queryFn: () => c.listTemplates() });
}
export function useAthleteOperatorProducts(athleteId: string | undefined) {
  return useQuery({ queryKey: ["op-products", athleteId], enabled: !!athleteId, queryFn: () => c.fetchAthleteOperatorProducts(athleteId!) });
}
export function usePendingProducts(athleteId: string | undefined) {
  return useQuery({ queryKey: ["pending-products", athleteId], enabled: !!athleteId, queryFn: () => c.fetchPendingProducts(athleteId!) });
}
