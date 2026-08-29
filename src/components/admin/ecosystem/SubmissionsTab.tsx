// Fan submissions, from the operator's side.
//
// Open ones first, because this queue's whole job is not leaving people
// waiting. Accepting drops the idea onto the same concept board as everything
// else — a fan idea and an in-house idea are the same kind of object the
// moment someone says yes to it.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Lightbulb, ImagePlus, Loader2, Check, ExternalLink, Send } from "lucide-react";
import { toast } from "sonner";
import {
  convertSubmissionToConcept,
  isOpen,
  listSubmissionsForAthlete,
  setReviewState,
  stageOf,
  submissionFileUrl,
  REVIEW_ACTIONS,
  STAGE_LABEL,
  type DesignSubmission,
  type ReviewState,
} from "@/lib/ecosystem/submissions";
import { CHECKERBOARD, ImageLightbox, type LightboxItem } from "@/components/admin/ecosystem/ImageLightbox";
import { backState, type BackTarget } from "@/hooks/useBackTarget";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function SubmissionsTab({
  athleteId, teamId, backTo, onConverted,
}: {
  athleteId: string;
  teamId?: string | null;
  backTo?: BackTarget;
  /** So the concept board refreshes when an idea becomes real. */
  onConverted?: () => void;
}) {
  const [rows, setRows] = useState<DesignSubmission[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxItem[] | null>(null);

  async function load() {
    try {
      setRows(await listSubmissionsForAthlete(athleteId));
    } catch {
      setRows([]);
    }
  }
  useEffect(() => { void load(); }, [athleteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { open, closed } = useMemo(() => {
    const o: DesignSubmission[] = [];
    const c: DesignSubmission[] = [];
    for (const r of rows ?? []) (isOpen(r) ? o : c).push(r);
    return { open: o, closed: c };
  }, [rows]);

  async function move(s: DesignSubmission, state: ReviewState, notes?: string) {
    setBusy(s.id);
    try {
      await setReviewState({ id: s.id, review_state: state, review_notes: notes ?? s.review_notes });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update");
    } finally { setBusy(null); }
  }

  async function accept(s: DesignSubmission) {
    setBusy(s.id);
    try {
      await convertSubmissionToConcept({ submission: s, team_id_at_release: teamId ?? null });
      toast.success(`"${s.title || "Fan idea"}" is on the concept board`);
      await load();
      onConverted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not accept");
    } finally { setBusy(null); }
  }

  if (rows === null) {
    return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h3 className="ax-section-header">Fan submissions</h3>
        <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-1 max-w-[70ch]">
          Ideas and artwork sent in by members. Accepting one puts it on the concept board as an ordinary product
          concept — the original submission stays intact so the credit trail survives.
        </p>
      </div>

      {open.length === 0 ? (
        <div className="ax-card p-6 text-center space-y-1">
          <div className="text-sm text-muted-foreground">Nothing waiting.</div>
          <div className="text-xs text-[hsl(var(--ax-faint))]">
            Members can send ideas from the athlete's public profile, under Ideas.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {open.map((s) => (
            <Card
              key={s.id}
              s={s}
              busy={busy === s.id}
              backTo={backTo}
              onMove={move}
              onAccept={accept}
              onOpenImages={setLightbox}
            />
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowClosed((v) => !v)}
            className="text-xs font-semibold text-[hsl(var(--ax-accent))]"
          >
            {showClosed ? "Hide" : "Show"} {closed.length} closed
          </button>
          {showClosed && closed.map((s) => (
            <Card
              key={s.id}
              s={s}
              busy={busy === s.id}
              backTo={backTo}
              onMove={move}
              onAccept={accept}
              onOpenImages={setLightbox}
            />
          ))}
        </div>
      )}

      {lightbox && (
        <ImageLightbox items={lightbox} index={0} onIndexChange={() => {}} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

function Card({ s, busy, backTo, onMove, onAccept, onOpenImages }: {
  s: DesignSubmission;
  busy: boolean;
  backTo?: BackTarget;
  onMove: (s: DesignSubmission, state: ReviewState, notes?: string) => void;
  onAccept: (s: DesignSubmission) => void;
  onOpenImages: (items: LightboxItem[]) => void;
}) {
  const [reply, setReply] = useState(s.review_notes ?? "");
  const stage = stageOf(s);
  const files = (s.files ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="ax-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="h-9 w-9 rounded-full bg-[hsl(var(--ax-line))] flex items-center justify-center shrink-0">
          {s.kind === "artwork"
            ? <ImagePlus className="h-4 w-4 text-[hsl(var(--ax-accent))]" />
            : <Lightbulb className="h-4 w-4 text-[hsl(var(--ax-accent))]" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-bold truncate">{s.title || (s.kind === "idea" ? "Design idea" : "Uploaded design")}</div>
          <div className="text-[11px] text-muted-foreground">
            {s.kind === "artwork" ? "Uploaded artwork" : "Survey idea"} · {new Date(s.created_at).toLocaleDateString()}
          </div>
        </div>
        <span className={cn(
          "shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full",
          stage === "in_production" ? "bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))]"
            : "bg-[hsl(var(--ax-line))] text-muted-foreground",
        )}>
          {STAGE_LABEL[stage]}
        </span>
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <button
              key={f.id}
              onClick={() => onOpenImages(
                files.map((x) => ({ id: x.id, url: submissionFileUrl(x), title: x.file_name ?? "" })).slice(i).concat(
                  files.map((x) => ({ id: x.id, url: submissionFileUrl(x), title: x.file_name ?? "" })).slice(0, i),
                ),
              )}
              className="h-24 w-24 rounded-lg overflow-hidden border border-[hsl(var(--ax-border))]"
              style={CHECKERBOARD}
            >
              <img src={submissionFileUrl(f)} alt="" loading="lazy" className="h-full w-full object-contain" />
            </button>
          ))}
        </div>
      )}

      {s.brief && <p className="text-[13px] whitespace-pre-wrap">{s.brief}</p>}
      {s.notes && (
        <div className="text-[12px] text-muted-foreground border-l-2 border-[hsl(var(--ax-border))] pl-2.5">
          <span className="font-semibold">They'd change: </span>{s.notes}
        </div>
      )}

      {s.converted_product_id ? (
        <Link
          to={`/admin/products/${s.converted_product_id}`}
          state={backTo ? backState(backTo) : undefined}
          className="text-[12px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1"
        >
          <ExternalLink className="h-3.5 w-3.5" /> View the concept it became
        </Link>
      ) : (
        <>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-1">
              Reply to them <span className="normal-case tracking-normal font-normal opacity-70">(they see this)</span>
            </div>
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={2}
              placeholder="Love the colours — we're going to try this on a hoodie."
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onAccept(s)}
              disabled={busy}
              className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Accept &amp; add to board
            </button>
            {REVIEW_ACTIONS.filter((a) => a.state !== "accepted" && a.state !== s.review_state).map((a) => (
              <button
                key={a.state}
                onClick={() => onMove(s, a.state, reply)}
                disabled={busy}
                className="h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold disabled:opacity-60"
              >
                {a.label}
              </button>
            ))}
            {reply !== (s.review_notes ?? "") && (
              <button
                onClick={() => onMove(s, s.review_state, reply)}
                disabled={busy}
                className="h-8 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[12px] font-semibold inline-flex items-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" /> Save reply
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
