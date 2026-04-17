import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ImportFromUrlDialog } from "@/components/admin/products/ImportFromUrlDialog";
import {
  IngestionDrawer,
  type IngestionJob,
  type IngestionStatus,
  averageConfidence,
  hostOf,
  statusBadgeClass,
} from "@/components/admin/ingestion/IngestionDrawer";

const STATUS_TABS: Array<{ key: "all" | IngestionStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "review", label: "Review" },
  { key: "applied", label: "Applied" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" },
];

function ConfidencePill({ score }: { score: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground/50">—</span>;
  const pct = Math.round(score * 100);
  const color =
    score >= 0.9
      ? "bg-accent/15 text-accent border-accent/30"
      : score >= 0.7
        ? "bg-yellow-500/15 text-yellow-500 border-yellow-500/30"
        : "bg-destructive/15 text-destructive border-destructive/30";
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] border tabular-nums",
        color,
      )}
    >
      {pct}%
    </span>
  );
}

export default function IngestionQueue() {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const [jobs, setJobs] = useState<IngestionJob[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<"all" | IngestionStatus>("pending");
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<IngestionJob | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"cancel" | "retry" | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ingestion_jobs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) console.error("ingestion jobs error:", error);
      setJobs((data ?? []) as unknown as IngestionJob[]);
    } catch (err) {
      console.error("IngestionQueue load failed:", err);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Auto-open drawer from URL
  useEffect(() => {
    if (!params.id || !jobs) return;
    const job = jobs.find((j) => j.id === params.id);
    if (job) setReviewing(job);
  }, [params.id, jobs]);

  // Default to "pending" tab if it has any rows on first load, else "all"
  useEffect(() => {
    if (!jobs) return;
    if (statusTab === "pending" && !jobs.some((j) => j.status === "pending")) {
      setStatusTab("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs?.length]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: jobs?.length ?? 0 };
    for (const s of [
      "pending",
      "processing",
      "review",
      "applied",
      "failed",
      "cancelled",
    ] as IngestionStatus[]) {
      c[s] = jobs?.filter((j) => j.status === s).length ?? 0;
    }
    return c;
  }, [jobs]);

  const filtered = useMemo(() => {
    if (!jobs) return [];
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusTab !== "all" && j.status !== statusTab) return false;
      if (!q) return true;
      return (
        j.source_url.toLowerCase().includes(q) ||
        (j.error_message ?? "").toLowerCase().includes(q)
      );
    });
  }, [jobs, search, statusTab]);

  const isEmpty = !loading && jobs && jobs.length === 0;

  function openReview(job: IngestionJob) {
    navigate(`/admin/ingestion/${job.id}`);
  }
  function closeReview() {
    setReviewing(null);
    navigate("/admin/ingestion");
  }

  async function handleRetry(job: IngestionJob) {
    setRetrying(job.id);
    try {
      const { error } = await supabase
        .from("ingestion_jobs")
        .update({
          status: "pending",
          error_message: null,
          retry_count: job.retry_count + 1,
        })
        .eq("id", job.id);
      if (error) throw error;
      toast({ title: "Re-queued for ingestion" });
      load();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Retry failed",
        variant: "destructive",
      });
    } finally {
      setRetrying(null);
    }
  }

  // ── Bulk selection helpers ──
  const visibleIds = useMemo(() => filtered.map((j) => j.id), [filtered]);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleIds.some((id) => selected.has(id));

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAllVisible(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of visibleIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  const selectedJobs = useMemo(
    () => (jobs ?? []).filter((j) => selected.has(j.id)),
    [jobs, selected],
  );
  const selectedFailedCount = selectedJobs.filter((j) => j.status === "failed").length;
  const selectedCancellableCount = selectedJobs.filter(
    (j) => j.status !== "applied" && j.status !== "cancelled",
  ).length;

  async function handleBulkCancel() {
    const ids = selectedJobs
      .filter((j) => j.status !== "applied" && j.status !== "cancelled")
      .map((j) => j.id);
    if (!ids.length) return;
    setBulkBusy("cancel");
    try {
      const { error } = await supabase
        .from("ingestion_jobs")
        .update({ status: "cancelled" })
        .in("id", ids);
      if (error) throw error;
      toast({ title: `Cancelled ${ids.length} job${ids.length === 1 ? "" : "s"}` });
      clearSelection();
      load();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Bulk cancel failed",
        variant: "destructive",
      });
    } finally {
      setBulkBusy(null);
    }
  }

  async function handleBulkRetry() {
    const failed = selectedJobs.filter((j) => j.status === "failed");
    if (!failed.length) return;
    setBulkBusy("retry");
    try {
      // Update each so we can bump retry_count individually.
      await Promise.all(
        failed.map((j) =>
          supabase
            .from("ingestion_jobs")
            .update({
              status: "pending",
              error_message: null,
              retry_count: j.retry_count + 1,
            })
            .eq("id", j.id),
        ),
      );
      toast({ title: `Re-queued ${failed.length} job${failed.length === 1 ? "" : "s"}` });
      clearSelection();
      load();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Bulk retry failed",
        variant: "destructive",
      });
    } finally {
      setBulkBusy(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="ax-section-header mb-2">Catalog</div>
          <h1 className="text-3xl font-bold">Ingestion Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Product URLs queued for extraction and review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load} className="gap-2">
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
          <Button onClick={() => setImportOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Ingestion
          </Button>
        </div>
      </header>

      {!isEmpty && (
        <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as typeof statusTab)}>
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            {STATUS_TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-1.5"
              >
                {t.label}
                <span className="text-[10px] opacity-70 tabular-nums">
                  ({counts[t.key] ?? 0})
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {!isEmpty && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search URL or error…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {selected.size > 0 && (
        <div className="ax-card flex items-center justify-between gap-3 p-3 border-accent/40 bg-accent/5">
          <div className="text-sm">
            <span className="font-medium">{selected.size}</span> selected
            <button
              type="button"
              onClick={clearSelection}
              className="ml-3 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkRetry}
              disabled={bulkBusy !== null || selectedFailedCount === 0}
              className="gap-2"
              title={
                selectedFailedCount === 0
                  ? "No failed jobs in selection"
                  : `Retry ${selectedFailedCount} failed`
              }
            >
              {bulkBusy === "retry" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5" />
              )}
              Retry failed ({selectedFailedCount})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkCancel}
              disabled={bulkBusy !== null || selectedCancellableCount === 0}
              className="gap-2 text-destructive hover:text-destructive"
            >
              {bulkBusy === "cancel" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Ban className="h-3.5 w-3.5" />
              )}
              Cancel ({selectedCancellableCount})
            </Button>
          </div>
        </div>
      )}

      {loading && (
        <div className="ax-card p-0 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 border-b border-border last:border-b-0"
            >
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-3">
          <p className="text-muted-foreground">
            No ingestion jobs yet. Import a product URL to queue one.
          </p>
          <Button onClick={() => setImportOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Ingestion
          </Button>
        </div>
      )}

      {!loading && jobs && jobs.length > 0 && (
        <div className="ax-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(v) => toggleAllVisible(v === true)}
                      aria-label="Select all visible"
                    />
                  </th>
                  <th className="text-left font-medium text-muted-foreground p-3">Source</th>
                  <th className="text-left font-medium text-muted-foreground p-3">Status</th>
                  <th className="text-left font-medium text-muted-foreground p-3">Confidence</th>
                  <th className="text-left font-medium text-muted-foreground p-3">Notes</th>
                  <th className="text-right font-medium text-muted-foreground p-3">Created</th>
                  <th className="text-right font-medium text-muted-foreground p-3 w-32">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => {
                  const host = hostOf(j.source_url);
                  const conf = averageConfidence(j.confidence_scores);
                  return (
                    <tr
                      key={j.id}
                      onClick={() => openReview(j)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") openReview(j);
                      }}
                      className="border-b border-border last:border-b-0 ax-row-hover transition-colors cursor-pointer focus:outline-none focus:bg-accent/5"
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
                            alt=""
                            className="h-5 w-5 rounded-sm bg-muted shrink-0"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                            }}
                          />
                          <div className="min-w-0">
                            <div className="font-medium hover:text-accent transition-colors">
                              {host}
                            </div>
                            <div className="text-xs text-muted-foreground truncate max-w-md">
                              {j.source_url}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border capitalize",
                            statusBadgeClass(j.status),
                          )}
                        >
                          {j.status === "processing" && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          {j.status === "applied" && <CheckCircle2 className="h-3 w-3" />}
                          {j.status === "failed" && <XCircle className="h-3 w-3" />}
                          {j.status === "review" && <AlertTriangle className="h-3 w-3" />}
                          {j.status}
                        </span>
                        {j.retry_count > 0 && (
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            retries: {j.retry_count}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <ConfidencePill score={conf} />
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {j.error_message ? (
                          <span className="text-destructive truncate inline-block max-w-xs">
                            {j.error_message}
                          </span>
                        ) : j.created_product_id ? (
                          <span className="text-accent">→ product created</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-3 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                      </td>
                      <td
                        className="p-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {j.status === "failed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRetry(j)}
                            disabled={retrying === j.id}
                            className="gap-1.5"
                          >
                            <RefreshCcw
                              className={cn(
                                "h-3 w-3",
                                retrying === j.id && "animate-spin",
                              )}
                            />
                            Retry
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => openReview(j)}>
                            View
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No jobs in {statusTab === "all" ? "any" : statusTab} state.
            </div>
          )}
        </div>
      )}

      <IngestionDrawer
        job={reviewing}
        onClose={closeReview}
        onChanged={() => {
          load();
        }}
      />

      <ImportFromUrlDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
