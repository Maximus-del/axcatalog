import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";

type IngestionStatus =
  | "pending"
  | "processing"
  | "review"
  | "applied"
  | "failed"
  | "cancelled";

const STATUS_OPTIONS: IngestionStatus[] = [
  "pending",
  "processing",
  "review",
  "applied",
  "failed",
  "cancelled",
];

interface Job {
  id: string;
  organization_id: string;
  source_url: string;
  status: IngestionStatus;
  retry_count: number;
  error_message: string | null;
  extracted_data: Record<string, unknown> | null;
  confidence_scores: Record<string, number> | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
  processed_at: string | null;
  created_product_id: string | null;
}

interface Extracted {
  title?: string;
  description?: string;
  price?: number | string;
  compare_at_price?: number | string;
  sku?: string;
  vendor?: string;
  brand?: string;
  images?: string[];
}

function statusBadge(s: IngestionStatus): string {
  switch (s) {
    case "applied":
      return "bg-accent/15 text-accent border-accent/30";
    case "review":
      return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "processing":
      return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "failed":
      return "bg-destructive/15 text-destructive border-destructive/30";
    case "cancelled":
      return "bg-muted text-muted-foreground/60 border-border";
    case "pending":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function IngestionQueue() {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState<Job | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ingestion_jobs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) console.error("ingestion jobs error:", error);
      setJobs((data ?? []) as unknown as Job[]);
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

  // Auto-open review modal from URL
  useEffect(() => {
    if (!params.id || !jobs) return;
    const job = jobs.find((j) => j.id === params.id);
    if (job) setReviewing(job);
  }, [params.id, jobs]);

  const filtered = useMemo(() => {
    if (!jobs) return [];
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFilter !== "all" && j.status !== statusFilter) return false;
      if (!q) return true;
      return (
        j.source_url.toLowerCase().includes(q) ||
        (j.error_message ?? "").toLowerCase().includes(q)
      );
    });
  }, [jobs, search, statusFilter]);

  const isEmpty = !loading && jobs && jobs.length === 0;

  function openReview(job: Job) {
    navigate(`/admin/ingestion/${job.id}`);
  }
  function closeReview() {
    setReviewing(null);
    navigate("/admin/ingestion");
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
        <Button variant="outline" onClick={load} className="gap-2">
          <RefreshCcw className="h-4 w-4" /> Refresh
        </Button>
      </header>

      {!isEmpty && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search URL or error…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading && (
        <div className="ax-card p-0 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-4 border-b border-border last:border-b-0"
            >
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
            No ingestion jobs yet. Use <strong>Import from URL</strong> on the Products page to
            queue one.
          </p>
          <Button variant="outline" onClick={() => navigate("/admin/products")}>
            Go to Products
          </Button>
        </div>
      )}

      {!loading && jobs && jobs.length > 0 && (
        <div className="ax-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground p-3">Source</th>
                  <th className="text-left font-medium text-muted-foreground p-3">Status</th>
                  <th className="text-left font-medium text-muted-foreground p-3">Notes</th>
                  <th className="text-right font-medium text-muted-foreground p-3">Created</th>
                  <th className="text-right font-medium text-muted-foreground p-3 w-32">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => (
                  <tr
                    key={j.id}
                    className="border-b border-border last:border-b-0 ax-row-hover transition-colors"
                  >
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => openReview(j)}
                        className="font-medium hover:text-accent transition-colors text-left"
                      >
                        {hostOf(j.source_url)}
                      </button>
                      <div className="text-xs text-muted-foreground truncate max-w-md">
                        {j.source_url}
                      </div>
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border capitalize",
                          statusBadge(j.status),
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
                    <td className="p-3 text-right text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                    </td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => openReview(j)}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No jobs match your filters.
            </div>
          )}
        </div>
      )}

      <ReviewDialog
        job={reviewing}
        onClose={closeReview}
        onChanged={() => {
          load();
        }}
      />
    </div>
  );
}

interface ReviewProps {
  job: Job | null;
  onClose: () => void;
  onChanged: () => void;
}

