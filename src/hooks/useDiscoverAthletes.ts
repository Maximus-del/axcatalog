// Fan-facing athlete discovery + single-athlete public profile + their merch.
// Reads ONLY from the public_athletes / public_athlete_products views, which
// expose a safe column allow-list (never query athletes/products directly here).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PublicAthlete, PublicAthleteProduct } from "@/lib/ecosystem/types";

const ATHLETE_COLS =
  "id, slug, full_name, first_name, last_name, position, jersey_number, league, organization_id, org_name, org_slug, org_type, team_name, team_slug";
const PRODUCT_COLS =
  "id, title, slug, description, price, compare_at_price, shopify_handle, athlete_id, athlete_role, organization_id, created_at, updated_at, image_bucket, image_path";

export function useDiscoverAthletes() {
  return useQuery({
    queryKey: ["public-athletes"],
    queryFn: async (): Promise<PublicAthlete[]> => {
      const { data, error } = await supabase
        .from("public_athletes" as never)
        .select(ATHLETE_COLS)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PublicAthlete[];
    },
  });
}

export function useAthletePublic(slug: string | undefined) {
  return useQuery({
    queryKey: ["public-athlete", slug],
    enabled: !!slug,
    queryFn: async (): Promise<PublicAthlete | null> => {
      const { data, error } = await supabase
        .from("public_athletes" as never)
        .select(ATHLETE_COLS)
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as PublicAthlete | null) ?? null;
    },
  });
}

export function useAthleteProducts(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["public-athlete-products", athleteId],
    enabled: !!athleteId,
    queryFn: async (): Promise<PublicAthleteProduct[]> => {
      const { data, error } = await supabase
        .from("public_athlete_products" as never)
        .select(PRODUCT_COLS)
        .eq("athlete_id", athleteId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PublicAthleteProduct[];
    },
  });
}

/** Products across a set of followed athletes — the personalized feed source. */
export function useFeedProducts(athleteIds: string[]) {
  const key = [...athleteIds].sort().join(",");
  return useQuery({
    queryKey: ["fan-feed-products", key],
    enabled: athleteIds.length > 0,
    queryFn: async (): Promise<PublicAthleteProduct[]> => {
      const { data, error } = await supabase
        .from("public_athlete_products" as never)
        .select(PRODUCT_COLS)
        .in("athlete_id", athleteIds)
        .order("updated_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as unknown as PublicAthleteProduct[];
    },
  });
}
