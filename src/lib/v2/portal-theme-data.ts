// Reading and saving a client's portal theme from V2.
//
// The theme lives in athletes.metadata.portal_theme (see
// lib/portal/portal-theme.ts). Writes need an operator — "org write athletes"
// requires current_user_is_operator() — so a client session cannot change its
// own look even by calling the API directly. That is the agreement: Chase
// controls the look, the client sees it.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  luminance,
  mergePortalTheme,
  normalizeHex,
  parsePortalTheme,
  DEFAULT_PORTAL_THEME,
  type PortalTheme,
} from "@/lib/portal/portal-theme";
import { t, type Row } from "./db";

export interface ThemePreset {
  label: string;
  theme: PortalTheme;
}

export interface PortalThemeSettings {
  theme: PortalTheme;
  /** One preset per team they have played for, built from the team's colours. */
  presets: ThemePreset[];
}

export const portalThemeKey = (entityId: string) => ["v2", "portal-theme", entityId];

/**
 * A team's two colours, turned into a theme: the darker one becomes the header,
 * the other the accent. Bears navy/orange → navy header, orange accent. A team
 * with only one usable colour gets it as the accent on the AX dark header.
 */
export function teamPreset(
  name: string,
  primary: unknown,
  secondary: unknown,
  base: PortalTheme = DEFAULT_PORTAL_THEME,
): ThemePreset | null {
  const colours = [normalizeHex(primary), normalizeHex(secondary)].filter((c): c is string => !!c);
  if (colours.length === 0) return null;
  let accent = colours[0];
  let header = base.header;
  if (colours.length === 2) {
    const [dark, light] = [...colours].sort((a, b) => luminance(a) - luminance(b));
    // Two near-black colours (Raiders) would give a black-on-black header.
    if (luminance(light) > 0.03) {
      header = dark;
      accent = light;
    }
  }
  return {
    label: name,
    theme: { ...base, accent, header, title: "#ffffff" },
  };
}

async function fetchPortalTheme(entityId: string): Promise<PortalThemeSettings> {
  const [athleteRes, teamsRes] = await Promise.all([
    t("athletes").select("metadata").eq("id", entityId).maybeSingle(),
    t("team_memberships")
      .select("start_date, team:teams(name, primary_color, secondary_color)")
      .eq("athlete_id", entityId)
      .order("start_date", { ascending: false }),
  ]);
  if (athleteRes.error) throw new Error(athleteRes.error.message);
  const metadata = (athleteRes.data as Row | null)?.metadata as Record<string, unknown> | undefined;
  const theme = parsePortalTheme(metadata?.portal_theme);

  // Team presets are a convenience; a failure there should not hide the editor.
  const presets: ThemePreset[] = [];
  const seen = new Set<string>();
  for (const row of ((teamsRes.error ? [] : teamsRes.data) ?? []) as Row[]) {
    const team = row.team as Row | null;
    const name = typeof team?.name === "string" ? team.name : null;
    if (!team || !name || seen.has(name)) continue;
    seen.add(name);
    const p = teamPreset(name, team.primary_color, team.secondary_color, theme);
    if (p) presets.push(p);
  }
  return { theme, presets };
}

export function usePortalThemeSettings(entityId: string) {
  return useQuery({
    queryKey: portalThemeKey(entityId),
    queryFn: () => fetchPortalTheme(entityId),
    enabled: !!entityId,
  });
}

/**
 * Save = read metadata fresh, change only portal_theme, write it back.
 *
 * Fresh rather than from the query cache, because other screens write other
 * keys of the same blob and a stale copy would put their old values back.
 * `.select("id")` on the update, because an RLS-rejected update is not an
 * error — it matches zero rows and reports success.
 */
export function useSavePortalTheme(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (theme: PortalTheme) => {
      const current = (await t("athletes").select("metadata").eq("id", entityId).maybeSingle()) as {
        data: Row | null;
        error: { message: string } | null;
      };
      if (current.error) throw new Error(current.error.message);
      if (!current.data) throw new Error("This entity could not be found.");
      const next = mergePortalTheme(current.data.metadata, theme);
      const res = (await t("athletes")
        .update({ metadata: next } as never)
        .eq("id", entityId)
        .select("id")) as { data: Row[] | null; error: { message: string } | null };
      if (res.error) throw new Error(res.error.message);
      if (!res.data || res.data.length !== 1) {
        throw new Error("The change was not saved — you may not have access to edit this entity.");
      }
      return parsePortalTheme(next.portal_theme);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: portalThemeKey(entityId) }),
  });
}
