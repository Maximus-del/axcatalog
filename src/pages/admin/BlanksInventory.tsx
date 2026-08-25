// Blanks Inventory — what we have, where it is, and whether we can show it.
//
// Shopify owns the quantities and Drive owns the photographs. This page owns
// neither: it reads both, derives the four states, and never writes a number
// back. The only writes it offers are the two decisions a person has to make —
// which Shopify product a blank IS, and which Drive folder holds its pictures.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2, RefreshCw, Search, ImageOff, AlertTriangle, Eye, EyeOff,
  Unlink, CloudOff,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  driveConnected, loadInventory, matchesInventoryFilters, summarize, syncLabels,
  type InventoryBlank, type InventoryFilters,
} from "@/lib/ecosystem/blanks-inventory-data";
import { STATUS_LABELS, type AvailabilityStatus } from "@/lib/ecosystem/blank-inventory";
import { COVERAGE_LABELS } from "@/lib/ecosystem/drive-index";
import { setHidden } from "@/lib/ecosystem/blank-catalog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<AvailabilityStatus, string> = {
  available: "text-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.14)]",
  sold_out: "text-amber-500 bg-amber-500/15",
  hidden: "text-[hsl(var(--ax-faint))] bg-[hsl(var(--ax-line))]",
  // Deliberately its own tone. "Not linked" is missing information, not a
  // problem with the garment, so it must not read like sold out.
  not_linked: "text-sky-400 bg-sky-400/15",
  // Not managed is a boundary fact, not a problem — the quietest tone there is.
  not_managed: "text-[hsl(var(--ax-faint))] bg-transparent border border-[hsl(var(--ax-border))]",
};

