import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, CheckSquare, Download, Ellipsis, Image as ImageIcon, Link2, Search, Square, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePortalAssets, usePortalCreateDrop, usePortalDestinations, usePortalDrops, usePortalScope, usePortalUpdateDrop } from "@/hooks/usePortalApi";
import { assetDownload, type DropDetail } from "@/lib/portal/api/brand";
import { newIdempotencyKey } from "@/lib/portal/api/orders";
import { PortalApiError, type MediaAsset } from "@/lib/portal/api/contract";

type Kind = MediaAsset["kind"] | null;
const FILTERS: { kind: Kind; label: string }[] = [
  { kind: null, label: "For You" }, { kind: "photo", label: "Photos" }, { kind: "video", label: "Videos" }, { kind: "graphic", label: "Graphics" }, { kind: "product", label: "Products" },
];
const KIND_LABEL: Record<MediaAsset["kind"], string> = { photo: "Photo", video: "Video", graphic: "Graphic", product: "Product photo" };
const STAGES = ["draft", "review", "scheduled", "live"] as const;
const STAGE_LABEL: Record<string, string> = { draft: "Draft", review: "Review", scheduled: "Scheduled", live: "Live" };
const READ_ONLY = "View-as is read-only. Drops can't be saved or sent while you preview this portal.";
const errText = (e: unknown) => (e instanceof PortalApiError ? e.error.message : e instanceof Error ? e.message : "Something went wrong. Try again.");

