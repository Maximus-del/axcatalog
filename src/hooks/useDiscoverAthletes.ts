// Thin query hooks over the fan data service layer (src/lib/ecosystem/services).
// No Supabase calls live here — swap the backend in services.ts, not here.
import { useQuery } from "@tanstack/react-query";
import type { PublicAthlete, PublicAthleteProduct } from "@/lib/ecosystem/types";
import * as svc from "@/lib/ecosystem/services";

export function useDiscoverAthletes() {
  return useQuery<PublicAthlete[]>({
    queryKey: ["public-athletes"],
    queryFn: () => svc.fetchAthletes(),
  });
}

export function useAthletePublic(slug: string | undefined) {
  return useQuery<PublicAthlete | null>({
    queryKey: ["public-athlete", slug],
    enabled: !!slug,
    queryFn: () => svc.fetchAthleteBySlug(slug!),
  });
}

export function useAthleteProducts(athleteId: string | undefined) {
  return useQuery<PublicAthleteProduct[]>({
    queryKey: ["public-athlete-products", athleteId],
    enabled: !!athleteId,
    queryFn: () => svc.fetchAthleteProducts(athleteId!),
  });
}

export function useProductById(id: string | undefined) {
  return useQuery<PublicAthleteProduct | null>({
    queryKey: ["public-product", id],
    enabled: !!id,
    queryFn: () => svc.fetchProductById(id!),
  });
}

/**
 * Network-wide products. The limit is applied AFTER the cache, not inside the
 * query key: callers asked for 24 and 48 and got two independent fetches and
 * two caches of overlapping rows, so the same product could be stale on one
 * screen and fresh on the next.
 */
const ALL_PRODUCTS_LIMIT = 48;

export function useAllAthleteProducts(limit = ALL_PRODUCTS_LIMIT) {
  return useQuery<PublicAthleteProduct[], Error, PublicAthleteProduct[]>({
    queryKey: ["all-athlete-products"],
    queryFn: () => svc.fetchAllProducts(ALL_PRODUCTS_LIMIT),
    select: (rows) => (limit < rows.length ? rows.slice(0, limit) : rows),
  });
}

/** Products across a set of followed athletes — the personalized feed source. */
export function useFeedProducts(athleteIds: string[]) {
  const key = [...athleteIds].sort().join(",");
  return useQuery<PublicAthleteProduct[]>({
    queryKey: ["fan-feed-products", key],
    enabled: athleteIds.length > 0,
    queryFn: () => svc.fetchProductsByAthletes(athleteIds),
  });
}
