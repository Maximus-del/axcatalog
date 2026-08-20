// Import garment photography in bulk.
//
// Drop a folder named by AX SKU — or pick a blank and drop loose files — and
// every photo is matched to a colourway by name before anything uploads. The
// preview is the point: a bulk overwrite of good imagery should not be
// something you find out about afterwards.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Upload, Check, AlertTriangle, FolderOpen, ArrowLeft, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  coveragePercent,
  groupBySku,
  importMatchedFiles,
  isImportableImage,
  loadColorsFor,
  loadCoverage,
  matchFilesToColors,
  type BlankCoverage,
  type ColorRow,
  type MatchReport,
} from "@/lib/ecosystem/blank-images";
import { useFileDropZone } from "@/hooks/useFileDropZone";
import { BlankColorPhotoGrid } from "@/components/admin/blanks/BlankColorPhotoGrid";
import { cn } from "@/lib/utils";

export default function BlankImagesImport() {
  const [coverage, setCoverage] = useState<BlankCoverage[] | null>(null);
  const [sku, setSku] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [colors, setColors] = useState<ColorRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function refresh() {
    setCoverage(await loadCoverage().catch(() => []));
  }
  useEffect(() => { void refresh(); }, []);

  const blank = useMemo(() => coverage?.find((b) => b.sku === sku) ?? null, [coverage, sku]);

  useEffect(() => {
    if (!blank) { setColors([]); return; }
    loadColorsFor(blank.id).then(setColors).catch(() => setColors([]));
  }, [blank?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function take(incoming: File[]) {
    const images = incoming.filter(isImportableImage);
    const skipped = incoming.length - images.length;
    if (skipped > 0) toast.error(`${skipped} non-image file${skipped === 1 ? "" : "s"} ignored`);
    if (images.length === 0) return;

    // A directory drop tells us which blank it belongs to; a flat selection
    // doesn't, so the operator picks.
    const groups = groupBySku(images);
    const skus = [...groups.keys()].filter(Boolean) as string[];
    if (skus.length > 1) {
      toast.error(`That folder covers ${skus.length} blanks — drop one SKU folder at a time`);
      return;
    }
    if (skus[0]) setSku(skus[0]);
    setFiles((prev) => [...prev, ...images]);
  }

  const { isOver, dropProps } = useFileDropZone({ onFiles: take, accept: ["image/"], paste: true, folders: true });

  const report: MatchReport | null = useMemo(() => {
    if (!blank || files.length === 0) return null;
    return matchFilesToColors(files, colors, [blank.style_number ?? ""].filter(Boolean));
  }, [blank, files, colors]);

  async function run() {
    if (!report || !blank?.sku) return;
    setBusy(true);
    setProgress({ done: 0, total: report.matched.length });
    try {
      const out = await importMatchedFiles(blank.sku, report.matched, (done, total) => setProgress({ done, total }));
      if (out.imported) toast.success(`${out.imported} photo${out.imported === 1 ? "" : "s"} imported`);
      if (out.failed.length) toast.error(`${out.failed.length} failed — ${out.failed[0].error}`);
      setFiles([]);
      await refresh();
      if (blank) setColors(await loadColorsFor(blank.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const replacing = report?.matched.filter((m) => m.replaces).length ?? 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 pb-16">
      <div>
        <Link to="/admin/blanks" className="text-[13px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Blanks
        </Link>
        <h1 className="text-2xl font-bold mt-2">Import blank photography</h1>
        <p className="text-[13px] text-muted-foreground mt-1 max-w-[75ch]">
          Files are matched to colourways by name. Both conventions work:{" "}
          <code className="text-xs">greyheather.png</code> / <code className="text-xs">greyheather-back.png</code>, and
          raw vendor names like <code className="text-xs">7102-Grey-Heather b.png</code>. Drop a folder named for its
          AX SKU and the blank is picked for you.
        </p>
      </div>

      <div
        {...dropProps}
        className={cn(
          "rounded-xl border border-dashed p-8 text-center transition-colors",
          isOver ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)]" : "border-[hsl(var(--ax-border))]",
        )}
      >
        <FolderOpen className="h-7 w-7 mx-auto text-[hsl(var(--ax-faint))]" />
        <p className="text-[13px] text-muted-foreground mt-2">Drag a SKU folder in, or paste images</p>
        <div className="mt-2 flex items-center justify-center gap-4">
          <label className="text-[12px] font-semibold text-[hsl(var(--ax-accent))] cursor-pointer">
            choose a folder
            <input
              type="file"
              className="hidden"
              multiple
              // @ts-expect-error non-standard but supported everywhere that matters
              webkitdirectory=""
              onChange={(e) => { take(Array.from(e.target.files ?? [])); e.target.value = ""; }}
            />
          </label>
          <label className="text-[12px] font-semibold text-[hsl(var(--ax-accent))] cursor-pointer">
            or individual files
            <input
              type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { take(Array.from(e.target.files ?? [])); e.target.value = ""; }}
            />
          </label>
        </div>
      </div>

      {files.length > 0 && (
        <div className="ax-card p-4 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-faint))]">Blank</span>
            <select
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="h-9 rounded-lg border border-[hsl(var(--ax-border))] bg-transparent px-2 text-[13px] min-w-[280px]"
            >
              <option value="">— pick the blank these belong to —</option>
              {(coverage ?? []).filter((b) => b.sku).map((b) => (
                <option key={b.id} value={b.sku!}>{b.sku} · {b.name}</option>
              ))}
            </select>
            <span className="text-[12px] text-muted-foreground">{files.length} file{files.length === 1 ? "" : "s"} staged</span>
            <button onClick={() => setFiles([])} className="text-[12px] text-muted-foreground hover:text-foreground ml-auto">Clear</button>
          </div>

          {report && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <Panel
                  title={`Will import (${report.matched.length})`}
                  tone="good"
                  rows={report.matched.map((m) => ({
                    key: m.fileName,
                    left: m.color!.color_name,
                    right: `${m.surface}${m.replaces ? " · replaces existing" : ""}`,
                    warn: m.replaces,
                  }))}
                />
                <Panel
                  title={`No matching colourway (${report.unmatched.length})`}
                  tone="warn"
                  rows={report.unmatched.map((m) => ({ key: m.fileName, left: m.fileName, right: m.colorSlug, warn: true }))}
                  empty="Every file found a home."
                />
                <Panel
                  title={`Still missing after this (${report.stillMissing.length})`}
                  tone="muted"
                  rows={report.stillMissing.map((s, i) => ({ key: `${s.color_name}-${s.surface}-${i}`, left: s.color_name, right: s.surface }))}
                  empty="This blank will be fully covered."
                />
              </div>

              {replacing > 0 && (
                <p className="text-[12px] text-amber-600 inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {replacing} photo{replacing === 1 ? "" : "s"} already on file will be replaced.
                </p>
              )}

              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-muted-foreground">
                  {progress ? `Uploading ${progress.done} of ${progress.total}…` : ""}
                </span>
                <button
                  onClick={run}
                  disabled={busy || !blank || report.matched.length === 0}
                  className="h-9 px-4 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Import {report.matched.length}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="ax-section-header">Coverage</h2>
        {coverage === null ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="ax-card divide-y divide-[hsl(var(--ax-border))]">
            {coverage.map((b) => {
              const pct = coveragePercent(b);
              const open = expanded === b.id;
              return (
                <div key={b.id}>
                  {/* The whole row is the control — name, bar and percentage
                      all open the same editor, because any of them is what
                      someone reaches for. */}
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : b.id)}
                    aria-expanded={open}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[hsl(var(--ax-line)/0.5)] transition-colors"
                  >
                    <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open ? "rotate-0" : "-rotate-90")} />
                    <span className="w-24 shrink-0 text-[12px] font-mono text-muted-foreground">{b.sku ?? "—"}</span>
                    <span className="flex-1 min-w-0 text-[13px] font-semibold truncate">{b.name}</span>
                    <span className="w-40 shrink-0 text-[11px] text-muted-foreground tabular-nums text-right hidden sm:block">
                      {b.haveFront}/{b.colorways} front · {b.haveBack}/{b.colorways} back
                    </span>
                    <span className="w-28 shrink-0 hidden sm:block">
                      <span className="block h-1.5 rounded-full bg-[hsl(var(--ax-line))] overflow-hidden">
                        <span
                          className={cn("block h-full", pct === 100 ? "bg-[hsl(var(--ax-accent))]" : "bg-amber-500")}
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </span>
                    <span className="w-10 shrink-0 text-[11px] tabular-nums text-right">
                      {pct === 100 ? <Check className="h-3.5 w-3.5 inline text-[hsl(var(--ax-accent))]" /> : `${pct}%`}
                    </span>
                  </button>
                  {open && (
                    <BlankColorPhotoGrid blankId={b.id} sku={b.sku} styleNumber={b.style_number} onChanged={refresh} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Panel({ title, tone, rows, empty }: {
  title: string;
  tone: "good" | "warn" | "muted";
  rows: { key: string; left: string; right: string; warn?: boolean }[];
  empty?: string;
}) {
  return (
    <div className="rounded-lg border border-[hsl(var(--ax-border))] p-3">
      <div className={cn(
        "text-[10px] font-semibold uppercase tracking-wider mb-1.5",
        tone === "good" ? "text-[hsl(var(--ax-accent))]" : tone === "warn" ? "text-amber-600" : "text-[hsl(var(--ax-faint))]",
      )}>
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{empty ?? "Nothing."}</p>
      ) : (
        <ul className="space-y-0.5 max-h-52 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate">{r.left}</span>
              <span className={cn("shrink-0 text-[11px]", r.warn ? "text-amber-600" : "text-muted-foreground")}>{r.right}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
