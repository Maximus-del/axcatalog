import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  listTemplatePrompts,
  listReferenceSets,
  fetchInstance,
  listPromptPackages,
  listConceptsForInstance,
  listConceptsForAthlete,
  fetchAthleteFreeText,
} from "@/lib/ecosystem/creative";

export function useTemplatePrompts(templateId: string | undefined) {
  return useQuery({
    queryKey: ["template-prompts", templateId],
    queryFn: () => listTemplatePrompts(templateId!),
    enabled: !!templateId,
  });
}

export function useReferenceSets(templateId: string | undefined) {
  return useQuery({
    queryKey: ["reference-sets", templateId],
    queryFn: () => listReferenceSets(templateId!),
    enabled: !!templateId,
  });
}

export function useInstance(applicationId: string | undefined) {
  return useQuery({
    queryKey: ["template-instance", applicationId],
    queryFn: () => fetchInstance(applicationId!),
    enabled: !!applicationId,
  });
}

export function usePromptPackages(applicationId: string | undefined) {
  return useQuery({
    queryKey: ["prompt-packages", applicationId],
    queryFn: () => listPromptPackages(applicationId!),
    enabled: !!applicationId,
  });
}

export function useInstanceConcepts(applicationId: string | undefined) {
  return useQuery({
    queryKey: ["instance-concepts", applicationId],
    queryFn: () => listConceptsForInstance(applicationId!),
    enabled: !!applicationId,
  });
}

export function useAthleteConcepts(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["athlete-concepts", athleteId],
    queryFn: () => listConceptsForAthlete(athleteId!),
    enabled: !!athleteId,
  });
}

export function useAthleteFreeText(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["athlete-free-text", athleteId],
    queryFn: () => fetchAthleteFreeText(athleteId!),
    enabled: !!athleteId,
    staleTime: 5 * 60_000,
  });
}

export interface AthleteContext {
  id: string;
  organization_id: string;
  full_name: string | null;
  first_name: string;
  last_name: string;
  slug: string;
  jersey_number: string | number | null;
  position: string | null;
  league: string | null;
  metadata: Record<string, unknown> | null;
  team: { name: string | null; city: string | null; primary_color: string | null; secondary_color: string | null } | null;
}

/** Athlete plus their team — everything the variable resolver needs, in one read. */
export function useAthleteContext(athleteId: string | undefined) {
  return useQuery<AthleteContext | null>({
    queryKey: ["athlete-context", athleteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("athletes")
        .select(
          `id, organization_id, full_name, first_name, last_name, slug, jersey_number, position, league, metadata,
           team:teams!athletes_current_team_id_fkey(name, city, primary_color, secondary_color)`,
        )
        .eq("id", athleteId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as Omit<AthleteContext, "team"> & { team: AthleteContext["team"] | AthleteContext["team"][] };
      return { ...row, team: Array.isArray(row.team) ? (row.team[0] ?? null) : row.team };
    },
    enabled: !!athleteId,
  });
}
