import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, Calendar, Check, CloudUpload, Copy, Ellipsis, Layers, Lightbulb, Link2, Loader2, Pencil, Shirt, Sparkles, User, Volleyball, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePortalCreateProject, usePortalDecideConcept, usePortalMessages, usePortalPostMessage, usePortalProject, usePortalProjects, usePortalScope, usePortalUpload,
} from "@/hooks/usePortalApi";
import { useClientMockups } from "@/hooks/useClientMockups";
import { newIdempotencyKey } from "@/lib/portal/api/orders";
import { uploadProblem, type ProjectDetail, type ProjectKind } from "@/lib/portal/api/studio";
import { PortalApiError } from "@/lib/portal/api/contract";
import { usePortalData } from "../PortalDataContext";
import { usePortalDesigns } from "@/hooks/usePortalDesigns";
import { CLIENT_PREVIEW_BUCKET, type PortalDesign } from "@/lib/portal/client-designs";
import { useSignedUrl } from "@/lib/storage";
import { STARTS, briefFor, briefProblem, parseLinks, startCopy, type StudioStart } from "@/lib/portal/studio-start";

const KINDS: { kind: ProjectKind; label: string; icon: ReactNode }[] = [
  { kind: "new_merch", label: "New Merch", icon: <Shirt /> },
  { kind: "game_day", label: "Game Day", icon: <Calendar /> },
  { kind: "football_camp", label: "Football Camp", icon: <Volleyball /> },
  { kind: "personal_brand", label: "Personal Brand", icon: <User /> },
  { kind: "collection", label: "Collection", icon: <Layers /> },
  { kind: "other", label: "Something Else", icon: <Ellipsis /> },
];
const VIBES = ["Streetwear", "Vintage", "Minimal", "Athletic", "Luxury", "Y2K", "Clean", "Surprise me"];
const STEPS = ["Submitted", "In Progress", "Ready for you", "Completed"] as const;
const STEP_OF: Record<string, number> = { requested: 0, in_progress: 1, feedback: 2, approved: 3 };
const READ_ONLY = "View-as is read-only. Sending is disabled while you preview this portal.";

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};
const errText = (e: unknown) => (e instanceof PortalApiError ? e.error.message : e instanceof Error ? e.message : "Something went wrong. Try again.");

type Upload = { key: string; name: string; status: "uploading" | "done" | "error"; uploadId?: string; error?: string };

function StepBar({ status }: { status: string }) {
  const at = STEP_OF[status] ?? 0;
  return <div className="mw-studio-steps" aria-label={`Stage: ${STEPS[at]}`}>
    <div className="mw-studio-track"><span style={{ width: `${((at + 1) / STEPS.length) * 100}%` }} /></div>
    <ol>{STEPS.map((s, i) => <li key={s} data-active={i === at || undefined} data-done={i < at || undefined}>{s}</li>)}</ol>
  </div>;
}

function HowItWorks() {
  const steps = [
    { icon: <Lightbulb />, title: "Share your idea", body: "Tell us what you want to make, add inspiration, and share the details." },
    { icon: <Pencil />, title: "Review concepts", body: "Our design team will create concepts based on your vision." },
    { icon: <Check />, title: "Approve your design", body: "Give feedback and approve your favorite to move forward." },
  ];
  return <section className="mw-studio-panel"><h2 className="mw-section-title">How it works</h2>
    <ol className="mw-studio-how">{steps.map((s, i) => <li key={s.title}><span className="mw-studio-num">{i + 1}</span><span className="mw-studio-icon">{s.icon}</span><div><strong>{s.title}</strong><p>{s.body}</p></div></li>)}</ol>
  </section>;
}

const START_ICON: Record<StudioStart, ReactNode> = { fresh: <Sparkles />, remix: <Copy />, inspire: <Lightbulb /> };

function StartPicker({ value, onChange }: { value: StudioStart; onChange: (s: StudioStart) => void }) {
  return <div className="mw-studio-starts" role="radiogroup" aria-label="How do you want to start?">
    {STARTS.map((s) => <button key={s.key} type="button" role="radio" aria-checked={value === s.key} className="mw-studio-start" onClick={() => onChange(s.key)}>
      <span className="mw-studio-start-icon">{START_ICON[s.key]}</span>
      <strong>{s.title}</strong>
      <span>{s.blurb}</span>
    </button>)}
  </div>;
}