export default function BlanksInventory() {
  const [rows, setRows] = useState<InventoryBlank[] | null>(null);
  const [drive, setDrive] = useState<boolean | null>(null);
  const [filters, setFilters] = useState<InventoryFilters>({});
  const [reconciling, setReconciling] = useState(false);
  const [lastRun, setLastRun] = useState<Record<string, unknown> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const connected = await driveConnected();
    setDrive(connected);
    setRows(await loadInventory({ driveConnected: connected }).catch((e) => {
      toast.error(e instanceof Error ? e.message : "Could not load inventory");
      return [];
    }));
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const blanks = rows ?? [];
  const summary = useMemo(() => summarize(blanks), [blanks]);
  const shown = useMemo(
    () => blanks.filter((b) => matchesInventoryFilters(b, filters)),
    [blanks, filters],
  );

  const manufacturers = useMemo(
    () => [...new Set(blanks.map((b) => b.manufacturer).filter(Boolean))].sort() as string[],
    [blanks],
  );

  async function reconcile() {
    setReconciling(true);
    const started = new Date();
    try {
      const { data, error } = await supabase.functions.invoke("shopify-reconcile-blanks", { body: {} });
      if (error) throw error;
      setLastRun({ ...(data as Record<string, unknown>), client_started: started.toISOString() });
      const d = data as { linked_blanks_updated?: number; errors?: string[] };
      toast.success(`Reconciled ${d.linked_blanks_updated ?? 0} linked blanks`);
      if (d.errors?.length) toast.error(`${d.errors.length} error(s) — see the run summary`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reconciliation failed");
    } finally { setReconciling(false); }
  }

  async function rescanImages() {
    try {
      const { data, error } = await supabase.functions.invoke("drive-index-blanks", { body: {} });
      if (error) throw error;
      const d = data as { written?: number; marked_missing?: number };
      toast.success(`${d.written ?? 0} images indexed, ${d.marked_missing ?? 0} marked missing`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rescan failed");
    }
  }

  async function toggleHidden(b: InventoryBlank) {
    setBusyId(b.id);
    try {
      await setHidden([b.id], !b.isHidden);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change visibility");
    } finally { setBusyId(null); }
  }

  if (rows === null) {
    return <div className="p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  const chip = (key: keyof InventoryFilters, value: string | null, label: string, count?: number) => {
    const on = (filters as Record<string, unknown>)[key] === value;
    return (
      <button
        key={`${key}:${value}`}
        onClick={() => setFilters((f) => ({ ...f, [key]: on ? null : value }))}
        className={cn(
          "h-7 px-2.5 rounded-full text-[11px] font-semibold border transition-colors whitespace-nowrap",
          on
            ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))]"
            : "border-[hsl(var(--ax-border))] text-muted-foreground hover:text-foreground",
        )}
      >
        {label}{count != null ? ` ${count}` : ""}
      </button>
    );
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-5 pb-24">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Blanks Inventory</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Shopify owns the quantities. Drive owns the photography. Nothing here writes to either.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={rescanImages}
            disabled={drive === false}
            title={drive === false ? "Drive credentials are not configured" : "Re-index Folder 03"}
            className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-40"
          ><RefreshCw className="h-4 w-4" /> Rescan Images</button>
          <button
            onClick={reconcile}
            disabled={reconciling}
            className="h-9 px-3.5 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[13px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {reconciling
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Reconciling…</>
              : <><RefreshCw className="h-4 w-4" /> Reconcile Shopify Inventory</>}
          </button>
        </div>
      </div>

      {/* Drive missing must degrade this page, not break it. */}
      {drive === false && (
        <div className="ax-card p-3 flex items-start gap-2.5 border-sky-400/40">
          <CloudOff className="h-4 w-4 text-sky-400 mt-0.5 shrink-0" />
          <div className="text-[13px]">
            <span className="font-semibold">Drive Connection Required.</span>{" "}
            <span className="text-muted-foreground">
              Inventory below is live; image coverage is unknown until a Google service account is
              configured. Everything else on this page works.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {(["available", "sold_out", "not_linked", "hidden"] as AvailabilityStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilters((f) => ({ ...f, status: f.status === s ? null : s }))}
            className={cn("ax-card p-3 text-left transition-colors",
              filters.status === s && "ring-1 ring-[hsl(var(--ax-accent))]")}
          >
            <div className="text-xl font-black tabular-nums">{summary.status[s]}</div>
            <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))]">
              {STATUS_LABELS[s]}
            </div>
          </button>
        ))}
        <div className="ax-card p-3">
          <div className="text-xl font-black tabular-nums text-amber-500">{summary.missingBarcode}</div>
          <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))]">Missing barcode</div>
        </div>
        <div className="ax-card p-3">
          <div className="text-xl font-black tabular-nums text-amber-500">{summary.duplicateBarcode}</div>
          <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))]">Duplicate barcode</div>
        </div>
        <div className="ax-card p-3">
          <div className="text-xl font-black tabular-nums">{summary.missingImage + summary.partialImage}</div>
          <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))]">Image gaps</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[hsl(var(--ax-faint))]" />
          <Input
            value={filters.search ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search blanks, SKUs, style numbers…"
            className="h-9 pl-8 text-[13px]"
          />
        </span>
        {chip("issue", "missing_barcode", "Missing barcode", summary.missingBarcode)}
        {chip("issue", "duplicate_barcode", "Duplicate barcode", summary.duplicateBarcode)}
        {chip("issue", "missing_image", "Missing image", summary.missingImage)}
        {chip("issue", "partial_image", "Partial images", summary.partialImage)}
        {chip("issue", "image_match_required", "Match required", summary.matchRequired)}
        {chip("assortment", "athlete", "Athlete")}
        {chip("assortment", "client", "Client")}
        <select
          value={filters.manufacturer ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, manufacturer: e.target.value || null }))}
          className="h-7 rounded-full border border-[hsl(var(--ax-border))] bg-card text-foreground text-[11px] px-2"
        >
          <option value="">All manufacturers</option>
          {manufacturers.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {(filters.status || filters.issue || filters.manufacturer || filters.assortment || filters.search) && (
          <button onClick={() => setFilters({})} className="text-[11px] font-semibold text-[hsl(var(--ax-accent))]">
            Clear
          </button>
        )}
      </div>

      {lastRun && <RunSummary run={lastRun} />}

      <div className="ax-card p-0 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))] border-b border-[hsl(var(--ax-border))]">
              <th className="p-2 w-12" />
              <th className="p-2 text-left">Blank</th>
              <th className="p-2 text-left">Manufacturer</th>
              <th className="p-2 text-left">Shopify</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-right">Available</th>
              <th className="p-2 text-right">Colors</th>
              <th className="p-2 text-right">Variants</th>
              <th className="p-2 text-left">Barcodes</th>
              <th className="p-2 text-left">Images</th>
              <th className="p-2 text-left">Assortments</th>
              <th className="p-2 text-left">Synced</th>
              <th className="p-2 w-8" />
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => {
              const sync = syncLabels(b);
              const preview = b.images.find((i) => !i.missing && i.viewType === "FRONT");
              return (
                <tr key={b.id} className={cn(
                  "border-b border-[hsl(var(--ax-border))] last:border-0 hover:bg-[hsl(var(--ax-line)/0.5)]",
                  b.isHidden && "opacity-70",
                )}>
                  <td className="p-2">
                    <span className="block h-9 w-9 rounded overflow-hidden bg-[hsl(var(--ax-line))]">
                      {preview?.driveUrl
                        ? <img src={preview.driveUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : <span className="h-full w-full flex items-center justify-center">
                            <ImageOff className="h-3.5 w-3.5 text-[hsl(var(--ax-faint))]" />
                          </span>}
                    </span>
                  </td>
                  <td className="p-2">
                    <Link to={`/admin/blanks/${b.id}`} className="font-semibold hover:text-[hsl(var(--ax-accent))]">
                      {b.name}
                    </Link>
                    <div className="text-[10px] font-mono text-[hsl(var(--ax-faint))]">
                      {b.sku ?? "—"} · {b.styleNumber ?? "—"}
                    </div>
                  </td>
                  <td className="p-2 text-muted-foreground">{b.manufacturer ?? "—"}</td>
                  <td className="p-2">
                    {b.shopifyProductId
                      ? <span className="text-[11px]">
                          {b.shopifyStatus ?? "linked"}
                          <span className="block text-[10px] font-mono text-[hsl(var(--ax-faint))]">
                            {b.shopifyProductId}
                          </span>
                        </span>
                      : <span className="text-[11px] text-sky-400 inline-flex items-center gap-1">
                          <Unlink className="h-3 w-3" /> not linked
                        </span>}
                  </td>
                  <td className="p-2">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap", STATUS_TONE[b.status])}>
                      {STATUS_LABELS[b.status]}
                    </span>
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {b.shopifyProductId ? b.totalAvailable : "—"}
                  </td>
                  <td className="p-2 text-right tabular-nums">{b.colors.length}</td>
                  <td className="p-2 text-right tabular-nums">{b.variants.length}</td>
                  <td className="p-2">
                    {b.barcodesMissing === 0 && b.barcodesDuplicated === 0
                      ? <span className="text-[hsl(var(--ax-faint))]">—</span>
                      : <span className="text-amber-500 inline-flex items-center gap-1 text-[11px]">
                          <AlertTriangle className="h-3 w-3" />
                          {b.barcodesMissing > 0 ? `${b.barcodesMissing} missing` : ""}
                          {b.barcodesMissing > 0 && b.barcodesDuplicated > 0 ? ", " : ""}
                          {b.barcodesDuplicated > 0 ? `${b.barcodesDuplicated} dup` : ""}
                        </span>}
                  </td>
                  <td className="p-2">
                    <span className={cn("text-[11px]",
                      b.coverage === "complete" ? "text-[hsl(var(--ax-accent))]"
                        : b.coverage === "drive_connection_required" ? "text-sky-400"
                        : "text-amber-500")}>
                      {COVERAGE_LABELS[b.coverage]}
                    </span>
                  </td>
                  <td className="p-2">
                    <span className="flex gap-1 flex-wrap">
                      {b.assortments.length === 0
                        ? <span className="text-[hsl(var(--ax-faint))]">—</span>
                        : b.assortments.map((a) => (
                            <span key={a} className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-[hsl(var(--ax-accent)/0.14)] text-[hsl(var(--ax-accent))]">
                              {a}
                            </span>
                          ))}
                    </span>
                  </td>
                  <td className="p-2 text-[10px] text-[hsl(var(--ax-faint))] whitespace-nowrap">
                    <span className={cn(sync.shopify.stale && "text-amber-500")}>S: {sync.shopify.label}</span>
                    <span className="block">D: {sync.drive.label}</span>
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => toggleHidden(b)}
                      disabled={busyId === b.id}
                      title={b.isHidden ? "Put back on offer" : "Hide"}
                      className={cn("transition-colors", b.isHidden ? "text-amber-500" : "text-muted-foreground hover:text-foreground")}
                    >
                      {b.isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="p-8 text-center text-[13px] text-muted-foreground">Nothing matches those filters.</p>
        )}
      </div>
    </div>
  );
}

