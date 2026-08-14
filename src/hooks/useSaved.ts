// Saved items — one area for products / content / camps / events / articles /
// athletes. Backed by the saved_items table (RLS: fan owns their rows).
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";

export type SavedType = "product" | "content" | "camp" | "event" | "article" | "athlete";

export interface SavedRow {
  id: string;
  item_type: SavedType;
  item_ref: string;
  athlete_id: string | null;
  title: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SaveInput {
  type: SavedType;
  ref: string;
  athleteId?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown>;
}

export const savedKey = (type: SavedType, ref: string) => `${type}:${ref}`;

export function useSavedItems() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const query = useQuery({
    queryKey: ["saved-items", uid],
    enabled: !!uid,
    queryFn: async (): Promise<SavedRow[]> => {
      const { data, error } = await supabase
        .from("saved_items" as never)
        .select("*")
        .eq("fan_user_id", uid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SavedRow[];
    },
  });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const keys = useMemo(() => new Set(rows.map((r) => savedKey(r.item_type, r.item_ref))), [rows]);
  return { ...query, rows, keys };
}

export function useSaveActions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id ?? null;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["saved-items", uid] });

  const save = useMutation({
    mutationFn: async (input: SaveInput) => {
      if (!uid) throw new Error("Sign in to save.");
      const { error } = await supabase.from("saved_items" as never).upsert(
        {
          fan_user_id: uid,
          item_type: input.type,
          item_ref: input.ref,
          athlete_id: input.athleteId ?? null,
          title: input.title ?? null,
          metadata: input.metadata ?? {},
        } as never,
        { onConflict: "fan_user_id,item_type,item_ref" },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const unsave = useMutation({
    mutationFn: async ({ type, ref }: { type: SavedType; ref: string }) => {
      if (!uid) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("saved_items" as never)
        .delete()
        .eq("fan_user_id", uid)
        .eq("item_type", type)
        .eq("item_ref", ref);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { save, unsave };
}