function DesignTile({ design, picked, onPick }: { design: PortalDesign; picked: boolean; onPick: () => void }) {
  const { url } = useSignedUrl(design.previewPath ? CLIENT_PREVIEW_BUCKET : null, design.previewPath);
  return <button type="button" className="mw-studio-design" aria-pressed={picked} onClick={onPick} title={design.title}>
    <span className="mw-studio-design-art">{url ? <img src={url} alt="" loading="lazy" /> : <Pencil />}</span>
    <span className="mw-studio-design-name">{design.designNumber ? `#${design.designNumber} · ` : ""}{design.title}</span>
    {picked && <Check className="mw-studio-design-check" />}
  </button>;
}

function DesignPicker({ picked, onPick }: { picked: PortalDesign | null; onPick: (d: PortalDesign | null) => void }) {
  const { athlete } = usePortalData();
  const { designs, error } = usePortalDesigns(athlete.id) as { designs: PortalDesign[] | null; error: string | null };
  if (error) return null;
  if (designs === null) return <Skeleton className="h-28 w-full" />;
  if (designs.length === 0) return <p className="mw-studio-meta">No designs shared with you yet — upload the file below instead.</p>;
  return <div className="mw-studio-designs" role="group" aria-label="Your designs">
    {designs.slice(0, 18).map((d) => <DesignTile key={d.id} design={d} picked={picked?.id === d.id} onPick={() => onPick(picked?.id === d.id ? null : d)} />)}
  </div>;
}