function ReviewDialog({ job, onClose, onChanged }: ReviewProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [compareAt, setCompareAt] = useState("");
  const [sku, setSku] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const extracted: Extracted = useMemo(
    () => (job?.extracted_data as Extracted | null) ?? {},
    [job],
  );

  useEffect(() => {
    if (!job) return;
    setTitle(String(extracted.title ?? ""));
    setDescription(String(extracted.description ?? ""));
    setPrice(extracted.price != null ? String(extracted.price) : "");
    setCompareAt(extracted.compare_at_price != null ? String(extracted.compare_at_price) : "");
    setSku(String(extracted.sku ?? ""));
  }, [job, extracted]);

  async function handleApply() {
    if (!job) return;
    if (!title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: product, error } = await supabase
        .from("products")
        .insert({
          organization_id: job.organization_id,
          title: title.trim(),
          slug: slugify(title),
          description: description.trim() || null,
          price: price ? Number(price) : null,
          compare_at_price: compareAt ? Number(compareAt) : null,
          sku: sku.trim() || null,
          status: "draft",
          source_url: job.source_url,
          needs_review: true,
          ai_confidence_score:
            job.confidence_scores && typeof job.confidence_scores === "object"
              ? (Object.values(job.confidence_scores).reduce<number>(
                  (acc, v) => acc + (typeof v === "number" ? v : 0),
                  0,
                ) /
                  Math.max(1, Object.values(job.confidence_scores).length)) || null
              : null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: jobErr } = await supabase
        .from("ingestion_jobs")
        .update({
          status: "applied",
          applied_at: new Date().toISOString(),
          created_product_id: product.id,
        })
        .eq("id", job.id);
      if (jobErr) throw jobErr;

      toast({ title: "Product created from ingestion" });
      onChanged();
      onClose();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Apply failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleRetry() {
    if (!job) return;
    setRetrying(true);
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
      toast({ title: "Re-queued" });
      onChanged();
      onClose();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Retry failed",
        variant: "destructive",
      });
    } finally {
      setRetrying(false);
    }
  }

  async function handleCancel() {
    if (!job) return;
    try {
      const { error } = await supabase
        .from("ingestion_jobs")
        .update({ status: "cancelled" })
        .eq("id", job.id);
      if (error) throw error;
      toast({ title: "Cancelled" });
      setConfirmCancel(false);
      onChanged();
      onClose();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Cancel failed",
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (!job) return;
    try {
      const { error } = await supabase.from("ingestion_jobs").delete().eq("id", job.id);
      if (error) throw error;
      toast({ title: "Job deleted" });
      onChanged();
      onClose();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Delete failed",
        variant: "destructive",
      });
    }
  }

  const open = !!job;
  const isApplied = job?.status === "applied";
  const isCancelled = job?.status === "cancelled";
  const canApply = !isApplied && !isCancelled;
  const canRetry = job?.status === "failed" || job?.status === "pending";
  const images = Array.isArray(extracted.images) ? extracted.images : [];

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review ingestion job</DialogTitle>
            <DialogDescription>
              Edit and approve to create a product, or re-queue / cancel.
            </DialogDescription>
          </DialogHeader>

          {job && (
            <div className="space-y-5">
              <div className="ax-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border capitalize",
                      statusBadge(job.status),
                    )}
                  >
                    {job.status}
                  </span>
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-accent hover:underline inline-flex items-center gap-1 truncate max-w-md"
                  >
                    {job.source_url} <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                </div>
                {job.error_message && (
                  <p className="text-xs text-destructive">{job.error_message}</p>
                )}
                <div className="text-[11px] text-muted-foreground flex gap-3">
                  <span>
                    Created{" "}
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </span>
                  {job.processed_at && (
                    <span>
                      Processed{" "}
                      {formatDistanceToNow(new Date(job.processed_at), { addSuffix: true })}
                    </span>
                  )}
                  {job.retry_count > 0 && <span>Retries: {job.retry_count}</span>}
                </div>
              </div>

              {Object.keys(extracted).length === 0 && (
                <div className="ax-card p-4 text-sm text-muted-foreground text-center">
                  No extracted data yet. The job is still pending or processing.
                </div>
              )}

              {images.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Extracted images</Label>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.slice(0, 8).map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={src}
                        alt=""
                        className="h-20 w-20 object-cover rounded-md border border-border bg-muted shrink-0"
                        loading="lazy"
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                <Field label="Title *">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Description">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Price">
                    <Input
                      type="number"
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </Field>
                  <Field label="Compare-at">
                    <Input
                      type="number"
                      step="0.01"
                      value={compareAt}
                      onChange={(e) => setCompareAt(e.target.value)}
                    />
                  </Field>
                  <Field label="SKU">
                    <Input value={sku} onChange={(e) => setSku(e.target.value)} />
                  </Field>
                </div>
              </div>

              {job.confidence_scores && typeof job.confidence_scores === "object" && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Confidence</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(job.confidence_scores).map(([k, v]) => (
                      <span
                        key={k}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border border-border bg-muted text-muted-foreground"
                      >
                        {k}:{" "}
                        <span className="tabular-nums text-foreground">
                          {Math.round(Number(v) * 100)}%
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {isApplied && job.created_product_id && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onClose();
                    setTimeout(() => {
                      window.location.href = `/admin/products/${job.created_product_id}`;
                    }, 50);
                  }}
                >
                  Open created product →
                </Button>
              )}
            </div>
          )}

          <DialogFooter className="flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={handleDelete}
              className="gap-2 text-destructive hover:text-destructive mr-auto"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            {!isCancelled && !isApplied && (
              <Button variant="outline" onClick={() => setConfirmCancel(true)}>
                Cancel job
              </Button>
            )}
            {canRetry && (
              <Button variant="outline" onClick={handleRetry} disabled={retrying} className="gap-2">
                <RefreshCcw className="h-4 w-4" /> {retrying ? "Re-queuing…" : "Retry"}
              </Button>
            )}
            {canApply && (
              <Button onClick={handleApply} disabled={saving}>
                {saving ? "Applying…" : "Apply → create product"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this ingestion job?</AlertDialogTitle>
            <AlertDialogDescription>
              The job will be marked as cancelled. You can re-queue from the Products page later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel}>Cancel job</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
