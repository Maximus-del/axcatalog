// Mobile-first. Test at 375px before merging.
//
// Designs tab: shows linked designs in two sections — Primary Designs and
// Variations (grouped by their primary). Supports multi-select linking,
// editing a link (placement / variation toggle / variation_of / label),
// and unlinking with smart cascade for primaries that have variations.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Layers,
  Link2,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { getSignedUrl } from "@/lib/storage";
import { slugify } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { DesignPickerDialog } from "./DesignPickerDialog";
import { EditLinkDialog } from "./EditLinkDialog";
import { formatPlacement, type DesignPlacement } from "./placements";
import { useFileDropZone } from "@/hooks/useFileDropZone";

export interface LinkRow {
  id: string; // product_designs.id
  design_id: string;
  placement: DesignPlacement;
  is_variation: boolean;
  variation_of: string | null; // product_designs.id of the primary
  variation_label: string | null;
  design: {
    id: string;
    title: string;
    slug: string;
  };
  thumb_url: string | null;
  primary_file: {
    storage_bucket: string;
    storage_path: string;
    file_name: string;
  } | null;
}

interface Props {
  productId: string;
  organizationId: string;
  productTitle: string;
  onCountChange?: (n: number) => void;
}

const DESIGN_BUCKET = "design-files";

function placementShortCode(p: DesignPlacement): string | null {
  if (p === "front" || p === "chest" || p === "pocket") return "F";
  if (p === "back") return "B";
  if (p === "left_sleeve" || p === "right_sleeve" || p === "sleeve_wrap") return "S";
  if (p === "hood") return "H";
  return null;
}

function variationBadge(p: DesignPlacement): string {
  const code = placementShortCode(p);
  return code ? `${code}-Variation` : "Variation";
}

