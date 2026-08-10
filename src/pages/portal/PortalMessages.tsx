import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Send, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { usePortalData } from "@/components/portal/PortalDataContext";
import { PortalSection } from "@/components/portal/PortalSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  CATEGORY_OPTIONS,
  CATEGORY_META,
  categoryLabel,
  threadTimeAgo,
  messageTime,
  type PortalThread,
  type PortalMessage,
  type ThreadCategory,
} from "@/lib/portal-messaging";

type View = { mode: "list" } | { mode: "new" } | { mode: "thread"; thread: PortalThread };

export default function PortalMessages() {
  const { athlete } = usePortalData();
  const { user } = useAuth();
  const [threads, setThreads] = useState<PortalThread[] | null>(null);
  const [view, setView] = useState<View>({ mode: "list" });

  const loadThreads = useCallback(async () => {
    const { data } = await supabase
      .from("portal_threads")
      .select("*")
      .eq("athlete_id", athlete.id)
      .order("last_message_at", { ascending: false });
    setThreads((data ?? []) as PortalThread[]);
  }, [athlete.id]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  return (
    <main className="max-w-[900px] mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-bottom-nav md:pb-32">
      {view.mode === "list" && (
        <PortalSection
          id="sec-messages"
          title="Messages"
          description="Questions, order requests, and design feedback — talk directly with the AX team."
          actions={
            <Button
              onClick={() => setView({ mode: "new" })}
              className="bg-accent text-accent-foreground hover:bg-accent/90 uppercase tracking-wider font-bold tap-target w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-1" /> New Message
            </Button>
          }
        >
          <ThreadList
            threads={threads}
            onOpen={(t) => setView({ mode: "thread", thread: t })}
            onNew={() => setView({ mode: "new" })}
          />
        </PortalSection>
      )}

      {view.mode === "new" && (
        <NewThread
          athleteId={athlete.id}
          organizationId={athlete.organization_id}
          userId={user?.id ?? null}
          onCancel={() => setView({ mode: "list" })}
          onCreated={async (t) => {
            await loadThreads();
            setView({ mode: "thread", thread: t });
          }}
        />
      )}

      {view.mode === "thread" && (
        <ThreadView
          thread={view.thread}
          organizationId={athlete.organization_id}
          userId={user?.id ?? null}
          onBack={async () => {
            await loadThreads();
            setView({ mode: "list" });
          }}
        />
      )}
    </main>
  );
}

function ThreadList({
  threads,
  onOpen,
  onNew,
}: {
  threads: PortalThread[] | null;
  onOpen: (t: PortalThread) => void;
  onNew: () => void;
}) {
  if (threads === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (threads.length === 0) {
    return (
      <div className="ax-card p-10 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-full bg-accent/10 text-accent flex items-center justify-center">
          <MessageSquare className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">
          No messages yet. Start a conversation with the AX team.
        </p>
        <Button onClick={onNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="h-4 w-4 mr-1" /> New Message
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {threads.map((t) => (
        <button
          key={t.id}
          onClick={() => onOpen(t)}
          className="w-full text-left ax-card hover:border-accent/50 transition-colors flex items-center gap-3"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate">{t.subject}</span>
              {t.portal_unread && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {categoryLabel(t.category)} · {threadTimeAgo(t.last_message_at)}
            </div>
          </div>
          <span className="text-xs text-muted-foreground capitalize shrink-0">{t.status}</span>
        </button>
      ))}
    </div>
  );
}

function NewThread({
  athleteId,
  organizationId,
  userId,
  onCancel,
  onCreated,
}: {
  athleteId: string;
  organizationId: string;
  userId: string | null;
  onCancel: () => void;
  onCreated: (t: PortalThread) => void;
}) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<ThreadCategory>("question");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!subject.trim() || !body.trim()) {
      toast.error("Add a subject and a message.");
      return;
    }
    if (!userId) {
      toast.error("You need to be signed in.");
      return;
    }
    setSaving(true);
    const { data: thread, error } = await supabase
      .from("portal_threads")
      .insert({
        organization_id: organizationId,
        athlete_id: athleteId,
        subject: subject.trim(),
        category,
        created_by: userId,
        created_by_role: "portal",
      })
      .select("*")
      .single();
    if (error || !thread) {
      setSaving(false);
      toast.error("Could not start the conversation.");
      return;
    }
    const { error: msgErr } = await supabase.from("portal_messages").insert({
      thread_id: thread.id,
      organization_id: organizationId,
      sender_user_id: userId,
      sender_role: "portal",
      body: body.trim(),
    });
    setSaving(false);
    if (msgErr) {
      toast.error("Conversation created, but the message didn't send. Try again inside it.");
    }
    onCreated(thread as PortalThread);
  }

  return (
    <div className="space-y-4">
      <button onClick={onCancel} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="ax-card space-y-4">
        <h2 className="font-semibold text-lg">New Message</h2>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Type</label>
          <Select value={category} onValueChange={(v) => setCategory(v as ThreadCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_META[c].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Subject</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What's this about?"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Message</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={5}
          />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Send className="h-4 w-4 mr-1" /> {saving ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ThreadView({
  thread,
  organizationId,
  userId,
  onBack,
}: {
  thread: PortalThread;
  organizationId: string;
  userId: string | null;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<PortalMessage[] | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("portal_messages")
      .select("*")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as PortalMessage[]);
  }, [thread.id]);

  useEffect(() => {
    void load();
    void supabase.rpc("mark_thread_read", { _thread_id: thread.id });
  }, [load, thread.id]);

  async function send() {
    if (!reply.trim() || !userId) return;
    setSending(true);
    const { error } = await supabase.from("portal_messages").insert({
      thread_id: thread.id,
      organization_id: organizationId,
      sender_user_id: userId,
      sender_role: "portal",
      body: reply.trim(),
    });
    setSending(false);
    if (error) {
      toast.error("Message didn't send.");
      return;
    }
    setReply("");
    void load();
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> All messages
      </button>
      <div>
        <h2 className="font-semibold text-lg">{thread.subject}</h2>
        <div className="text-xs text-muted-foreground">
          {categoryLabel(thread.category)} · <span className="capitalize">{thread.status}</span>
        </div>
      </div>

      <div className="space-y-3">
        {messages === null ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === "portal";
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5",
                    mine ? "bg-accent text-accent-foreground" : "ax-card",
                  )}
                >
                  <div className="text-[11px] opacity-70 mb-0.5">
                    {mine ? "You" : "AX Team"} · {messageTime(m.created_at)}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {thread.status !== "closed" ? (
        <div className="flex items-end gap-2 sticky bottom-0">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            className="flex-1 resize-none"
          />
          <Button
            onClick={send}
            disabled={sending || !reply.trim()}
            className="bg-accent text-accent-foreground hover:bg-accent/90 h-10"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="ax-card p-3 text-center text-sm text-muted-foreground">
          This conversation is closed.
        </div>
      )}
    </div>
  );
}