function Brief({ onCreated }: { onCreated: (p: ProjectDetail) => void }) {
  const { viewingAs } = usePortalScope();
  const create = usePortalCreateProject();
  const upload = usePortalUpload();
  const [start, setStart] = useState<StudioStart>("fresh");
  const [design, setDesign] = useState<PortalDesign | null>(null);
  const [linkText, setLinkText] = useState("");
  const [kind, setKind] = useState<ProjectKind>("new_merch");
  const [idea, setIdea] = useState("");
  const [vibes, setVibes] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<Upload[]>([]);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const inputRef = useRef<HTMLInputElement>(null);
  const uploading = files.some((f) => f.status === "uploading");

  const add = (list: FileList | File[] | null) => {
    if (!list || viewingAs) return;
    for (const file of Array.from(list)) {
      const key = newIdempotencyKey();
      const problem = uploadProblem(file);
      if (problem) { setFiles((c) => [...c, { key, name: file.name, status: "error", error: problem }]); continue; }
      setFiles((c) => [...c, { key, name: file.name, status: "uploading" }]);
      upload.mutateAsync({ file, purpose: "inspiration" })
        .then((r) => setFiles((c) => c.map((f) => (f.key === key ? { ...f, status: "done", uploadId: r.uploadId } : f))))
        .catch((e) => setFiles((c) => c.map((f) => (f.key === key ? { ...f, status: "error", error: errText(e) } : f))));
    }
  };

  const copy = startCopy(start);
  const links = parseLinks(linkText);
  const done = files.filter((f) => f.status === "done" && f.uploadId);

  const submit = async () => {
    if (viewingAs || create.isPending) return;
    const problem = briefProblem({ start, idea, hasDesign: !!design, uploads: done.length, links: links.length });
    if (problem) { setError(problem); return; }
    setError(null);
    const label = KINDS.find((k) => k.kind === kind)?.label ?? "Project";
    const { title, details: detailText } = briefFor({ start, kindLabel: label, idea, details, design: start === "remix" ? design : null, links: start === "fresh" ? [] : links });
    try {
      const project = await create.mutateAsync({
        idempotencyKey: keyRef.current,
        title,
        kind, idea: idea.trim(), vibes, details: detailText,
        inspirationIds: done.map((f) => f.uploadId as string),
      });
      keyRef.current = newIdempotencyKey();
      setIdea(""); setVibes([]); setDetails(""); setFiles([]); setDesign(null); setLinkText("");
      toast.success("Sent to the AX design team.");
      onCreated(project);
    } catch (e) {
      // Key kept: a retry of this same brief is recognised by the server.
      setError(errText(e));
    }
  };

  const drop = <>
    <h2 className="mw-studio-label">{copy.uploadLabel}</h2>
    <button type="button" className="mw-studio-drop" data-drag={drag || undefined} disabled={viewingAs}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}>
      <CloudUpload /><span>{start === "inspire" ? "Drop screenshots or images, or click to choose" : "Upload images or drag and drop"}</span>
    </button>
    <input ref={inputRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif,image/heic,application/pdf" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
    {files.length > 0 && <ul className="mw-studio-files">{files.map((f) => <li key={f.key} data-status={f.status}>
      {f.status === "uploading" ? <Loader2 className="animate-spin" /> : f.status === "done" ? <Check /> : <X />}
      <span className="truncate">{f.name}</span>
      {f.status === "uploading" && <em>Uploading…</em>}
      {f.error && <em>{f.error}</em>}
      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((c) => c.filter((x) => x.key !== f.key))}><X /></button>
    </li>)}</ul>}
    {start === "inspire" && <>
      <label className="mw-studio-label" htmlFor="mw-links">Or paste links</label>
      <div className="mw-studio-linkbox"><Link2 /><textarea id="mw-links" className="mw-studio-input" rows={2} value={linkText} onChange={(e) => setLinkText(e.target.value)} placeholder="Instagram, Pinterest, a website… one per line" /></div>
      {links.length > 0 && <p className="mw-studio-meta">{links.length} link{links.length === 1 ? "" : "s"} added</p>}
    </>}
  </>;

  return <section className="mw-studio-panel mw-studio-brief">
    <StartPicker value={start} onChange={(v) => { setStart(v); setError(null); }} />
    {start === "remix" && <><h2 className="mw-studio-label">Pick the design</h2><DesignPicker picked={design} onPick={setDesign} /></>}
    {copy.uploadFirst && drop}
    <h2 className="mw-studio-label">Project type</h2>
    <div className="mw-studio-kinds" role="radiogroup" aria-label="Project type">
      {KINDS.map((k) => <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className="mw-studio-kind" onClick={() => setKind(k.kind)}>{k.icon}<span>{k.label}</span></button>)}
    </div>
    <label className="mw-studio-label" htmlFor="mw-idea">{copy.ideaLabel}</label>
    <textarea id="mw-idea" required className="mw-studio-input" rows={3} value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={copy.ideaPlaceholder} />
    {!copy.uploadFirst && drop}
    <h2 className="mw-studio-label">What's the vibe?</h2>
    <div className="mw-studio-vibes">{VIBES.map((v) => <button key={v} type="button" className="mw-gear-chip" aria-pressed={vibes.includes(v)} onClick={() => setVibes((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]))}>{v}</button>)}</div>
    <label className="mw-studio-label" htmlFor="mw-details">Anything we should include?</label>
    <input id="mw-details" className="mw-studio-input" value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Number, name, city, quotes, colors, event info…" />
    {error && <p className="mw-studio-error" role="alert">{error}</p>}
    {viewingAs && <p className="mw-viewing">{READ_ONLY}</p>}
    <Button variant="outline" className="mw-pill mw-studio-send" disabled={viewingAs || create.isPending || uploading} onClick={submit}>
      {create.isPending ? "Sending…" : uploading ? "Waiting for uploads…" : "Send to AX design team"}<ArrowRight />
    </Button>
  </section>;
}

function ProjectCard({ project, highlight }: { project: ProjectDetail; highlight: boolean }) {
  const { pathname, search } = useLocation();
  const params = new URLSearchParams(search); params.set("project", project.id);
  const img = project.concepts.find((c) => c.imageUrl)?.imageUrl;
  return <article className="mw-studio-card" data-new={highlight || undefined}>
    <div className="mw-studio-thumb">{img ? <img src={img} alt="" /> : <span>No concepts yet</span>}</div>
    <div className="mw-studio-card-body">
      <h3>{project.title}</h3><p>{fmtDate(project.updatedAt)}</p>
      <StepBar status={project.status} />
      <Button variant="outline" asChild className="mw-pill"><Link to={`${pathname}?${params.toString()}`}>Open project<ArrowRight /></Link></Button>
    </div>
  </article>;
}

