import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import type { PortalProduct } from "@/hooks/usePortalProducts";

interface Asset {
  id: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  uploaded_by: string | null;
  url: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: PortalProduct | null;
  athleteId: string;
  organizationId: string;
}

export function ProductGalleryDialog({
  open,
  onOpenChange,
  product,
  athleteId,
  organizationId,
}: Props) {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!product) return;
    setLoading(true);
    const { data } = await supabase
      .from("product_social_assets")
      .select("id, storage_bucket, storage_path, file_name, mime_type, uploaded_by")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false });
    const mapped = (data ?? []).map((a) => ({
      ...a,
      url: supabase.storage.from(a.storage_bucket).getPublicUrl(a.storage_path).data.publicUrl,
    })) as Asset[];
    setAssets(mapped);
    setLoading(false);
  }, [product]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !product || !user) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "bin";
        const path = `${organizationId}/${product.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("product-social-assets")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("product_social_assets").insert({
          organization_id: organizationId,
          product_id: product.id,
          athlete_id: athleteId,
          uploaded_by: user.id,
          storage_bucket: "product-social-assets",
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          file_size_bytes: file.size,
        });
        if (insErr) throw insErr;
      }
      toast.success("Uploaded");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (a: Asset) => {
    if (!confirm("Delete this asset?")) return;
    try {
      await supabase.storage.from(a.storage_bucket).remove([a.storage_path]);
      const { error } = await supabase.from("product_social_assets").delete().eq("id", a.id);
      if (error) throw error;
      setAssets((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-accent uppercase tracking-[0.18em] text-sm">
            {product?.title ?? "Gallery"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
          <p className="text-xs text-muted-foreground">
            Upload social media content for this product.
          </p>
          <Button
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="bg-accent text-accent-foreground hover:bg-accent/90 uppercase tracking-wider font-bold"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Upload
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto pt-3">
          {loading ? (
            <div className="text-xs text-muted-foreground text-center py-8">Loading…</div>
          ) : assets.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-12">
              No content yet. Click Upload to add photos or videos.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {assets.map((a) => {
                const isVideo = a.mime_type?.startsWith("video/");
                const canDelete = a.uploaded_by === user?.id;
                return (
                  <div key={a.id} className="relative group rounded-md overflow-hidden bg-[hsl(var(--dark))] aspect-square">
                    {isVideo ? (
                      <video src={a.url} className="h-full w-full object-cover" controls />
                    ) : (
                      <img src={a.url} alt={a.file_name ?? ""} className="h-full w-full object-cover" loading="lazy" />
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => remove(a)}
                        className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}