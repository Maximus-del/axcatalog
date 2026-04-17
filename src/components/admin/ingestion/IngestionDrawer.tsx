import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Save,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/slug";

export type IngestionStatus =
  | "pending"
  | "processing"
  | "review"
  | "applied"
  | "failed"
  | "cancelled";

export interface IngestionJob {
  id: string;
  organization_id: string;
  source_url: string;
  status: IngestionStatus;
  retry_count: number;
  error_message: string | null;
  extracted_data: Record<string, unknown> | null;
  raw_scrape: Record<string, unknown> | null;
  confidence_scores: Record<string, number> | null;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
  processed_at: string | null;
  created_product_id: string | null;
  created_by: string | null;
}

export function statusBadgeClass(s: IngestionStatus): string {
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

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function averageConfidence(
  scores: Record<string, number> | null,
): number | null {
  if (!scores || typeof scores !== "object") return null;
  const values = Object.values(scores).filter((v) => typeof v === "number");
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const FIELD_KEYS = [
  "title",
  "description",
  "price",
  "compare_at_price",
  "sku",
  "vendor",
  "brand",
  "notes",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

interface Props {
  job: IngestionJob | null;
  onClose: () => void;
  onChanged: () => void;
}

function ConfidenceBadge({ score }: { score: number | undefined }) {
  if (score == null) return null;
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
        "ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] border tabular-nums",
        color,
      )}
    >
      {pct}%
    </span>
  );
}

function fieldHighlight(score: number | undefined): string {
  if (score == null) return "";
  if (score < 0.7) return "border-destructive/50 focus-visible:ring-destructive/40";
  if (score < 0.9) return "border-yellow-500/40 focus-visible:ring-yellow-500/30";
  return "";
}

