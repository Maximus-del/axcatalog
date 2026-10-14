import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { useEntities } from "@/lib/v2/data";
import { typeLabel } from "@/lib/v2/entity";
import type { Entity } from "@/lib/v2/types";
import { AssetImage } from "../primitives";

// ONE PICKER, THREE CALLERS.
//
// The tray pins destinations with it, the bulk bar assigns with it, and Quick
// Sort will add from it. It was inline in DesignInbox and about to be copied,
// which is how two searches start disagreeing about whether demo entities show
// up.
//
// `multi` is what section 6 of the spec needs: design_athletes has a composite
// primary key, so one design legitimately belongs to an athlete AND their club.
// The mutation has always accepted an array; only this UI ever restricted it.

export default function EntityPicker({
  multi = false,
  busy = false,
  exclude = [],
  confirmLabel = "Apply",
  onPick,
  autoFocus = true,
}: {
  multi?: boolean;
  busy?: boolean;
  /** Already pinned / already assigned — shown as done rather than offered again. */
  exclude?: string[];
  confirmLabel?: string;
  onPick: (entities: Entity[]) => void;
  autoFocus?: boolean;
}) {
  const entities = useEntities();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);

  const people = useMemo(() => {
    const all = (entities.data ?? []).filter((e) => !e.isDemo);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (e) => e.name.toLowerCase().includes(q) || (e.teamName ?? "").toLowerCase().includes(q),
    );
  }, [entities.data, query]);

  const excluded = useMemo(() => new Set(exclude), [exclude]);

  const commit = (ids: string[]) => {
    const byId = new Map((entities.data ?? []).map((e) => [e.id, e]));
    const picked = ids.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => Boolean(e));
    if (picked.length === 0) return;
    onPick(picked);
    setChosen([]);
    setQuery("");
  };

  return (
    <div className="rounded-xl border border-[hsl(var(--ax-border))] p-3">
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-faint))]" aria-hidden />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a person, club, school or organisation"
          className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
        />
      </div>

      <div className="grid max-h-[240px] grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
        {people.map((e) => {
          const already = excluded.has(e.id);
          const picked = chosen.includes(e.id);
          return (
            <button
              key={e.id}
              type="button"
              disabled={busy || already}
              onClick={() =>
                multi
                  ? setChosen((prev) => (prev.includes(e.id) ? prev.filter((x) => x !== e.id) : [...prev, e.id]))
                  : commit([e.id])
              }
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11.5px] transition-colors disabled:opacity-45 ${
                picked
                  ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.1)] text-[hsl(var(--ax-ink))]"
                  : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))] hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-ink))]"
              }`}
            >
              <AssetImage url={e.avatarUrl} alt={e.name} className="h-6 w-6 shrink-0 rounded-md" fallbackSeed={e.id} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{e.name}</span>
                <span className="block truncate text-[10px] text-[hsl(var(--ax-faint))]">
                  {already ? "Already there" : typeLabel(e.entityType)}
                </span>
              </span>
              {picked && <Check className="h-3 w-3 shrink-0 text-[hsl(var(--ax-accent))]" />}
            </button>
          );
        })}

        {entities.isLoading && (
          <p className="col-span-full py-3 text-center text-[11.5px] text-[hsl(var(--ax-faint))]">Loading people…</p>
        )}
        {!entities.isLoading && people.length === 0 && (
          <p className="col-span-full py-3 text-center text-[11.5px] text-[hsl(var(--ax-faint))]">
            Nobody matches that.
          </p>
        )}
      </div>

      {multi && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-[hsl(var(--ax-faint))]">
            {chosen.length === 0
              ? "Pick one or more. Artwork can belong to a person and their club."
              : `${chosen.length} chosen`}
          </span>
          <button
            type="button"
            disabled={busy || chosen.length === 0}
            onClick={() => commit(chosen)}
            className="rounded-full bg-[hsl(var(--ax-accent))] px-3 py-1 text-[11.5px] font-medium text-[hsl(var(--ax-on-accent))] disabled:opacity-40"
          >
            {confirmLabel}
          </button>
        </div>
      )}
    </div>
  );
}
