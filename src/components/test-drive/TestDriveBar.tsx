// The strip across the top of every Test drive screen: who you are (Owner /
// Team / Customer), which step you're on, jump anywhere, exit back to V2.
// Deliberately NOT in the client's theme — it should never be mistaken for
// part of their portal.
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Car, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DRIVE_ROLES,
  DRIVE_STAGES,
  driveHref,
  lockerIsOpen,
  lockerSlugOf,
  type DriveRole,
  type DriveStage,
} from "@/lib/portal/test-drive";

export interface DriveEntity {
  id: string;
  name: string;
  theme: unknown;
  lockerSlug: string;
  lockerOpen: boolean;
}

/** The entity being driven. Operators can read any athletes row in their org. */
export function useDriveEntity(entityId: string | null | undefined) {
  return useQuery({
    queryKey: ["test-drive-entity", entityId],
    enabled: Boolean(entityId),
    staleTime: 60_000,
    queryFn: async (): Promise<DriveEntity | null> => {
      const { data, error } = await supabase
        .from("athletes")
        .select("id, display_name, full_name, slug, metadata")
        .eq("id", entityId as string)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const row = data as unknown as { id: string; display_name: string | null; full_name: string | null; slug: string | null; metadata: Record<string, unknown> | null };
      return {
        id: row.id,
        name: row.display_name || row.full_name || "Client",
        theme: row.metadata?.portal_theme ?? {},
        lockerSlug: lockerSlugOf(row.metadata, row.slug),
        lockerOpen: lockerIsOpen(row.metadata),
      };
    },
  });
}

interface Props {
  entityId: string;
  role: DriveRole;
  stage: DriveStage;
}

export function TestDriveBar({ entityId, role, stage }: Props) {
  const entity = useDriveEntity(entityId);
  const navigate = useNavigate();
  const slug = entity.data?.lockerSlug ?? "";
  const go = (r: DriveRole, s: DriveStage) => navigate(driveHref(entityId, r, s, slug));

  const note =
    role === "customer"
      ? entity.data && !entity.data.lockerOpen
        ? "Preview — this locker isn't public yet. Checkout is real Shopify."
        : "Checkout is real Shopify — abandon it at payment."
      : stage === "portal" || stage === "gear" || stage === "brand"
        ? "Real portal, read-only — orders and edits are blocked."
        : "Nothing is saved or created.";

  return (
    <div className="sticky top-0 z-[60] border-b border-yellow-400/40 bg-zinc-950 text-zinc-100 shadow-lg" role="region" aria-label="Test drive controls">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-yellow-300">
          <Car className="h-4 w-4" /> Test drive
        </span>
        <span className="max-w-[160px] truncate font-semibold">{entity.data?.name ?? "…"}</span>

        <div className="flex overflow-hidden rounded-full border border-zinc-700" role="group" aria-label="Who you are">
          {DRIVE_ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              title={r.sub}
              aria-pressed={role === r.value}
              onClick={() => go(r.value, r.value === role ? stage : DRIVE_STAGES[r.value][0].value)}
              className={`px-3 py-1 font-semibold ${role === r.value ? "bg-yellow-300 text-zinc-950" : "hover:bg-zinc-800"}`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Step">
          {DRIVE_STAGES[role].map((s, i) => (
            <button
              key={s.value}
              type="button"
              aria-current={stage === s.value ? "step" : undefined}
              onClick={() => go(role, s.value)}
              className={`rounded-full px-2.5 py-1 ${stage === s.value ? "bg-zinc-100 font-semibold text-zinc-950" : "text-zinc-300 hover:bg-zinc-800"}`}
            >
              <span className="mr-1 opacity-50">{i + 1}</span>
              {s.label}
            </button>
          ))}
        </div>

        <span className="hidden text-zinc-400 lg:inline">{note}</span>

        <Link to={`/admin-v2/people/${entityId}`} className="ml-auto flex items-center gap-1 rounded-full border border-zinc-700 px-3 py-1 font-semibold hover:bg-zinc-800">
          <X className="h-3.5 w-3.5" /> Exit
        </Link>
      </div>
    </div>
  );
}