export function IngestionDrawer({ job, onClose, onChanged }: Props) {
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<FieldKey, string>>(() =>
    blankValues(),
  );
  const [savingField, setSavingField] = useState<FieldKey | null>(null);
  const [rawScrapeText, setRawScrapeText] = useState("");
  const [savingRaw, setSavingRaw] = useState(false);
  const [applying, setApplying] = useState(false);
  const [marking, setMarking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [createdBy, setCreatedBy] = useState<{
    full_name: string | null;
    email: string | null;
  } | null>(null);

  const open = !!job;

  // Hydrate values from job
  useEffect(() => {
    if (!job) return;
    const data = (job.extracted_data ?? {}) as Record<string, unknown>;
    const next = blankValues();
    for (const k of FIELD_KEYS) {
      const v = data[k];
      if (v != null) next[k] = String(v);
    }
    setValues(next);

    // Raw scrape pretty
    if (job.raw_scrape) {
      try {
        setRawScrapeText(JSON.stringify(job.raw_scrape, null, 2));
      } catch {
        setRawScrapeText("");
      }
    } else {
      setRawScrapeText("");
    }
  }, [job]);

  // Fetch created_by user info
  useEffect(() => {
    if (!job?.created_by) {
      setCreatedBy(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("full_name, email")
        .eq("id", job.created_by!)
        .maybeSingle();
      if (!cancelled) setCreatedBy(data ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [job?.created_by]);

  // Esc closes; Cmd/Ctrl+S triggers Save Draft (writes all current field values)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveAllFields();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, values]);

  const confidence = (job?.confidence_scores ?? {}) as Record<string, number>;

  async function saveField(key: FieldKey, value: string) {
    if (!job) return;
    setSavingField(key);
    try {
      const data = (job.extracted_data ?? {}) as Record<string, unknown>;
      const next = { ...data, [key]: value };
      const { error } = await supabase
        .from("ingestion_jobs")
        .update({ extracted_data: next as never })
        .eq("id", job.id);
      if (error) throw error;
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Save failed",
        variant: "destructive",
      });
    } finally {
      setSavingField(null);
    }
  }

  async function saveAllFields() {
    if (!job) return;
    const data = (job.extracted_data ?? {}) as Record<string, unknown>;
    const next = { ...data };
    for (const k of FIELD_KEYS) next[k] = values[k];
    const { error } = await supabase
      .from("ingestion_jobs")
      .update({ extracted_data: next as never })
      .eq("id", job.id);
    if (error) {
      toast({ title: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Draft saved" });
  }

  async function saveRawScrape() {
    if (!job) return;
    setSavingRaw(true);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(rawScrapeText) as Record<string, unknown>;
      } catch {
        parsed = { manual_paste: rawScrapeText };
      }
      const { error } = await supabase
        .from("ingestion_jobs")
        .update({ raw_scrape: parsed as never })
        .eq("id", job.id);
      if (error) throw error;
      toast({ title: "Raw scrape saved" });
      onChanged();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Save failed",
        variant: "destructive",
      });
    } finally {
      setSavingRaw(false);
    }
  }

  async function handleMarkReview() {
    if (!job) return;
    setMarking(true);
    try {
      const { error } = await supabase
        .from("ingestion_jobs")
        .update({ status: "review" })
        .eq("id", job.id);
      if (error) throw error;
      toast({ title: "Marked for review" });
      onChanged();
      onClose();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Update failed",
        variant: "destructive",
      });
    } finally {
      setMarking(false);
    }
  }

  async function handleCancel() {
    if (!job) return;
    setCancelling(true);
    try {
      const { error } = await supabase
        .from("ingestion_jobs")
        .update({ status: "cancelled" })
        .eq("id", job.id);
      if (error) throw error;
      toast({ title: "Job cancelled" });
      onChanged();
      onClose();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Cancel failed",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  }

  async function handleApply() {
    if (!job) return;
    if (!values.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setApplying(true);
    try {
      const avg = averageConfidence(job.confidence_scores);
      const { data: product, error } = await supabase
        .from("products")
        .insert({
          organization_id: job.organization_id,
          title: values.title.trim(),
          slug: slugify(values.title),
          description: values.description.trim() || null,
          price: values.price ? Number(values.price) : null,
          compare_at_price: values.compare_at_price
            ? Number(values.compare_at_price)
            : null,
          sku: values.sku.trim() || null,
          notes: values.notes.trim() || null,
          status: "draft",
          source_url: job.source_url,
          needs_review: true,
          ai_confidence_score: avg,
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

      toast({
        title: "Product created",
        description: "Click to open the new product.",
        action: (
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/admin/products/${product.id}`)}
          >
            View
          </Button>
        ),
      });
      onChanged();
      onClose();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "Apply failed",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  }

  const isApplied = job?.status === "applied";
  const isCancelled = job?.status === "cancelled";
  const canApply = !isApplied && !isCancelled;

  const host = useMemo(() => (job ? hostOf(job.source_url) : ""), [job]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl flex flex-col p-0 bg-card border-border"
      >
        {job && (
          <>
            <SheetHeader className="px-6 py-4 border-b border-border space-y-3">
              <div className="flex items-center gap-2">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
                  alt=""
                  className="h-5 w-5 rounded-sm bg-muted shrink-0"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                  }}
                />
                <SheetTitle className="text-base">{host}</SheetTitle>
                <span
                  className={cn(
                    "ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border capitalize",
                    statusBadgeClass(job.status),
                  )}
                >
                  {job.status === "processing" && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  {job.status === "applied" && <CheckCircle2 className="h-3 w-3" />}
                  {job.status === "failed" && <XCircle className="h-3 w-3" />}
                  {job.status === "review" && <AlertTriangle className="h-3 w-3" />}
                  {job.status}
                </span>
              </div>
              <SheetDescription asChild>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs">
                    <a
                      href={job.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-accent hover:underline truncate inline-flex items-center gap-1"
                    >
                      {job.source_url}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(job.source_url);
                        toast({ title: "URL copied" });
                      }}
                      className="text-muted-foreground hover:text-foreground"
                      title="Copy URL"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-3">
                    <span>
                      Created{" "}
                      {formatDistanceToNow(new Date(job.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                    {createdBy && (
                      <span>
                        by {createdBy.full_name || createdBy.email || "Unknown"}
                      </span>
                    )}
                    {job.retry_count > 0 && <span>Retries: {job.retry_count}</span>}
                  </div>
                  {job.error_message && (
                    <p className="text-xs text-destructive">{job.error_message}</p>
                  )}
                </div>
              </SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="extracted" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-6 mt-3 self-start">
                <TabsTrigger value="extracted">Extracted Data</TabsTrigger>
                <TabsTrigger value="raw">Raw Scrape</TabsTrigger>
                <TabsTrigger value="reasoning">AI Reasoning</TabsTrigger>
              </TabsList>

              {/* Extracted */}
              <TabsContent
                value="extracted"
                className="flex-1 overflow-y-auto px-6 py-4 space-y-4 mt-0"
              >
                <FieldRow
                  label="Title"
                  required
                  conf={confidence.title}
                  saving={savingField === "title"}
                >
                  <Input
                    value={values.title}
                    onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))}
                    onBlur={(e) => saveField("title", e.target.value)}
                    className={fieldHighlight(confidence.title)}
                  />
                </FieldRow>

                <FieldRow
                  label="Description"
                  conf={confidence.description}
                  saving={savingField === "description"}
                >
                  <Textarea
                    rows={4}
                    value={values.description}
                    onChange={(e) =>
                      setValues((s) => ({ ...s, description: e.target.value }))
                    }
                    onBlur={(e) => saveField("description", e.target.value)}
                    className={fieldHighlight(confidence.description)}
                  />
                </FieldRow>

                <div className="grid grid-cols-2 gap-3">
                  <FieldRow
                    label="Price"
                    conf={confidence.price}
                    saving={savingField === "price"}
                  >
                    <Input
                      type="number"
                      step="0.01"
                      value={values.price}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, price: e.target.value }))
                      }
                      onBlur={(e) => saveField("price", e.target.value)}
                      className={fieldHighlight(confidence.price)}
                    />
                  </FieldRow>
                  <FieldRow
                    label="Compare-at"
                    conf={confidence.compare_at_price}
                    saving={savingField === "compare_at_price"}
                  >
                    <Input
                      type="number"
                      step="0.01"
                      value={values.compare_at_price}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, compare_at_price: e.target.value }))
                      }
                      onBlur={(e) => saveField("compare_at_price", e.target.value)}
                      className={fieldHighlight(confidence.compare_at_price)}
                    />
                  </FieldRow>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FieldRow
                    label="SKU"
                    conf={confidence.sku}
                    saving={savingField === "sku"}
                  >
                    <Input
                      value={values.sku}
                      onChange={(e) => setValues((s) => ({ ...s, sku: e.target.value }))}
                      onBlur={(e) => saveField("sku", e.target.value)}
                      className={fieldHighlight(confidence.sku)}
                    />
                  </FieldRow>
                  <FieldRow
                    label="Vendor"
                    conf={confidence.vendor}
                    saving={savingField === "vendor"}
                  >
                    <Input
                      value={values.vendor}
                      onChange={(e) =>
                        setValues((s) => ({ ...s, vendor: e.target.value }))
                      }
                      onBlur={(e) => saveField("vendor", e.target.value)}
                      className={fieldHighlight(confidence.vendor)}
                    />
                  </FieldRow>
                </div>

                <FieldRow
                  label="Brand"
                  conf={confidence.brand}
                  saving={savingField === "brand"}
                >
                  <Input
                    value={values.brand}
                    onChange={(e) => setValues((s) => ({ ...s, brand: e.target.value }))}
                    onBlur={(e) => saveField("brand", e.target.value)}
                    className={fieldHighlight(confidence.brand)}
                  />
                </FieldRow>

                <FieldRow
                  label="Notes"
                  conf={confidence.notes}
                  saving={savingField === "notes"}
                >
                  <Textarea
                    rows={2}
                    value={values.notes}
                    onChange={(e) => setValues((s) => ({ ...s, notes: e.target.value }))}
                    onBlur={(e) => saveField("notes", e.target.value)}
                    className={fieldHighlight(confidence.notes)}
                  />
                </FieldRow>

                {isApplied && job.created_product_id && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate(`/admin/products/${job.created_product_id}`)}
                  >
                    Open created product →
                  </Button>
                )}
              </TabsContent>

              {/* Raw Scrape */}
              <TabsContent
                value="raw"
                className="flex-1 overflow-y-auto px-6 py-4 space-y-3 mt-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">
                    Raw scrape (JSON)
                  </Label>
                  <span
                    title="Automatic scraping coming soon"
                    className="text-[11px] text-muted-foreground/60 italic cursor-not-allowed"
                  >
                    Fetch URL — coming soon
                  </span>
                </div>
                <Textarea
                  value={rawScrapeText}
                  onChange={(e) => setRawScrapeText(e.target.value)}
                  placeholder="Paste scraped content here…"
                  rows={18}
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveRawScrape}
                  disabled={savingRaw}
                  className="gap-2"
                >
                  {savingRaw ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save Raw Scrape
                </Button>
              </TabsContent>

              {/* AI Reasoning (placeholder) */}
              <TabsContent
                value="reasoning"
                className="flex-1 overflow-y-auto px-6 py-4 mt-0"
              >
                <div className="ax-card p-8 text-center space-y-2">
                  <Skeleton className="h-3 w-2/3 mx-auto opacity-30" />
                  <Skeleton className="h-3 w-1/2 mx-auto opacity-30" />
                  <p className="text-sm text-muted-foreground pt-2">
                    AI extraction reasoning will appear here once the scraping
                    backend is built.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {/* Action bar */}
            <div className="border-t border-border px-6 py-3 flex flex-wrap items-center justify-end gap-2 bg-[hsl(var(--dark))]">
              <Button
                variant="ghost"
                onClick={handleCancel}
                disabled={cancelling || isCancelled}
                className="mr-auto text-destructive hover:text-destructive gap-2"
              >
                {cancelling && <Loader2 className="h-4 w-4 animate-spin" />}
                Cancel Job
              </Button>
              <Button variant="outline" onClick={() => void saveAllFields()} className="gap-2">
                <Save className="h-4 w-4" /> Save Draft
              </Button>
              <Button
                variant="outline"
                onClick={handleMarkReview}
                disabled={marking || job.status === "review"}
                className="gap-2"
              >
                {marking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Mark for Review
              </Button>
              {canApply && (
                <Button onClick={handleApply} disabled={applying} className="gap-2">
                  {applying && <Loader2 className="h-4 w-4 animate-spin" />}
                  Apply
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function blankValues(): Record<FieldKey, string> {
  const o = {} as Record<FieldKey, string>;
  for (const k of FIELD_KEYS) o[k] = "";
  return o;
}

interface FieldRowProps {
  label: string;
  required?: boolean;
  conf: number | undefined;
  saving: boolean;
  children: React.ReactNode;
}

function FieldRow({ label, required, conf, saving, children }: FieldRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center">
        <Label className="text-xs">
          {label}
          {required && " *"}
        </Label>
        <ConfidenceBadge score={conf} />
        {saving && (
          <span className="ml-auto text-[10px] text-muted-foreground italic flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            saving…
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
