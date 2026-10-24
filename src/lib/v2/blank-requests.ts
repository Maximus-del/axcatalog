// Operator side of the portal blank catalog: what a client asked to add to
// their shop, and moving it along (in design → in their shop, or declined).
// blank_requests RLS is operator-only.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { must, t, type Row } from "./db";

export type BlankRequestStatus = "pending" | "in_progress" | "added" | "declined";

export interface BlankRequestRow {
  id: string;
  blankName: string;
  garmentType: string | null;
  colors: string[];
  quantity: number | null;
  notes: string | null;
  tier: string;
  unitPrice: number | null;
  status: BlankRequestStatus;
  createdAt: string;
}

const key = (entityId: string) => ["v2", "blank-requests", entityId];
const STATUSES: BlankRequestStatus[] = ["pending", "in_progress", "added", "declined"];

/** Pure: rows + lookups → requests, open ones first. Exported for tests. */
export function toBlankRequests(rows: Row[], blanks: Map<string, Row>, colors: Map<string, string>): BlankRequestRow[] {
  const rank: Record<BlankRequestStatus, number> = { pending: 0, in_progress: 1, added: 2, declined: 3 };
  return rows
    .map((r) => {
      const b = blanks.get(String(r.blank_id));
      const status = STATUSES.includes(r.status as BlankRequestStatus) ? (r.status as BlankRequestStatus) : "pending";
      return {
        id: String(r.id),
        blankName: String(b?.display_name || b?.name || "Blank"),
        garmentType: typeof b?.garment_type === "string" ? b.garment_type : null,
        colors: (Array.isArray(r.color_ids) ? r.color_ids : []).map((id) => colors.get(String(id))).filter((n): n is string => Boolean(n)),
        quantity: typeof r.quantity === "number" ? r.quantity : null,
        notes: typeof r.notes === "string" ? r.notes : null,
        tier: String(r.tier ?? ""),
        unitPrice: r.quoted_unit_price == null ? null : Number(r.quoted_unit_price),
        status,
        createdAt: String(r.created_at ?? ""),
      };
    })
    .sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt.localeCompare(a.createdAt));
}

export function useBlankRequests(entityId: string) {
  return useQuery({
    queryKey: key(entityId),
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const req = await t("blank_requests")
        .select("id, blank_id, color_ids, quantity, notes, tier, quoted_unit_price, status, created_at")
        .eq("athlete_id", entityId)
        .order("created_at", { ascending: false });
      if (req.error) throw new Error(req.error.message);
      const rows = (req.data ?? []) as Row[];
      if (!rows.length) return [];
      const blankIds = Array.from(new Set(rows.map((r) => String(r.blank_id))));
      const colorIds = Array.from(new Set(rows.flatMap((r) => (Array.isArray(r.color_ids) ? r.color_ids.map(String) : []))));
      const [b, c] = await Promise.all([
        t("v2_blanks").select("id, display_name, name, garment_type").in("id", blankIds),
        colorIds.length ? t("v2_blank_colors").select("id, display_name, name").in("id", colorIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (b.error) throw new Error(b.error.message);
      if (c.error) throw new Error((c.error as { message: string }).message);
      const blanks = new Map(((b.data ?? []) as Row[]).map((x) => [String(x.id), x]));
      const colors = new Map(((c.data ?? []) as Row[]).map((x) => [String(x.id), String(x.display_name || x.name || "")]));
      return toBlankRequests(rows, blanks, colors);
    },
  });
}

export function useSetBlankRequestStatus(entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; status: BlankRequestStatus }) => {
      const res = await must(
        t("blank_requests")
          .update({ status: v.status, decided_at: v.status === "pending" ? null : new Date().toISOString() } as never)
          .eq("id", v.id)
          .select("id"),
      );
      if (!(res.data as Row[] | null)?.length) throw new Error("That request couldn't be updated.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key(entityId) }),
  });
}