export function DesignsTab({ productId, organizationId, productTitle, onCountChange }: Props) {
  const [rows, setRows] = useState<LinkRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerVariation, setPickerVariation] = useState(false);
  const [editing, setEditing] = useState<LinkRow | null>(null);
  const [uploading, setUploading] = useState(false);
  const [unlinkConfirm, setUnlinkConfirm] = useState<LinkRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUploadFiles(files: File[]) {
    if (!files.length) return;
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    await handleUploadNew(dt.files);
  }

  const { isOver, dropProps } = useFileDropZone({
    onFiles: handleUploadFiles,
    disabled: uploading,
  });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_designs")
      .select(
        `id, design_id, placement, is_variation, variation_of, variation_label,
         design:designs!product_designs_design_id_fkey(id, title, slug,
           design_files(id, storage_bucket, storage_path, file_name, file_type, mime_type, is_primary, sort_order)
         )`,
      )
      .eq("product_id", productId)
      .order("sort_order");
    if (error) {
      console.error(error);
      setRows([]);
      setLoading(false);
      return;
    }

    const mapped: LinkRow[] = await Promise.all(
      (data ?? []).map(async (r) => {
        const d = Array.isArray(r.design) ? r.design[0] : r.design;
        const files = (d?.design_files ?? []) as Array<{
          id: string;
          storage_bucket: string;
          storage_path: string;
          file_name: string;
          file_type: string;
          mime_type: string | null;
          is_primary: boolean;
          sort_order: number;
        }>;
        const imageFiles = files.filter((f) => (f.mime_type ?? "").startsWith("image/"));
        const primary =
          imageFiles.find((f) => f.is_primary) ??
          imageFiles.find((f) => f.file_type === "mockup") ??
          imageFiles.find((f) => f.file_type === "export") ??
          imageFiles[0];
        const allFiles = files;
        const downloadCandidate =
          allFiles.find((f) => f.is_primary) ??
          allFiles.find((f) => f.file_type === "source") ??
          allFiles[0];
        const thumb_url = primary
          ? await getSignedUrl(primary.storage_bucket, primary.storage_path, 3600)
          : null;
        return {
          id: r.id,
          design_id: r.design_id,
          placement: r.placement as DesignPlacement,
          is_variation: !!r.is_variation,
          variation_of: r.variation_of ?? null,
          variation_label: r.variation_label ?? null,
          design: {
            id: d?.id ?? r.design_id,
            title: d?.title ?? "Untitled design",
            slug: d?.slug ?? "",
          },
          thumb_url,
          primary_file: downloadCandidate
            ? {
                storage_bucket: downloadCandidate.storage_bucket,
                storage_path: downloadCandidate.storage_path,
                file_name: downloadCandidate.file_name,
              }
            : null,
        };
      }),
    );

    setRows(mapped);
    onCountChange?.(mapped.length);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const linkedIds = useMemo(() => new Set((rows ?? []).map((r) => r.design_id)), [rows]);
  const primaries = useMemo(
    () => (rows ?? []).filter((r) => !r.is_variation),
    [rows],
  );
  const variations = useMemo(
    () => (rows ?? []).filter((r) => r.is_variation),
    [rows],
  );

  // Group variations: by their primary (when variation_of points to a primary on this product),
  // plus a separate "Unlinked variations" group for orphans.
  const variationGroups = useMemo(() => {
    const primaryIds = new Set(primaries.map((p) => p.id));
    const groups = new Map<string, LinkRow[]>();
    const unlinked: LinkRow[] = [];
    for (const v of variations) {
      if (v.variation_of && primaryIds.has(v.variation_of)) {
        const arr = groups.get(v.variation_of) ?? [];
        arr.push(v);
        groups.set(v.variation_of, arr);
      } else {
        unlinked.push(v);
      }
    }
    return { groups, unlinked };
  }, [variations, primaries]);

  async function unlink(row: LinkRow, includeVariations: boolean) {
    setUnlinkConfirm(null);
    const ids = [row.id];
    if (includeVariations && !row.is_variation) {
      const childIds = variations
        .filter((v) => v.variation_of === row.id)
        .map((v) => v.id);
      ids.push(...childIds);
    }
    const { error } = await supabase.from("product_designs").delete().in("id", ids);
    if (error) {
      toast.error("Failed to unlink design");
      return;
    }
    toast.success(
      ids.length > 1 ? `Unlinked ${ids.length} designs` : "Design unlinked",
    );
    load();
  }

  async function downloadFile(row: LinkRow) {
    if (!row.primary_file) {
      toast.error("No file available to download");
      return;
    }
    const url = await getSignedUrl(
      row.primary_file.storage_bucket,
      row.primary_file.storage_path,
      120,
    );
    if (!url) {
      toast.error("Could not generate download link");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = row.primary_file.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function handleUploadNew(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let createdOk = 0;
    let failed = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const baseName = file.name.replace(/\.[^.]+$/, "");
        const ext = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? null;
        const isImage = (file.type || "").startsWith("image/");

        const designTitle = `${productTitle} — ${baseName}`;
        const designSlug = `${slugify(designTitle)}-${Date.now()}`;
        const { data: design, error: dErr } = await supabase
          .from("designs")
          .insert({
            organization_id: organizationId,
            title: designTitle,
            slug: designSlug,
            status: "concept",
          })
          .select("id")
          .single();
        if (dErr || !design) {
          failed++;
          console.error("Failed to create design:", dErr);
          continue;
        }

        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${design.id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(DESIGN_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          failed++;
          console.error("Upload failed:", upErr);
          await supabase.from("designs").delete().eq("id", design.id);
          continue;
        }

        const { error: fErr } = await supabase.from("design_files").insert({
          design_id: design.id,
          storage_bucket: DESIGN_BUCKET,
          storage_path: path,
          file_name: file.name,
          file_extension: ext,
          file_size_bytes: file.size,
          mime_type: file.type || null,
          file_type: isImage ? "export" : "source",
          is_primary: true,
          sort_order: 0,
        });
        if (fErr) {
          failed++;
          await supabase.storage.from(DESIGN_BUCKET).remove([path]);
          await supabase.from("designs").delete().eq("id", design.id);
          continue;
        }

        const { error: lErr } = await supabase.from("product_designs").insert({
          product_id: productId,
          design_id: design.id,
          placement: "front",
        });
        if (lErr) {
          failed++;
          continue;
        }
        createdOk++;
      }
      if (createdOk > 0) toast.success(`Linked ${createdOk} new design${createdOk === 1 ? "" : "s"}`);
      if (failed > 0) toast.error(`${failed} upload${failed === 1 ? "" : "s"} failed`);
      await load();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openPicker(asVariation: boolean) {
    setPickerVariation(asVariation);
    setPickerOpen(true);
  }

  const primaryOptions = useMemo(
    () => primaries.map((p) => ({ id: p.id, design_title: p.design.title })),
    [primaries],
  );

  return (
    <div className="space-y-6 relative" {...dropProps}>
      {isOver && (
        <div className="absolute inset-0 z-20 rounded-lg border-2 border-dashed border-accent bg-accent/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Upload className="h-8 w-8" />
            <div className="text-sm font-medium">Drop to upload as new design</div>
            <div className="text-xs text-accent/80">Images, PDF, AI, PSD, SVG</div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Designs linked to this product. Stored privately in the{" "}
          <code className="text-xs">design-files</code> bucket.
        </p>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            variant="outline"
            className="gap-2 h-10"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Uploading…" : "Upload new"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept="image/*,application/pdf,.ai,.psd,.svg"
            onChange={(e) => handleUploadNew(e.target.files)}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : rows && rows.length === 0 ? (
        <div className="ax-card p-12 text-center space-y-3">
          <Layers className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No designs linked.</p>
          <Button onClick={() => openPicker(false)} className="gap-2 mt-2">
            <Link2 className="h-4 w-4" /> Link your first design
          </Button>
        </div>
      ) : (
        <>
          {/* Primary section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Primary Designs</h3>
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-muted text-[11px] font-medium tabular-nums">
                  {primaries.length}
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => openPicker(false)}
                className="gap-1.5 h-8"
              >
                <Plus className="h-3.5 w-3.5" /> Link Design
              </Button>
            </div>

            {primaries.length === 0 ? (
              <div className="ax-card p-6 text-center text-xs text-muted-foreground">
                No primary designs yet. Click <span className="font-medium">Link Design</span> to add some.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {primaries.map((r, i) => (
                  <DesignTile
                    key={r.id}
                    row={r}
                    index={i}
                    onEdit={() => setEditing(r)}
                    onUnlink={() => setUnlinkConfirm(r)}
                    onDownload={() => downloadFile(r)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Variations section — only shown if any exist */}
          {variations.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Variations</h3>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-muted text-[11px] font-medium tabular-nums">
                    {variations.length}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openPicker(true)}
                  className="gap-1.5 h-8"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Variation
                </Button>
              </div>

              <div className="space-y-4">
                {primaries.map((p) => {
                  const kids = variationGroups.groups.get(p.id) ?? [];
                  if (kids.length === 0) return null;
                  return (
                    <div key={p.id} className="space-y-2">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="h-px flex-1 bg-border" />
                        <span>
                          Variations of <span className="text-foreground font-medium">{p.design.title}</span>
                        </span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
                        {kids.map((v, i) => (
                          <DesignTile
                            key={v.id}
                            row={v}
                            index={i}
                            variation
                            onEdit={() => setEditing(v)}
                            onUnlink={() => setUnlinkConfirm(v)}
                            onDownload={() => downloadFile(v)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {variationGroups.unlinked.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      <span>Unlinked variations</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
                      {variationGroups.unlinked.map((v, i) => (
                        <DesignTile
                          key={v.id}
                          row={v}
                          index={i}
                          variation
                          onEdit={() => setEditing(v)}
                          onUnlink={() => setUnlinkConfirm(v)}
                          onDownload={() => downloadFile(v)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      <DesignPickerDialog
        open={pickerOpen}
        productId={productId}
        excludedDesignIds={linkedIds}
        primaryOptions={primaryOptions}
        defaultAsVariation={pickerVariation}
        onOpenChange={setPickerOpen}
        onLinked={load}
      />

      <EditLinkDialog
        open={!!editing}
        row={editing}
        primaryOptions={primaryOptions}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />

      <UnlinkConfirmDialog
        row={unlinkConfirm}
        childCount={
          unlinkConfirm && !unlinkConfirm.is_variation
            ? variations.filter((v) => v.variation_of === unlinkConfirm.id).length
            : 0
        }
        onCancel={() => setUnlinkConfirm(null)}
        onConfirm={(includeVariations) => unlinkConfirm && unlink(unlinkConfirm, includeVariations)}
      />
    </div>
  );
}

/* ----------------------------- Tile component ----------------------------- */

function DesignTile({
  row,
  index,
  variation = false,
  onEdit,
  onUnlink,
  onDownload,
}: {
  row: LinkRow;
  index: number;
  variation?: boolean;
  onEdit: () => void;
  onUnlink: () => void;
  onDownload: () => void;
}) {
  const label = variation
    ? row.variation_label?.trim() || row.design.title
    : row.design.title;

  return (
    <div
      className={cn(
        "ax-card p-2 space-y-1.5 stagger-fade group relative",
        variation && "opacity-80 hover:opacity-100 transition-opacity",
      )}
      style={{ ["--i" as string]: index }}
    >
      <div className="relative aspect-square rounded-md overflow-hidden bg-muted">
        {row.thumb_url ? (
          <img
            src={row.thumb_url}
            alt={label}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground">
            No preview
          </div>
        )}
        <span
          className={cn(
            "absolute top-1.5 left-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] border capitalize",
            variation
              ? "bg-accent/80 text-white border-accent/40"
              : "bg-dark/80 text-white border-white/10",
          )}
        >
          {variation ? variationBadge(row.placement) : formatPlacement(row.placement)}
        </span>

        {/* Hover actions (desktop) */}
        <div className="absolute bottom-1.5 right-1.5 hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onEdit}
            aria-label="Edit link"
            className="h-6 w-6 rounded-md bg-background/90 border border-border flex items-center justify-center hover:bg-background"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={onUnlink}
            aria-label="Unlink"
            className="h-6 w-6 rounded-md bg-background/90 border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* Mobile menu */}
        <div className="absolute bottom-1.5 right-1.5 sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More"
                className="h-6 w-6 rounded-md bg-background/90 border border-border flex items-center justify-center"
              >
                <MoreVertical className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil className="h-4 w-4 mr-2" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDownload} disabled={!row.primary_file}>
                <Download className="h-4 w-4 mr-2" /> Download file
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={onUnlink}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Unlink
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        className={cn("font-medium truncate", variation ? "text-[11px]" : "text-xs")}
        title={label}
      >
        {label}
      </div>
      {variation && row.variation_label && row.variation_label !== row.design.title && (
        <div className="text-[10px] text-muted-foreground truncate" title={row.design.title}>
          {row.design.title}
        </div>
      )}
    </div>
  );
}

/* ------------------------- Smart unlink confirmation ------------------------- */

function UnlinkConfirmDialog({
  row,
  childCount,
  onCancel,
  onConfirm,
}: {
  row: LinkRow | null;
  childCount: number;
  onCancel: () => void;
  onConfirm: (includeVariations: boolean) => void;
}) {
  const open = !!row;
  const hasChildren = childCount > 0;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unlink "{row?.design.title}"?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasChildren ? (
              <>
                This primary has <span className="font-medium">{childCount}</span>{" "}
                variation{childCount === 1 ? "" : "s"} linked to it. The design file
                remains in your library either way.
              </>
            ) : (
              <>Unlink this design from the product? The design file remains in your library.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className={hasChildren ? "sm:justify-between" : undefined}>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {hasChildren ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onConfirm(false)}>
                Just primary
              </Button>
              <AlertDialogAction onClick={() => onConfirm(true)}>
                Primary + variations
              </AlertDialogAction>
            </div>
          ) : (
            <AlertDialogAction onClick={() => onConfirm(false)}>Unlink</AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}