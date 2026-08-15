import { useQuery } from "@tanstack/react-query";
import {
  listAthleteCollections,
  listAthleteDrops,
  listDesignTemplates,
  listDesignTemplatesFull,
  fetchDesignTemplate,
  fetchTemplateUsage,
  listTemplateApplications,
  listAthletesWithProfiles,
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

// Library view: full template records plus how many athletes use each one.
export function useDesignTemplateLibrary(includeArchived = false) {
  return useQuery({
    queryKey: ["design-template-library", includeArchived],
    queryFn: async () => {
      const [templates, usage] = await Promise.all([listDesignTemplatesFull(includeArchived), fetchTemplateUsage()]);
      return { templates, usage };
    },
  });
}

export function useDesignTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ["design-template", id],
    queryFn: () => fetchDesignTemplate(id!),
    enabled: !!id,
  });
}

export function useTemplateApplications(templateId: string | undefined) {
  return useQuery({
    queryKey: ["design-template-applications", "template", templateId],
    queryFn: () => listTemplateApplications(templateId!),
    enabled: !!templateId,
  });
}

// Athletes + preference profiles, cached once and reused by the reverse match.
export function useAthletesWithProfiles(enabled = true) {
  return useQuery({
    queryKey: ["athletes-with-profiles"],
    queryFn: listAthletesWithProfiles,
    enabled,
    staleTime: 60_000,
  });
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
