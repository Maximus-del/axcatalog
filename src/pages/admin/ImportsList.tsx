import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Upload, FileText, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Batch {
  id: string;
  file_name: string;
  status: string;
  total_rows: number;
  orders_imported: number;
  orders_skipped: number;
  line_items_imported: number;
  line_items_attributed: number;
  line_items_unattributed: number;
  uploaded_at: string;
  completed_at: string | null;
  error_log: any;
}

export default function ImportsList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    void supabase.from("user_profiles").select("organization_id").eq("id", user.id).maybeSingle()
      .then(({ data }) => setOrgId(data?.organization_id ?? null));
  }, [user?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("import_batches")
      .select("*")
      .order("uploaded_at", { ascending: false })
      .limit(50);
    setBatches((data ?? []) as Batch[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleFile = async (file: File) => {
    if (!file || !orgId) {
      toast.error("Your profile org is not loaded yet");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }
    setUploading(true);
    try {
      const csv_text = await file.text();
      const t = toast.loading(`Importing ${file.name}...`);
      const { data, error } = await supabase.functions.invoke("import-shopify-orders-csv", {
        body: {
          csv_text,
          file_name: file.name,
          organization_id: orgId,
        },
      });
      toast.dismiss(t);
      if (error) {
        toast.error(`Import failed: ${error.message}`);
      } else {
        toast.success(
          `Imported ${data?.orders_imported ?? 0} orders · ${data?.line_items_imported ?? 0} line items`,
        );
        navigate(`/admin/imports/orders/${data.batch_id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      void load();
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8">
      <header>
        <div className="ax-section-header mb-2">Imports</div>
        <h1 className="text-3xl font-bold">Orders CSV Import</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Upload a Shopify Orders Export CSV. Line items are attributed to the
          correct athlete-org via active attribution rules.
        </p>
      </header>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault(); setDrag(false);
          const f = e.dataTransfer.files?.[0]; if (f) void handleFile(f);
        }}
        className={`ax-card flex flex-col items-center justify-center py-14 border-2 border-dashed transition ${
          drag ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        <Upload className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">Drop your Shopify Orders CSV here</p>
        <p className="text-xs text-muted-foreground mb-4">or click to choose a file</p>
        <input
          id="csv-file" type="file" accept=".csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
        />
        <Button asChild disabled={uploading} variant="outline">
          <label htmlFor="csv-file" className="cursor-pointer">
            {uploading ? "Uploading..." : "Choose CSV"}
          </label>
        </Button>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Import history</h2>
          <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-3 w-3 mr-2"/>Refresh</Button>
        </div>
        {loading ? (
          <div className="space-y-2">
            {[0,1,2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : batches.length === 0 ? (
          <div className="ax-card text-center text-sm text-muted-foreground py-10">
            No imports yet. Drop a CSV above to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => navigate(`/admin/imports/orders/${b.id}`)}
                className="w-full ax-card text-left hover:border-accent transition"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{b.file_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {new Date(b.uploaded_at).toLocaleString()} · {b.total_rows} rows
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <Stat label="Orders" value={b.orders_imported} />
                    <Stat label="Line items" value={b.line_items_imported} />
                    <Stat label="Unattributed" value={b.line_items_unattributed} warn={b.line_items_unattributed > 0} />
                    <StatusPill status={b.status} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-semibold tabular-nums ${warn ? "text-accent" : ""}`}>{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const ok = status === "completed";
  const warn = status === "completed_with_errors";
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : RefreshCw;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
      ok ? "bg-emerald-500/10 text-emerald-600"
         : warn ? "bg-amber-500/10 text-amber-600"
                : "bg-muted text-muted-foreground"
    }`}>
      <Icon className="h-3 w-3" />
      {status.replace(/_/g, " ")}
    </span>
  );
}