function ProjectList({ created }: { created: ProjectDetail | null }) {
  const projects = usePortalProjects();
  const items = useMemo(() => {
    const list = [...(projects.data?.items ?? [])];
    if (created && !list.some((p) => p.id === created.id)) list.push(created);
    return list.filter((p) => p.status !== "archived").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [projects.data, created]);
  return <section className="mw-studio-panel"><h2 className="mw-section-title">Your projects</h2>
    {projects.isLoading ? <Skeleton className="mw-studio-skeleton" /> : projects.isError ? <div className="mw-state" role="alert"><p>Unable to load projects.</p><Button variant="outline" className="mw-pill" onClick={() => void projects.refetch()}>Try again</Button></div>
      : items.length ? <div className="mw-studio-cards">{items.map((p) => <ProjectCard key={p.id} project={p} highlight={p.id === created?.id} />)}</div>
      : <div className="mw-state"><p>Nothing in the works yet. Send an idea and it shows up here.</p></div>}
  </section>;
}

function ProjectView({ projectId }: { projectId: string }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { athlete } = usePortalData();
  const { viewingAs } = usePortalScope();
  const project = usePortalProject(projectId);
  const decide = usePortalDecideConcept();
  const messages = usePortalMessages(projectId);
  const post = usePortalPostMessage();
  const mockups = useClientMockups(athlete.id);
  const [tab, setTab] = useState<"concepts" | "brief" | "mockups">("concepts");
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const msgKey = useRef(newIdempotencyKey());

  const back = new URLSearchParams(search); back.delete("project");
  const backHref = `${pathname}${back.toString() ? `?${back}` : ""}`;
  const p = project.data;
  const concept = p?.concepts.find((c) => c.id === conceptId) ?? p?.concepts[0];

  const act = async (decision: "approve" | "request_changes") => {
    if (!p || !concept || viewingAs) return;
    if (decision === "request_changes" && !feedback.trim()) { setNotice("Tell us what to change first."); return; }
    setNotice(null);
    try {
      await decide.mutateAsync({ projectId: p.id, conceptId: concept.id, conceptVersion: concept.version, expectedProjectVersion: p.version, decision, feedback: decision === "request_changes" ? feedback.trim() : null });
      setFeedback(""); setAsking(false);
      toast.success(decision === "approve" ? "Concept approved." : "Change request sent.");
    } catch (e) {
      if (e instanceof PortalApiError && e.status === 409) { await project.refetch(); setNotice("This changed — showing the latest."); }
      else setNotice(errText(e));
    }
  };

  const send = async () => {
    if (!draft.trim() || viewingAs) return;
    try {
      await post.mutateAsync({ projectId, body: draft.trim(), idempotencyKey: msgKey.current });
      msgKey.current = newIdempotencyKey(); setDraft("");
    } catch (e) { toast.error(errText(e)); }
  };

  if (project.isLoading) return <Skeleton className="mw-studio-skeleton" />;
  if (!p) return <div className="mw-studio-panel mw-state"><p>That project isn't available.</p><Button variant="outline" className="mw-pill" onClick={() => navigate(backHref)}><ArrowLeft />Back to Studio</Button></div>;
  const decided = concept?.decision;

  return <div className="mw-studio-project">
    <section className="mw-studio-panel">
      <Link to={backHref} className="mw-studio-back"><ArrowLeft />All projects</Link>
      <h2 className="mw-studio-title">{p.title}</h2>
      <StepBar status={p.status} />
      <div className="mw-gear-tabs mw-studio-tabs" role="tablist">
        {(["concepts", "brief", "mockups"] as const).map((t) => <Button key={t} role="tab" variant="ghost" aria-selected={tab === t} onClick={() => setTab(t)}>{t === "concepts" ? "Concepts" : t === "brief" ? "Brief" : "Made for you"}</Button>)}
      </div>
      {notice && <p className="mw-studio-error" role="status">{notice}</p>}
      {tab === "concepts" && (p.concepts.length === 0 ? <div className="mw-state"><p>The AX design team is working on your first concepts.</p></div> : concept && <>
        <div className="mw-studio-stage">{concept.imageUrl ? <img src={concept.imageUrl} alt={concept.title ?? "Concept"} /> : <span>Image unavailable</span>}</div>
        <p className="mw-studio-meta">{concept.title ?? "Concept"} · v{concept.version}{decided ? ` · ${decided === "approve" ? "Approved" : "Changes requested"}` : ""}</p>
        {p.concepts.length > 1 && <div className="mw-studio-thumbs">{p.concepts.map((c) => <button key={c.id} type="button" aria-pressed={c.id === concept.id} onClick={() => { setConceptId(c.id); setAsking(false); }}>{c.imageUrl ? <img src={c.imageUrl} alt={c.title ?? "Concept"} /> : <span>—</span>}</button>)}</div>}
        {asking && <textarea className="mw-studio-input" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What should we change?" aria-label="Feedback" />}
        <div className="mw-studio-actions">
          <Button variant="outline" className="mw-pill" disabled={viewingAs || decide.isPending} onClick={() => act("approve")}><Check />Approve concept</Button>
          <Button variant="outline" className="mw-pill" disabled={viewingAs || decide.isPending} onClick={() => (asking ? act("request_changes") : setAsking(true))}><Pencil />{asking ? "Send change request" : "Request changes"}</Button>
        </div>
        {viewingAs && <p className="mw-viewing">{READ_ONLY}</p>}
      </>)}
      {tab === "brief" && <dl className="mw-studio-brief-view">
        <dt>Idea</dt><dd>{p.brief?.idea || "—"}</dd>
        <dt>Vibe</dt><dd>{p.brief?.vibes?.length ? p.brief.vibes.join(", ") : "—"}</dd>
        <dt>Include</dt><dd>{p.brief?.details || "—"}</dd>
      </dl>}
      {tab === "mockups" && (mockups.loading ? <Skeleton className="mw-studio-skeleton" /> : !mockups.available ? <div className="mw-state"><p>Made-for-you mockups aren't switched on yet.</p></div>
        : mockups.mockups.length === 0 ? <div className="mw-state"><p>No mockups yet.</p></div>
        : <div className="mw-gear-grid">{mockups.mockups.map((m) => <figure key={m.id} className="mw-gear-card"><div className="mw-gear-image">{m.imageUrl ? <img src={m.imageUrl} alt={m.title} /> : <div className="mw-gear-placeholder">Image unavailable</div>}</div><figcaption className="mw-studio-meta">{m.title}</figcaption></figure>)}</div>)}
    </section>
    <section className="mw-studio-panel mw-studio-chat">
      <h2 className="mw-section-title">Project chat</h2>
      <ul>{messages.isLoading ? <li>Loading…</li> : (messages.data?.items ?? []).length === 0 ? <li className="mw-state">No messages yet.</li>
        : [...(messages.data?.items ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((m) => <li key={m.id} data-mine={m.mine || undefined}>
          <span className="mw-studio-meta">{m.authorLabel} · {fmtDate(m.createdAt)}</span><p>{m.body}</p>
          {m.attachments.map((a) => a.downloadUrl ? <a key={a.id} href={a.downloadUrl} target="_blank" rel="noreferrer">{a.name}</a> : <span key={a.id}>{a.name}</span>)}
        </li>)}</ul>
      <div className="mw-studio-compose">
        <input className="mw-studio-input" value={draft} disabled={viewingAs} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }} placeholder="Message the AX design team…" aria-label="Message" />
        <Button variant="outline" className="mw-pill" disabled={viewingAs || post.isPending || !draft.trim()} onClick={send}>Send</Button>
      </div>
      {viewingAs && <p className="mw-viewing">{READ_ONLY}</p>}
    </section>
  </div>;
}

export function CreativeStudio() {
  const { search } = useLocation();
  const projectId = new URLSearchParams(search).get("project");
  const [created, setCreated] = useState<ProjectDetail | null>(null);
  return <main className="mw-gear mw-studio">
    <header className="mw-gear-header"><div><h1 className="mw-heading">What should we make next?</h1><p>Start fresh, remix one of yours, or show us what inspired you.</p></div></header>
    {projectId ? <ProjectView projectId={projectId} /> : <div className="mw-studio-layout">
      <Brief onCreated={setCreated} />
      <aside className="mw-studio-side"><ProjectList created={created} /><HowItWorks /></aside>
    </div>}
  </main>;
}