async function copy(text: string, done: string) {
  try { await navigator.clipboard.writeText(text); toast.success(done); } catch { toast.error("Couldn't copy. Try again."); }
}
function fileName(asset: MediaAsset, url: string) {
  const ext = url.split("?")[0].split(".").pop();
  const base = asset.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "asset";
  return ext && ext.length <= 5 ? `${base}.${ext}` : base;
}
async function saveFile(asset: MediaAsset) {
  const link = assetDownload(asset);
  if (!link) throw new Error("No file");
  const res = await fetch(link.url);
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName(asset, link.url);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const fmtWhen = (d: DropDetail) => {
  if (!d.scheduledAt) return "No date yet";
  const t = new Date(d.scheduledAt);
  return Number.isNaN(t.getTime()) ? "—" : t.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: d.timeZone || undefined, timeZoneName: "short" });
};
const toLocalInput = (d: DropDetail) => {
  if (!d.scheduledAt) return "";
  const t = new Date(d.scheduledAt);
  if (Number.isNaN(t.getTime())) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(t).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

function Stepper({ status }: { status: string }) {
  const at = Math.max(0, STAGES.indexOf(status as (typeof STAGES)[number]));
  return <ol className="mw-drops-stepper">{STAGES.map((s, i) => <li key={s} data-active={i === at || undefined} data-done={i < at || undefined}><span>{i < at ? <Check /> : i + 1}</span>{STAGE_LABEL[s]}</li>)}</ol>;
}

function DropPlanner({ onClose }: { onClose: () => void }) {
  const { viewingAs } = usePortalScope();
  const drops = usePortalDrops();
  const destinations = usePortalDestinations();
  const create = usePortalCreateDrop();
  const update = usePortalUpdateDrop();
  const [editing, setEditing] = useState<DropDetail | null>(null);
  const [title, setTitle] = useState("");
  const [collection, setCollection] = useState("");
  const [when, setWhen] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const busy = create.isPending || update.isPending;
  const tz = zone();

  const reset = () => { setEditing(null); setTitle(""); setCollection(""); setWhen(""); keyRef.current = newIdempotencyKey(); };
  const edit = (d: DropDetail) => { setEditing(d); setTitle(d.title); setCollection(d.destinationId ?? ""); setWhen(toLocalInput(d)); setNotice(null); };

  const save = async (submit: boolean) => {
    if (viewingAs || busy) return;
    if (!title.trim()) { setNotice("Give the drop a name."); return; }
    setNotice(null);
    const change = { title: title.trim(), destinationId: collection || null, scheduledLocal: when || null, timeZone: tz };
    try {
      let drop = editing;
      if (!drop) drop = await create.mutateAsync({ idempotencyKey: keyRef.current, ...change });
      else if (!submit) drop = await update.mutateAsync({ dropId: drop.id, expectedVersion: drop.version, change });
      if (submit) await update.mutateAsync({ dropId: drop.id, expectedVersion: drop.version, change: editing ? { ...change, submitForReview: true } : { submitForReview: true } });
      toast.success(submit ? "Sent to AX for review." : "Draft saved.");
      reset();
    } catch (e) {
      if (e instanceof PortalApiError && e.status === 409) { await drops.refetch(); setNotice("This drop changed — showing the latest."); reset(); }
      else setNotice(errText(e));
    }
  };

  const items = drops.data?.items ?? [];
  return <section className="mw-studio-panel mw-drops" aria-label="Drop planner">
    <div className="mw-drops-head"><h2 className="mw-section-title">Drops</h2><Button variant="ghost" size="icon" aria-label="Close drop planner" onClick={onClose}><X /></Button></div>
    <div className="mw-drops-grid">
      <div>
        <h3 className="mw-studio-label">Your drops</h3>
        {drops.isLoading ? <Skeleton className="mw-studio-skeleton" /> : drops.isError ? <div className="mw-state" role="alert"><p>Unable to load drops.</p><Button variant="outline" className="mw-pill" onClick={() => void drops.refetch()}>Try again</Button></div>
          : items.length === 0 ? <div className="mw-state"><p>No drops planned yet.</p></div>
          : <ul className="mw-drops-list">{items.map((d) => <li key={d.id} data-active={editing?.id === d.id || undefined}>
            <div className="min-w-0"><strong>{d.title}</strong><span>{destinations.data?.find((x) => x.id === d.destinationId)?.label ?? "No collection"} · {fmtWhen(d)}</span></div>
            <span className="mw-drops-badge" data-status={d.status}>{STAGE_LABEL[d.status] ?? d.status}</span>
            {d.editable && d.status === "draft" && <Button variant="outline" size="sm" className="mw-gear-chip" disabled={viewingAs} onClick={() => edit(d)}>Edit</Button>}
          </li>)}</ul>}
      </div>
      <div>
        <h3 className="mw-studio-label">{editing ? "Edit draft" : "Plan a drop"}</h3>
        <Stepper status={editing?.status ?? "draft"} />
        <label className="mw-studio-label" htmlFor="drop-name">Name</label>
        <input id="drop-name" className="mw-studio-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Drop name" />
        <label className="mw-studio-label" htmlFor="drop-collection">Collection</label>
        <select id="drop-collection" className="mw-studio-input" value={collection} onChange={(e) => setCollection(e.target.value)}>
          <option value="">No collection</option>
          {destinations.data?.map((d) => <option key={d.id} value={d.id}>{d.label}{d.jerseyNumber !== null ? ` #${d.jerseyNumber}` : ""}</option>)}
        </select>
        <label className="mw-studio-label" htmlFor="drop-when">Date and time</label>
        <input id="drop-when" type="datetime-local" className="mw-studio-input" value={when} onChange={(e) => setWhen(e.target.value)} />
        <p className="mw-studio-meta">Times are in your zone: {tz}. AX confirms the final schedule.</p>
        {notice && <p className="mw-studio-error" role="status">{notice}</p>}
        {viewingAs && <p className="mw-viewing">{READ_ONLY}</p>}
        <div className="mw-studio-actions">
          <Button variant="outline" className="mw-pill" disabled={viewingAs || busy} onClick={() => save(false)}>Save draft</Button>
          <Button variant="outline" className="mw-pill mw-drops-send" disabled={viewingAs || busy} onClick={() => save(true)}>Send to AX for review<ArrowRight /></Button>
        </div>
        {editing && <Button variant="ghost" className="mw-drops-cancel" onClick={reset}>Cancel edit</Button>}
      </div>
    </div>
  </section>;
}

function AssetCard({ asset, selecting, selected, onToggle }: { asset: MediaAsset; selecting: boolean; selected: boolean; onToggle: () => void }) {
  const link = assetDownload(asset);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  return <article className="mw-content-card" data-selected={selected || undefined}>
    <div className="mw-content-image">
      {asset.thumbnailUrl && !failed ? <img src={asset.thumbnailUrl} alt={asset.title} loading="lazy" onError={() => setFailed(true)} /> : <div className="mw-gear-placeholder">Image unavailable</div>}
      {selecting && <button type="button" role="checkbox" aria-checked={selected} aria-label={`Select ${asset.title}`} className="mw-content-check" onClick={onToggle}>{selected ? <CheckSquare /> : <Square />}</button>}
    </div>
    <div className="mw-content-body">
      <div className="mw-content-kind"><ImageIcon />{KIND_LABEL[asset.kind]}
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`More for ${asset.title}`}><Ellipsis /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end"><DropdownMenuItem disabled={!asset.caption} onSelect={() => asset.caption && void copy(asset.caption, "Caption copied.")}>Copy caption</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </div>
      <h3>{asset.title}</h3>
      <div className="mw-content-actions">
        <Button variant="outline" className="mw-pill" disabled={!link || busy} onClick={async () => { setBusy(true); try { await saveFile(asset); } catch { toast.error("That download didn't work. Try again."); } setBusy(false); }}><Download />{busy ? "Saving…" : "Download"}</Button>
        <Button variant="outline" className="mw-pill" disabled={!link} onClick={() => link && void copy(link.url, "Link copied.")}><Link2 />Copy link</Button>
      </div>
    </div>
  </article>;
}

