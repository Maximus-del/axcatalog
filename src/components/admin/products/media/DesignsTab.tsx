// Mobile-first. Test at 375px before merging.
//
// Designs tab: linked designs, with a picker (link existing) and a
// direct upload flow (creates a new design + design_files row, links
// to this product). Each tile shows a thumbnail (signed URL from the
// design's primary file), title, placement, and per-tile actions.
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Layers, Link2, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { PLACEMENT_OPTIONS, formatPlacement, type DesignPlacement } from "./placements";

interface LinkRow {
  id: string; // product_designs.id
  design_id: string;
  placement: DesignPlacement;
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

export function DesignsTab({ productId, organizationId, productTitle, onCountChange }: Props) {
  const [rows, setRows] = useState<LinkRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [unlinkConfirm, setUnlinkConfirm] = useState<LinkRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("product_designs")
      .select(
        `id, design_id, placement,
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

  async function changePlacement(row: LinkRow, next: DesignPlacement) {
    setRows((rs) =>
      rs ? rs.map((r) => (r.id === row.id ? { ...r, placement: next } : r)) : rs,
    );
    const { error } = await supabase
      .from("product_designs")
      .update({ placement: next })
      .eq("id", row.id);
    if (error) {
      toast.error("Failed to update placement");
      load();
    } else {
      toast.success("Placement updated");
    }
  }

  async function unlink(row: LinkRow) {
    setUnlinkConfirm(null);
    const { error } = await supabase.from("product_designs").delete().eq("id", row.id);
    if (error) {
      toast.error("Failed to unlink design");
      return;
    }
    toast.success("Design unlinked");
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

        // 1) Create design record
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

        // 2) Upload file to design-files bucket
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
        const path = `${design.id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(DESIGN_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          failed++;
          console.error("Upload failed:", upErr);
          // Roll back the design row to avoid orphans
          await supabase.from("designs").delete().eq("id", design.id);
          continue;
        }

        // 3) Insert design_files row
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

        // 4) Link design to product
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Designs linked to this product. Stored privately in the{" "}
          <code className="text-xs">design-files</code> bucket.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPickerOpen(true)}
            className="gap-2 h-10"
          >
            <Link2 className="h-4 w-4" /> Link existing
          </Button>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
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
          <p className="text-xs text-muted-foreground">
            Link an existing design or upload a new one to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {(rows ?? []).map((r, i) => (
            <div
              key={r.id}
              className="ax-card p-2 space-y-2 stagger-fade"
              style={{ ["--i" as string]: i }}
            >
              <div className="relative aspect-square rounded-md overflow-hidden bg-muted">
                {r.thumb_url ? (
                  <img
                    src={r.thumb_url}
                    alt={r.design.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                    No preview
                  </div>
                )}
                <span className="absolute top-1.5 left-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-dark/80 text-white border border-white/10 capitalize">
                  {formatPlacement(r.placement)}
                </span>
              </div>

              <div className="text-xs font-medium truncate" title={r.design.title}>
                {r.design.title}
              </div>

              <div className="flex items-center justify-between gap-1">
                <Select
                  value={r.placement}
                  onValueChange={(v) => changePlacement(r, v as DesignPlacement)}
                >
                  <SelectTrigger className="h-7 text-xs px-2 max-w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLACEMENT_OPTIONS.map((p) => (
                      <SelectItem key={p.value} value={p.value} className="text-xs">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                      ⋯
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => downloadFile(r)} disabled={!r.primary_file}>
                      <Download className="h-4 w-4 mr-2" /> Download file
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onSelect={() => setUnlinkConfirm(r)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Unlink from product
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      <DesignPickerDialog
        open={pickerOpen}
        productId={productId}
        excludedDesignIds={linkedIds}
        onOpenChange={setPickerOpen}
        onLinked={load}
      />

      <AlertDialog open={!!unlinkConfirm} onOpenChange={(o) => !o && setUnlinkConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink "{unlinkConfirm?.design.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the link between this product and the design. The design itself
              and its files are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => unlinkConfirm && unlink(unlinkConfirm)}>
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