/** What the last reconciliation actually did, including what it failed at. */
function RunSummary({ run }: { run: Record<string, unknown> }) {
  const n = (k: string) => (run[k] as number) ?? 0;
  const errors = (run.errors as string[]) ?? [];
  const fields: [string, string | number][] = [
    ["Started", String(run.started_at ?? "—").slice(11, 19)],
    ["Finished", String(run.finished_at ?? "—").slice(11, 19)],
    ["Products examined", n("shopify_products_examined")],
    ["Active / draft / archived", `${n("shopify_active")} / ${n("shopify_draft")} / ${n("shopify_archived")}`],
    ["Locations", n("locations")],
    ["Linked blanks updated", n("linked_blanks_updated")],
    ["Variants updated", n("variants_updated")],
    ["Levels updated", n("inventory_levels_updated")],
    ["Missing barcodes", n("missing_barcodes")],
    ["Duplicate barcodes", n("duplicate_barcodes")],
    ["Errors", errors.length],
  ];

  return (
    <div className="ax-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--ax-faint))] mb-2">
        Last reconciliation
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-1.5 text-[12px]">
        {fields.map(([label, value]) => (
          <div key={label}>
            <span className="block text-[10px] text-[hsl(var(--ax-faint))]">{label}</span>
            <span className="font-semibold tabular-nums">{value}</span>
          </div>
        ))}
      </div>
      {errors.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-amber-500">
          {errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </div>
  );
}
