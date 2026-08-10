import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Search, Send, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import {
  CATEGORY_OPTIONS,
  CATEGORY_META,
  categoryLabel,
  STATUS_OPTIONS,
  STATUS_META,
  threadTimeAgo,
  messageTime,
  type PortalThread,
  type PortalMessage,
  type ThreadStatus,
} from "@/lib/portal-messaging";

interface ThreadWithClient extends PortalThread {
  clientName: string;
}

export default function AdminInbox() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ThreadWithClient[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const loadThreads = useCallback(async () => {
    const { data } = await supabase
      .from("portal_threads")
      .select("*")
      .order("last_message_at", { ascending: false });
    const rows = (data ?? []) as PortalThread[];
    const athleteIds = [...new Set(rows.map((r) => r.athlete_id))];
    const nameMap = new Map<string, string>();
    if (athleteIds.length) {
      const { data: aths } = await supabase
        .from("athletes")
        .select("id, full_name, first_name, last_name")
        .in("id", athleteIds);
      (aths ?? []).forEach((a) =>
        nameMap.set(a.id, a.full_name ?? `${a.first_name} ${a.last_name}`),
      );
    }
    setThreads(rows.map((r) => ({ ...r, clientName: nameMap.get(r.athlete_id) ?? "Unknown client" })));
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const filtered = useMemo(() => {
    if (!threads) return [];
    const q = search.trim().toLowerCase();
    return threads.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (!q) return true;
      return t.subject.toLowerCase().includes(q) || t.clientName.toLowerCase().includes(q);
    });
  }, [threads, statusFilter, categoryFilter, search]);

  const selected = useMemo(
    () => threads?.find((t) => t.id === selectedId) ?? null,
    [threads, selectedId],
  );

  const unreadCount = threads?.filter((t) => t.admin_unread).length ?? 0;

  async function openThread(t: ThreadWithClient) {
    setSelectedId(t.id);
    if (t.admin_unread) {
      await supabase.rpc("mark_thread_read", { _thread_id: t.id });
      void loadThreads();
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header>
        <div className="ax-section-header mb-2">Workspace</div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          Inbox
          {unreadCount > 0 && (
            <span className="text-sm font-semibold rounded-full bg-accent text-accent-foreground px-2.5 py-0.5">
              {unreadCount} new
            </span>
          )}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Messages and requests from client and player portals.
        </p>
      </header>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subject or client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CATEGORY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>
                {CATEGORY_META[c].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid md:grid-cols-[320px_1fr] gap-4">
        {/* Thread list */}
        <div className={cn("space-y-2", selectedId && "hidden md:block")}>
          {threads === null ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
          ) : filtered.length === 0 ? (
            <div className="ax-card p-10 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-[12px] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] flex items-center justify-center">
                <Inbox className="h-5 w-5" />
              </div>
              <p className="text-sm text-muted-foreground">
                {threads.length === 0
                  ? "No messages yet. Client and player portal messages will land here."
                  : "No conversations match your filters."}
              </p>
            </div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t)}
                className={cn(
                  "w-full text-left ax-card hover:border-accent/50 transition-colors flex items-start gap-3",
                  selectedId === t.id && "border-accent",
                )}
              >
                <div
                  className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                  style={{ background: avatarColorFor(t.clientName) }}
                >
                  {initialsFor(t.clientName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("truncate", t.admin_unread ? "font-bold" : "font-medium")}>
                      {t.subject}
                    </span>
                    {t.admin_unread && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.clientName} · {categoryLabel(t.category)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {threadTimeAgo(t.last_message_at)}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    STATUS_META[t.status as ThreadStatus]?.className,
                  )}
                >
                  {STATUS_META[t.status as ThreadStatus]?.label ?? t.status}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Thread detail */}
        <div className={cn(!selectedId && "hidden md:block")}>
          {selected ? (
            <ThreadDetail
              key={selected.id}
              thread={selected}
              userId={user?.id ?? null}
              onBack={() => setSelectedId(null)}
              onChanged={loadThreads}
            />
          ) : (
            <div className="ax-card h-full min-h-[300px] flex items-center justify-center text-sm text-muted-foreground">
              Select a conversation to read and reply.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadDetail({
  thread,
  userId,
  onBack,
  onChanged,
}: {
  thread: ThreadWithClient;
  userId: string | null;
  onBack: () => void;
  onChanged: () => void;
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
  }, [load]);

  async function send() {
    if (!reply.trim() || !userId) return;
    setSending(true);
    const { error } = await supabase.from("portal_messages").insert({
      thread_id: thread.id,
      organization_id: thread.organization_id,
      sender_user_id: userId,
      sender_role: "admin",
      body: reply.trim(),
    });
    setSending(false);
    if (error) {
      toast.error("Reply didn't send.");
      return;
    }
    setReply("");
    await load();
    onChanged();
  }

  async function changeStatus(status: ThreadStatus) {
    const { error } = await supabase.from("portal_threads").update({ status }).eq("id", thread.id);
    if (error) {
      toast.error("Could not update status.");
      return;
    }
    toast.success(`Marked ${STATUS_META[status].label.toLowerCase()}.`);
    onChanged();
  }

  return (
    <div className="ax-card p-0 flex flex-col min-h-[400px]">
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <button onClick={onBack} className="md:hidden text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{thread.subject}</div>
          <div className="text-xs text-muted-foreground truncate">
            {thread.clientName} · {categoryLabel(thread.category)}
          </div>
        </div>
        <Select value={thread.status} onValueChange={(v) => changeStatus(v as ThreadStatus)}>
          <SelectTrigger className="w-[130px] h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_META[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1 p-4 space-y-3 overflow-y-auto">
        {messages === null ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === "admin";
            return (
              <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5",
                    mine ? "bg-accent text-accent-foreground" : "bg-[hsl(var(--muted))]",
                  )}
                >
                  <div className="text-[11px] opacity-70 mb-0.5">
                    {mine ? "You (AX)" : thread.clientName} · {messageTime(m.created_at)}
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{m.body}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 border-t border-border flex items-end gap-2">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Reply to the client…"
          rows={2}
          className="flex-1 resize-none"
        />
        <Button onClick={send} disabled={sending || !reply.trim()} className="h-10">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
