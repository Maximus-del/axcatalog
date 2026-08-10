import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Users, FolderKanban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";

interface Team {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  league: string | null;
  status: string;
  primary_color: string | null;
  secondary_color: string | null;
  notes: string | null;
  organization: { id: string; name: string } | null;
}

interface AthleteLite {
  id: string;
  full_name: string | null;
  first_name: string;
  last_name: string;
  position: string | null;
  jersey_number: string | null;
  status: string;
}
interface CollectionLite {
  id: string;
  name: string;
  collection_type: string;
  status: string;
}

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<AthleteLite[]>([]);
  const [collections, setCollections] = useState<CollectionLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data: t } = await supabase
        .from("teams")
        .select(
          `id, name, slug, city, league, status, primary_color, secondary_color, notes,
           organization:organizations!teams_organization_id_fkey(id, name)`,
        )
        .eq("id", id)
        .maybeSingle();

      if (!active) return;
      if (!t) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setTeam({
        ...t,
        organization: Array.isArray(t.organization)
          ? (t.organization[0] ?? null)
          : (t.organization as Team["organization"]),
      } as Team);

      const [ath, col] = await Promise.all([
        supabase
          .from("athletes")
          .select("id, full_name, first_name, last_name, position, jersey_number, status")
          .eq("current_team_id", id)
          .order("last_name", { ascending: true }),
        supabase
          .from("collections")
          .select("id, name, collection_type, status")
          .eq("team_id", id)
          .order("name", { ascending: true }),
      ]);
      if (!active) return;
      setRoster((ath.data ?? []) as AthleteLite[]);
      setCollections((col.data ?? []) as CollectionLite[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (notFound || !team) {
    return (
      <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4">
        <Link to="/admin/teams" className="text-accent text-sm">
          ← Back to Teams
        </Link>
        <div className="ax-card p-12 text-center text-muted-foreground">Team not found.</div>
      </div>
    );
  }

  const meta = [team.city, team.league, team.status].filter(Boolean);

  return (
    <div className="p-6 lg:p-8 max-w-[1200px] mx-auto space-y-6">
      <Link to="/admin/teams" className="text-muted-foreground hover:text-foreground text-sm">
        ← Back to Teams
      </Link>

      <header className="flex items-start gap-4">
        <div className="flex shrink-0 rounded-[14px] overflow-hidden h-16 w-16 border border-border">
          <span className="flex-1" style={{ background: team.primary_color ?? "hsl(var(--muted))" }} />
          <span
            className="flex-1"
            style={{ background: team.secondary_color ?? "hsl(var(--muted-foreground))" }}
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold truncate">{team.name}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {meta.join(" · ")}
            {team.organization && (
              <>
                {meta.length > 0 && " · "}
                <Link
                  to={`/admin/organizations/${team.organization.id}`}
                  className="text-accent hover:underline"
                >
                  {team.organization.name}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {team.notes && (
        <div className="ax-card text-sm text-muted-foreground whitespace-pre-wrap">{team.notes}</div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" /> Roster ({roster.length})
        </h2>
        {roster.length === 0 ? (
          <div className="ax-card p-6 text-sm text-muted-foreground">
            No athletes currently assigned to this team.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {roster.map((a) => {
              const name = a.full_name ?? `${a.first_name} ${a.last_name}`;
              const sub = [a.position, a.jersey_number ? `#${a.jersey_number.replace(/^#/, "")}` : null]
                .filter(Boolean)
                .join(" · ");
              return (
                <Link key={a.id} to={`/admin/athletes/${a.id}`} className="ax-card-hover flex items-center gap-3">
                  <div
                    className="flex items-center justify-center h-10 w-10 rounded-full text-xs font-semibold text-white shrink-0"
                    style={{ background: avatarColorFor(name) }}
                  >
                    {initialsFor(name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    <div className="text-xs text-muted-foreground truncate">{sub || "—"}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderKanban className="h-4 w-4" /> Collections ({collections.length})
        </h2>
        {collections.length === 0 ? (
          <div className="ax-card p-6 text-sm text-muted-foreground">No collections for this team.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {collections.map((c) => (
              <Link key={c.id} to={`/admin/collections/${c.id}`} className="ax-card-hover">
                <div className="font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted-foreground capitalize truncate">{c.collection_type}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
