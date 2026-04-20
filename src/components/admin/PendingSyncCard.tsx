// Admin card showing failed/pending Shopify syncs with a "Retry now" button.
// Mobile-first. Test at 375px before merging.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface QueueRow {
  id: string;
  entity_type: string;
  entity_id: string;
  changes: Record<string, unknown>;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
}

export function PendingSyncCard() {
  const [items, setItems] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("shopify_sync_queue")
      .select("*")
      .in("status", ["pending", "failed"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      toast.error(`Could not load sync queue: ${error.message}`);
    } else {
      setItems((data ?? []) as QueueRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function retry(ids?: string[]) {
    const targetIds = ids ?? items.map((i) => i.id);
    if (!targetIds.length) return;
    setRetrying(new Set(targetIds));
    try {
      const { data, error } = await supabase.functions.invoke("shopify-sync-pending", {
        body: { queue_ids: ids },
      });
      if (error) throw error;
      const succeeded = data?.succeeded ?? 0;
      const failed = data?.failed ?? 0;
      if (failed === 0) toast.success(`Synced ${succeeded} item(s)`);
      else toast.warning(`Synced ${succeeded}, ${failed} still failing`);
      await load();
    } catch (e: any) {
      toast.error(`Retry failed: ${e?.message ?? e}`);
    } finally {
      setRetrying(new Set());
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading sync queue…
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Shopify sync</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          All caught up — no pending syncs.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          Pending Shopify sync ({items.length})
        </CardTitle>
        <Button
          size="sm"
          onClick={() => retry()}
          disabled={retrying.size > 0}
          className="tap-target"
        >
          {retrying.size > 0 ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-1" /> Retry all
            </>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((it) => {
          const isRetrying = retrying.has(it.id);
          const fields = Object.keys(it.changes ?? {});
          return (
            <div
              key={it.id}
              className="flex items-start justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {it.entity_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {fields.join(", ") || "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    · attempt {it.attempts}
                  </span>
                </div>
                {it.last_error && (
                  <p className="mt-1 text-xs text-destructive break-words">
                    {it.last_error}
                  </p>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {it.last_attempt_at
                    ? `last tried ${formatDistanceToNow(new Date(it.last_attempt_at))} ago`
                    : `created ${formatDistanceToNow(new Date(it.created_at))} ago`}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => retry([it.id])}
                disabled={isRetrying}
                className="tap-target shrink-0"
              >
                {isRetrying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}