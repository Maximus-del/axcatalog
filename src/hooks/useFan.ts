// Fan relationship layer: who the signed-in user follows, and mutations to
// follow / unfollow / change follow state. Writes go to athlete_follows, which
// RLS restricts to fan_user_id = auth.uid().
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { AthleteFollowRow, FollowState } from "@/lib/ecosystem/types";

export function useFollows() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const query = useQuery({
    queryKey: ["fan-follows", uid],
    enabled: !!uid,
    queryFn: async (): Promise<AthleteFollowRow[]> => {
      const { data, error } = await supabase
        .from("athlete_follows" as never)
        .select("*")
        .eq("fan_user_id", uid!);
      if (error) throw error;
      return (data ?? []) as unknown as AthleteFollowRow[];
    },
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const followedIds = useMemo(
    () => new Set(rows.filter((r) => r.state !== "blocked" && r.state !== "former").map((r) => r.athlete_id)),
    [rows],
  );
  const byAthlete = useMemo(() => {
    const m = new Map<string, AthleteFollowRow>();
    for (const r of rows) m.set(r.athlete_id, r);
    return m;
  }, [rows]);

  return { ...query, rows, followedIds, byAthlete };
}

export function useFollowActions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id ?? null;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fan-follows", uid] });

  const follow = useMutation({
    mutationFn: async (athleteId: string) => {
      if (!uid) throw new Error("Sign in to follow athletes.");
      const { error } = await supabase
        .from("athlete_follows" as never)
        .upsert(
          { fan_user_id: uid, athlete_id: athleteId, state: "following" } as never,
          { onConflict: "fan_user_id,athlete_id" },
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const unfollow = useMutation({
    mutationFn: async (athleteId: string) => {
      if (!uid) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("athlete_follows" as never)
        .delete()
        .eq("fan_user_id", uid)
        .eq("athlete_id", athleteId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const setState = useMutation({
    mutationFn: async ({ athleteId, state }: { athleteId: string; state: FollowState }) => {
      if (!uid) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("athlete_follows" as never)
        .upsert(
          { fan_user_id: uid, athlete_id: athleteId, state } as never,
          { onConflict: "fan_user_id,athlete_id" },
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { follow, unfollow, setState };
}
