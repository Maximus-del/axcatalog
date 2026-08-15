import { useQuery } from "@tanstack/react-query";
import {
  listAthleteCollections,
  listAthleteDrops,
  listDesignTemplates,
  fetchPreferenceProfile,
  listCollectionProducts,
  listAthleteSelectableProducts,
  type SelectableProduct,
} from "@/lib/ecosystem/commerce";

export function useAthleteCollections(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["athlete-collections", athleteId],
    queryFn: () => listAthleteCollections(athleteId!),
    enabled: !!athleteId,
  });
}

export function useAthleteDrops(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["athlete-drops", athleteId],
    queryFn: () => listAthleteDrops(athleteId!),
    enabled: !!athleteId,
  });
}

export function useDesignTemplates() {
  return useQuery({ queryKey: ["design-templates"], queryFn: listDesignTemplates });
}

export function useAthletePreferenceProfile(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["preference-profile", "athlete", athleteId],
    queryFn: () => fetchPreferenceProfile("athlete", athleteId!),
    enabled: !!athleteId,
  });
}

// Products selectable for a Drop: the collection's products if a collection is
// chosen, otherwise all of the athlete's products.
export function useDropSelectableProducts(athleteId: string | undefined, collectionId: string | null) {
  return useQuery<SelectableProduct[]>({
    queryKey: ["drop-selectable-products", athleteId, collectionId],
    queryFn: () => (collectionId ? listCollectionProducts(collectionId) : listAthleteSelectableProducts(athleteId!)),
    enabled: !!athleteId,
  });
}
