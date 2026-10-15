import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Paperclip, Send, X, Loader2, RefreshCw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePortalMessages, usePortalPostMessage, usePortalScope, usePortalUpload } from "@/hooks/usePortalApi";
import { uploadProblem } from "@/lib/portal/api/studio";

function errorText(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }

function Conversation() {
  const messages = usePortalMessages(null);
  const post = usePortalPostMessage();
  const upload = usePortalUpload();
  const { viewingAs } = usePortalScope();
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<{ uploadId: string; name: string }[]>([]);
  const [problem, setProblem] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const key = useRef<string | null>(null);
  const busy = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [messages.data?.items.length]);
  useEffect(() => {
    const timer = window.setInterval(() => { void messages.refetch(); }, 4 * 60_000);
    return () => window.clearInterval(timer);
  }, [messages.refetch]);

  async function attach(file: File) {
    if (viewingAs || busy.current || upload.isPending) return;
    const validation = uploadProblem(file);
    if (validation) { setProblem(validation); return; }
    setProblem("");
    try {
      const result = await upload.mutateAsync({ file, purpose: "attachment", projectId: null });
      setAttachments((previous) => [...previous, result]);
      key.current = null;
    } catch (error) { setProblem(errorText(error)); }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (viewingAs || busy.current || upload.isPending || (!body.trim() && attachments.length === 0)) return;
    busy.current = true;
    setProblem("");
    key.current ??= crypto.randomUUID();
    try {
      await post.mutateAsync({ projectId: null, body: body.trim(), attachmentIds: attachments.map((a) => a.uploadId), idempotencyKey: key.current });
      setBody(""); setAttachments([]); key.current = null;
      await messages.refetch();
    } catch (error) { setProblem(errorText(error)); }
    finally { busy.current = false; }
  }

  return <>
    <div className="mw-chat-log" role="log" aria-label="AX Team conversation" aria-live="polite">
      {messages.isLoading && <p className="text-sm text-muted-foreground" role="status">Loading conversation…</p>}
      {messages.isError && <div role="alert"><p className="mw-error">{errorText(messages.error)}</p><Button variant="ghost" onClick={() => void messages.refetch()}><RefreshCw />Try again</Button></div>}
      {messages.isSuccess && messages.data.items.length === 0 && <div className="mw-state"><MessageCircle className="mx-auto mb-3 h-9 w-9" /><p>No messages yet</p></div>}
      {messages.data?.items.map((message) => <article key={message.id} className="mw-message" data-mine={message.mine}>
        <div className="mw-message-head"><strong>{message.authorLabel}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div>
        <p>{message.body}</p>
        {message.attachments.map((attachment) => attachment.downloadUrl ? <a key={attachment.id} href={attachment.downloadUrl} target="_blank" rel="noopener noreferrer"><Paperclip className="h-3 w-3 shrink-0" />{attachment.name}</a> : <span key={attachment.id} className="block text-xs text-muted-foreground mt-2">{attachment.name} — Preview unavailable</span>)}
      </article>)}
      {messages.data?.nextCursor && <p className="text-xs text-muted-foreground">Showing the most recent messages.</p>}
      <div ref={bottom} />
    </div>
    <form className="mw-composer" onSubmit={send}>
      {viewingAs && <p className="mw-viewing">View-as is read-only. Sending messages and uploading files are disabled.</p>}
      <label className="sr-only" htmlFor="ax-team-message">Message AX Team</label>
      <Textarea id="ax-team-message" placeholder="Message AX Team…" value={body} disabled={viewingAs || post.isPending} onChange={(event) => { setBody(event.target.value); key.current = null; }} />
      <div className="mw-upload-list">{attachments.map((a) => <span key={a.uploadId}><Paperclip className="h-3 w-3" />{a.name}<Button variant="ghost" size="icon" className="mw-icon" disabled={post.isPending} aria-label={`Remove ${a.name}`} onClick={() => { setAttachments((previous) => previous.filter((item) => item.uploadId !== a.uploadId)); key.current = null; }}><X /></Button></span>)}</div>
      <input ref={fileInput} className="hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void attach(file); event.target.value = ""; }} />
      <div className="mw-composer-actions"><Button type="button" variant="ghost" size="icon" className="mw-icon" title="Attach a file" aria-label="Attach a file" disabled={viewingAs || upload.isPending || post.isPending} onClick={() => fileInput.current?.click()}>{upload.isPending ? <Loader2 className="animate-spin" /> : <Paperclip />}</Button><Button type="submit" className="bg-accent text-accent-foreground hover:bg-accent/90 min-h-11" disabled={viewingAs || post.isPending || upload.isPending || (!body.trim() && attachments.length === 0)}>{post.isPending ? <Loader2 className="animate-spin" /> : <Send />}Send</Button></div>
      {problem && <p role="alert" className="mw-error">{problem}</p>}
    </form>
  </>;
}

export function AXTeamDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="mw-drawer sm:max-w-[440px]"><SheetHeader className="text-left"><SheetTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-accent" />AX Team</SheetTitle><SheetDescription>Your conversation with AX.</SheetDescription></SheetHeader>{open && <Conversation />}</SheetContent></Sheet>;
}