export function ContentDrops() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const panelOpen = new URLSearchParams(search).get("panel") === "drops";
  const [kind, setKind] = useState<Kind>(null);
  const [query, setQuery] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<string | null>(null);
  const assets = usePortalAssets({ kind });

  const setPanel = (open: boolean) => {
    const p = new URLSearchParams(search);
    if (open) p.set("panel", "drops"); else p.delete("panel");
    navigate(`${pathname}${p.toString() ? `?${p}` : ""}`);
  };
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = assets.data?.items ?? [];
    return q ? list.filter((a) => a.title.toLowerCase().includes(q) || (a.caption ?? "").toLowerCase().includes(q)) : list;
  }, [assets.data, query]);
  const chosen = items.filter((a) => picked.has(a.id) && assetDownload(a));
  const toggle = (id: string) => setPicked((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const downloadAll = async () => {
    let failed = 0;
    for (let i = 0; i < chosen.length; i++) {
      setProgress(`Downloading ${i + 1} of ${chosen.length}`);
      try { await saveFile(chosen[i]); } catch { failed++; }
    }
    setProgress(null);
    if (failed) toast.error(`${failed} of ${chosen.length} didn't download. Try those again.`);
    else toast.success(`Downloaded ${chosen.length} file${chosen.length === 1 ? "" : "s"}.`);
  };

  return <main className="mw-gear mw-content">
    <header className="mw-gear-header">
      <div><h1 className="mw-heading">Ready to share.</h1><p>Photos, graphics and post kits — all in one place.</p></div>
      <Button variant="outline" className="mw-pill mw-content-drops" aria-expanded={panelOpen} onClick={() => setPanel(!panelOpen)}><CalendarDays />Drops<ArrowRight /></Button>
    </header>
    {panelOpen && <DropPlanner onClose={() => setPanel(false)} />}
    <div className="mw-content-toolbar">
      <div className="mw-gear-collections" role="group" aria-label="Asset type">
        {FILTERS.map((f) => <Button key={f.label} variant="outline" className="mw-gear-chip" aria-pressed={kind === f.kind} onClick={() => setKind(f.kind)}>{f.label}</Button>)}
      </div>
      <div className="mw-content-tools">
        <label className="mw-content-search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search assets…" aria-label="Search assets" /></label>
        <Button variant="outline" className="mw-gear-chip mw-content-select" aria-pressed={selecting} onClick={() => { setSelecting((s) => !s); setPicked(new Set()); }}>{selecting ? <CheckSquare /> : <Square />}{selecting ? "Done" : "Select"}</Button>
      </div>
    </div>
    {assets.isLoading ? <div className="mw-content-grid">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="mw-gear-skeleton" />)}</div>
      : assets.isError ? <div className="mw-studio-panel mw-state" role="alert"><p>Unable to load content.</p><Button variant="outline" className="mw-pill" onClick={() => void assets.refetch()}>Try again</Button></div>
      : items.length === 0 ? <div className="mw-studio-panel mw-state"><p>{query.trim() ? "Nothing matches that search." : "Approved photos and graphics from AX land here, ready to post."}</p></div>
      : <div className="mw-content-grid">{items.map((a) => <AssetCard key={a.id} asset={a} selecting={selecting} selected={picked.has(a.id)} onToggle={() => toggle(a.id)} />)}</div>}
    {selecting && <div className="mw-content-bar" role="region" aria-label="Selection">
      <p>{progress ?? (chosen.length ? `${chosen.length} selected` : "Select assets to download or share.")}</p>
      <div className="mw-content-actions">
        <Button variant="outline" className="mw-pill" disabled={!chosen.length || !!progress} onClick={() => void copy(chosen.map((a) => assetDownload(a)?.url).join("\n"), "Links copied.")}><Link2 />Copy links</Button>
        <Button variant="outline" className="mw-pill" disabled={!chosen.length || !!progress} onClick={() => void downloadAll()}><Download />Download selected</Button>
      </div>
    </div>}
  </main>;
}
