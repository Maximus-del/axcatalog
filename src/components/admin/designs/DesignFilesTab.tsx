import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileIcon, Loader2, Star, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { formatBytes, getSignedUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

export type DesignFileType = "mockup" | "source" | "export" | "backup" | "reference";

const FILE_TYPE_LABELS: Record<DesignFileType, string> = {
  mockup: "Mockups",
  source: "Sources",
  export: "Exports",
  backup: "Backups",
  reference: "References",
};

const FILE_TYPE_ORDER: DesignFileType[] = ["mockup", "source", "export", "backup", "reference"];

interface DesignFileRow {
  id: string;
  file_type: DesignFileType;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  file_extension: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  is_primary: boolean;
  sort_order: number;
}

interface Props {
  designId: string;
  onPrimaryChanged?: () => void;
}

const IMAGE_MIME = /^image\//;

export function DesignFilesTab({ designId, onPrimaryChanged }: Props) {
  const [files, setFiles] = useState<DesignFileRow[] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<DesignFileType, boolean>>({
    mockup: false,
    source: false,
    export: false,
    backup: false,
    reference: false,
  });
  const inputs = useRef<Record<DesignFileType, HTMLInputElement | null>>({
    mockup: null,
    source: null,
    export: null,
    backup: null,
    reference: null,
  });

  async function load() {
    const { data, error } = await supabase
      .from("design_files")
      .select(
        "id, file_type, storage_bucket, storage_path, file_name, file_extension, file_size_bytes, mime_type, is_primary, sort_order, created_at",
      )
      .eq("design_id", designId)
      .order("sort_order");
    if (error) {
      console.error(error);
      setFiles([]);
      return;
    }
    const rows = (data ?? []) as unknown as DesignFileRow[];
    setFiles(rows);
    // Generate signed URLs for image previews
    const previewMap: Record<string, string> = {};
    await Promise.all(
      rows.map(async (f) => {
        if (f.mime_type && IMAGE_MIME.test(f.mime_type)) {
          const url = await getSignedUrl(f.storage_bucket, f.storage_path, 3600);
          if (url) previewMap[f.id] = url;
        }
      }),
    );
    setPreviews(previewMap);
  }

  useEffect(() => {
    void load();
  }, [designId]);

  function bucketFor(type: DesignFileType): string {
    return type === "mockup" ? "mockups" : "design-files";
  }

  async function handleUpload(type: DesignFileType, fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setUploading((u) => ({ ...u, [type]: true }));
    const bucket = bucketFor(type);
    const existing = files ?? [];
    const hasPrimaryMockup = existing.some((f) => f.file_type === "mockup" && f.is_primary);

    let firstUploadedMockupId: string | null = null;

    for (const file of Array.from(fileList)) {
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? null;
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${designId}/${type}/${Date.now()}-${safeName}`;
        const upRes = await supabase.storage.from(bucket).upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (upRes.error) throw upRes.error;

        const isFirstMockup = type === "mockup" && !hasPrimaryMockup && !firstUploadedMockupId;
        const insertRes = await supabase
          .from("design_files")
          .insert({
            design_id: designId,
            file_type: type,
            storage_bucket: bucket,
            storage_path: path,
            file_name: file.name,
            file_extension: ext,
            file_size_bytes: file.size,
            mime_type: file.type || null,
            is_primary: isFirstMockup,
            sort_order: existing.filter((f) => f.file_type === type).length,
          })
          .select("id")
          .single();
        if (insertRes.error) throw insertRes.error;
        if (isFirstMockup) firstUploadedMockupId = insertRes.data.id;
      } catch (err) {
        console.error("upload failed", err);
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    setUploading((u) => ({ ...u, [type]: false }));
    await load();
    if (firstUploadedMockupId) onPrimaryChanged?.();
    toast.success("Upload complete");
  }

  async function handleDelete(file: DesignFileRow) {
    if (!confirm(`Delete ${file.file_name}?`)) return;
    const stRes = await supabase.storage.from(file.storage_bucket).remove([file.storage_path]);
    if (stRes.error) console.warn("storage delete warning", stRes.error);
    const { error } = await supabase.from("design_files").delete().eq("id", file.id);
    if (error) {
      toast.error("Failed to delete");
      return;
    }
    toast.success("File deleted");
    await load();
    if (file.is_primary) onPrimaryChanged?.();
  }

  async function handleSetPrimary(file: DesignFileRow) {
    if (file.file_type !== "mockup") return;
    // Unset all current primary mockups for this design
    await supabase
      .from("design_files")
      .update({ is_primary: false })
      .eq("design_id", designId)
      .eq("file_type", "mockup");
    const { error } = await supabase
      .from("design_files")
      .update({ is_primary: true })
      .eq("id", file.id);
    if (error) {
      toast.error("Failed to set primary");
      return;
    }
    toast.success("Set as primary");
    await load();
    onPrimaryChanged?.();
  }

  async function handleDownload(file: DesignFileRow) {
    const url = await getSignedUrl(file.storage_bucket, file.storage_path, 3600);
    if (!url) {
      toast.error("Download failed");
      return;
    }
    window.open(url, "_blank");
  }

  if (!files) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {FILE_TYPE_ORDER.map((type) => {
        const items = files.filter((f) => f.file_type === type);
        return (
          <section key={type} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {FILE_TYPE_LABELS[type]}
                </h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {items.length}
                </span>
              </div>
              <div>
                <input
                  ref={(el) => {
                    inputs.current[type] = el;
                  }}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleUpload(type, e.target.files);
                    if (inputs.current[type]) inputs.current[type]!.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={uploading[type]}
                  onClick={() => inputs.current[type]?.click()}
                >
                  {uploading[type] ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  Upload
                </Button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="ax-card p-6 text-center text-sm text-muted-foreground">
                No {type} files yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((f) => (
                  <FileCard
                    key={f.id}
                    file={f}
                    previewUrl={previews[f.id]}
                    onSetPrimary={() => handleSetPrimary(f)}
                    onDelete={() => handleDelete(f)}
                    onDownload={() => handleDownload(f)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FileCard({
  file,
  previewUrl,
  onSetPrimary,
  onDelete,
  onDownload,
}: {
  file: DesignFileRow;
  previewUrl?: string;
  onSetPrimary: () => void;
  onDelete: () => void;
  onDownload: () => void;
}) {
  const isImage = file.mime_type && IMAGE_MIME.test(file.mime_type);
  return (
    <div
      className={cn(
        "ax-card p-0 overflow-hidden flex flex-col",
        file.is_primary && "border-accent",
      )}
    >
      <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden relative">
        {isImage && previewUrl ? (
          <img src={previewUrl} alt={file.file_name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <FileIcon className="h-8 w-8" />
            {file.file_extension && (
              <span className="text-xs uppercase tracking-wider font-semibold">
                {file.file_extension}
              </span>
            )}
          </div>
        )}
        {file.is_primary && (
          <div className="absolute top-2 left-2 ax-badge-success flex items-center gap-1">
            <Star className="h-3 w-3 fill-current" /> Primary
          </div>
        )}
      </div>
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <div className="text-sm font-medium truncate" title={file.file_name}>
          {file.file_name}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatBytes(file.file_size_bytes)}
        </div>
        <div className="flex items-center gap-1 mt-auto pt-2 border-t border-border">
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onDownload}>
            <Download className="h-3 w-3" />
          </Button>
          {file.file_type === "mockup" && !file.is_primary && (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onSetPrimary} title="Set as primary">
              <Star className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 ml-auto text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
