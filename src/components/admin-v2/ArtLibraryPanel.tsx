import { useMemo, useRef, useState } from "react";
import { Link2, Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Entity, EntityCounts } from "@/lib/v2/types";
import {
  ART_ROLES, countByRole, filterArt, pairFor, useClientArt, useSetArtRole, useUploadArt,
  type ArtItem, type ArtRole, type ArtTab,
} from "@/lib/v2/art-library";

// CLIENT ART — pick a client, browse their print PNGs by Logos / Fronts /
// Backs, click one to put it on the shirt. A front brings its back along when
// "Pair front + back" is on; turn it off to mix and match.

const TABS: Array<{ tab: ArtTab; label: string }> = [
  { tab: "all", label: "All" },
  { tab: "logo", label: "Logos" },
  { tab: "front", label: "Fronts" },
  { tab: "back", label: "Backs" },
  { tab: "other", label: "Other" },
];

const field = "rounded-lg border border-[hsl(var(--ax-border))] bg-white px-2.5 py-1.5 text-[12.5px] text-[hsl(var(--ax-ink))]";
const tabCls = (on: boolean) => `rounded-full px-3 py-1 text-[12px] ${on ? "bg-[hsl(var(--ax-ink))] text-white" : "text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"}`;

export function ArtLibraryPanel({
  entities, clientId, onClientChange, autoPair, onAutoPairChange, onPick, activeFileIds,
}: {
  entities: Array<Entity & { counts?: EntityCounts }>;
  clientId: string | null;
  onClientChange: (id: string | null) => void;
  autoPair: boolean;
  onAutoPairChange: (on: boolean) => void;
  /** Called with the picked file and, when pairing applies, its other half. */
  onPick: (item: ArtItem, pair: ArtItem | null) => void;
  activeFileIds: Set<string>;
}) {
  const client = entities.find((e) => e.id === clientId) ?? null;
  const art = useClientArt(clientId);
  const setRole = useSetArtRole(clientId);
  const upload = useUploadArt(clientId, client?.organizationId ?? null);
  const [tab, setTab] = useState<ArtTab>("all");
  const [query, setQuery] = useState("");
  const [upRole, setUpRole] = useState<ArtRole>("front");
  const [upSet, setUpSet] = useState<string>("new");
  const [upTitle, setUpTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => art.data ?? [], [art.data]);
  const counts = countByRole(items);
  const shown = filterArt(items, tab, query);
  const sets = useMemo(() => [...new Map(items.map((i) => [i.designId, i.designTitle])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [items]);
  // Clients with designs first, then alphabetical.
  const clients = useMemo(() => [...entities].sort((a, b) => (b.counts?.designs ?? 0) - (a.counts?.designs ?? 0) || a.name.localeCompare(b.name)), [entities]);

  const doUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    let designId: string | null = upSet === "new" ? null : upSet;
    for (const f of Array.from(files)) {
      try {
        // Several files into a "new set" all land in the SAME new set.
        const r = await upload.mutateAsync({ file: f, role: upRole, designId, newTitle: upTitle });
        designId = r.designId;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not upload ${f.name}`);
      }
    }
    if (designId) setUpSet(designId);
    toast.success(`Added to ${client?.name ?? "the client"}'s library`);
  };

  return (
    <section className="ax-card mb-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--ax-secondary))]">Client art</p>
        <select className={`${field} min-w-[220px]`} value={clientId ?? ""} onChange={(e) => onClientChange(e.target.value || null)}>
          <option value="">Pick a client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}{c.counts?.designs ? ` · ${c.counts.designs}` : ""}</option>)}
        </select>
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-[hsl(var(--ax-secondary))]" title="Picking a front also loads that design's back (and the other way round)">
          <input type="checkbox" checked={autoPair} onChange={(e) => onAutoPairChange(e.target.checked)} /><Link2 className="h-3.5 w-3.5" />Pair front + back
        </label>
      </div>

      {clientId && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {TABS.map((t) => (
              <button key={t.tab} type="button" className={tabCls(tab === t.tab)} onClick={() => setTab(t.tab)}>
                {t.label} <span className="opacity-60">{counts[t.tab]}</span>
              </button>
            ))}
            <span className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
              <input className={`${field} w-44 pl-7`} placeholder="Search designs" value={query} onChange={(e) => setQuery(e.target.value)} />
            </span>
          </div>

          <div className="mt-3 grid max-h-[300px] grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2 overflow-y-auto pr-1">
            {art.isLoading && <p className="col-span-full flex items-center gap-2 py-6 text-[12px] text-[hsl(var(--ax-faint))]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading art…</p>}
            {!art.isLoading && !shown.length && (
              <p className="col-span-full py-6 text-center text-[12px] text-[hsl(var(--ax-faint))]">
                {items.length ? "Nothing in this tab." : "No print PNGs for this client yet — upload them below and tag each one."}
              </p>
            )}
            {shown.map((i) => {
              const pair = autoPair ? pairFor(i, items) : null;
              const on = activeFileIds.has(i.fileId);
              return (
                <div key={i.fileId} className={`group overflow-hidden rounded-xl border-2 ${on ? "border-[#03AC13]" : "border-transparent"} bg-[hsl(var(--ax-ink)/0.04)]`}>
                  <button type="button" className="block aspect-square w-full bg-[#2b2b2b] bg-[linear-gradient(45deg,#333_25%,transparent_25%),linear-gradient(-45deg,#333_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#333_75%),linear-gradient(-45deg,transparent_75%,#333_75%)] bg-[length:14px_14px] bg-[position:0_0,0_7px,7px_-7px,-7px_0]"
                    title={`${i.designTitle} — ${i.fileName}${pair ? " (brings its back/front too)" : ""}`} onClick={() => i.url ? onPick(i, pair) : toast.error("That file couldn't be opened")}>
                    {i.url ? <img src={i.thumbUrl ?? i.url} referrerPolicy="no-referrer" alt={i.fileName} className="h-full w-full object-contain p-1.5" loading="lazy" /> : null}
                  </button>
                  <div className="flex items-center gap-1 px-1.5 py-1">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={i.designTitle}>{i.designTitle}</span>
                    {pair && <Link2 className="h-3 w-3 shrink-0 text-[#03AC13]" aria-label="Has a matching side" />}
                  </div>
                  <select
                    aria-label={`Tag ${i.fileName}`}
                    className={`mx-1.5 mb-1.5 w-[calc(100%-12px)] rounded-md border px-1 py-0.5 text-[10.5px] ${i.inferred ? "border-dashed border-[hsl(var(--ax-border))] text-[hsl(var(--ax-faint))]" : "border-[hsl(var(--ax-border))]"}`}
                    value={i.role}
                    onChange={(e) => setRole.mutate({ fileId: i.fileId, role: e.target.value as ArtRole })}
                    title={i.inferred ? "Guessed from the file name — pick to confirm" : "Tag"}
                  >
                    {ART_ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}{i.inferred && r.role === i.role ? " (guess)" : ""}</option>)}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[hsl(var(--ax-border))] pt-3">
            <label className="text-[11px] text-[hsl(var(--ax-secondary))]">Add as
              <select className={`${field} mt-1 block`} value={upRole} onChange={(e) => setUpRole(e.target.value as ArtRole)}>
                {ART_ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
              </select>
            </label>
            <label className="text-[11px] text-[hsl(var(--ax-secondary))]">To set
              <select className={`${field} mt-1 block max-w-[220px]`} value={upSet} onChange={(e) => setUpSet(e.target.value)}>
                <option value="new">New set…</option>
                {sets.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
              </select>
            </label>
            {upSet === "new" && (
              <label className="text-[11px] text-[hsl(var(--ax-secondary))]">Set name
                <input className={`${field} mt-1 block w-48`} placeholder="e.g. Ice Man" value={upTitle} onChange={(e) => setUpTitle(e.target.value)} />
              </label>
            )}
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-ink))] px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
              {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Upload PNGs to {client?.name ?? "client"}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/*" multiple className="hidden" onChange={(e) => { void doUpload(e.target.files); e.target.value = ""; }} />
          </div>
        </>
      )}
    </section>
  );
}
