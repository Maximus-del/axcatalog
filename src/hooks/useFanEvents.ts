// Shared fan-event state: followed athletes + their products → one feed, and
// the projections (notifications, "new" ids). Every surface uses this so the
// feed, the bell, and the story rings can never drift apart.
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useFollows } from "@/hooks/useFan";
import { useDiscoverAthletes, useFeedProducts } from "@/hooks/useDiscoverAthletes";
import type { PublicAthlete, PublicAthleteProduct } from "@/lib/ecosystem/types";
import {
  buildFeed, feedToNotifications, newAthleteIds, pickFeatured,
  type EnrichedFeedItem, type NotifItem,
} from "@/lib/ecosystem/feed-engine";

export function useFanEvents() {
  const { followedIds, isLoading } = useFollows();
  const { data: athletes = [], isLoading: athletesLoading } = useDiscoverAthletes();
  const followedArr = useMemo(() => [...followedIds], [followedIds]);
  const { data: products = [] } = useFeedProducts(followedArr);

  const followed = useMemo(
    () => (athletes as PublicAthlete[]).filter((a) => followedIds.has(a.id)),
    [athletes, followedIds],
  );
  const productsByAthlete = useMemo(() => {
    const m = new Map<string, PublicAthleteProduct[]>();
    for (const p of products as PublicAthleteProduct[]) {
      const arr = m.get(p.athlete_id) ?? [];
      arr.push(p);
      m.set(p.athlete_id, arr);
    }
    return m;
  }, [products]);

  const feed = useMemo<EnrichedFeedItem[]>(() => buildFeed(followed, productsByAthlete), [followed, productsByAthlete]);
  const notifications = useMemo<NotifItem[]>(() => feedToNotifications(feed), [feed]);
  const newIds = useMemo(() => newAthleteIds(feed), [feed]);
  const featured = useMemo(() => pickFeatured(feed), [feed]);

  return {
    athletes: athletes as PublicAthlete[],
    followed, followedIds, feed, notifications, newIds, featured,
    loading: isLoading || athletesLoading,
  };
}

/** Last-seen tracking for the notification bell (stored in preferences.notif_seen). */
export function useNotifSeen() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id ?? null;

  const query = useQuery({
    queryKey: ["notif-seen", uid],
    enabled: !!uid,
    queryFn: async (): Promise<{ prefs: Record<string, unknown>; lastSeen: string | null }> => {
      const { data } = await supabase.from("fan_profiles" as never).select("preferences").eq("id", uid!).maybeSingle();
      const prefs = ((data as { preferences?: Record<string, unknown> } | null)?.preferences) ?? {};
      return { prefs, lastSeen: (prefs.notif_seen as string) ?? null };
    },
  });

  const markSeen = useMutation({
    mutationFn: async () => {
      if (!uid) return;
      const prefs = query.data?.prefs ?? {};
      await supabase
        .from("fan_profiles" as never)
        .update({ preferences: { ...prefs, notif_seen: new Date().toISOString() } } as never)
        .eq("id", uid);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-seen", uid] }),
  });

  // Hours since last seen; large when never seen (=> everything unread).
  const thresholdHours = useMemo(() => {
    const iso = query.data?.lastSeen;
    if (!iso) return 24 * 30;
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, ms / 3_600_000);
  }, [query.data?.lastSeen]);

  return { thresholdHours, markSeen: () => markSeen.mutate(), loading: query.isLoading };
}
