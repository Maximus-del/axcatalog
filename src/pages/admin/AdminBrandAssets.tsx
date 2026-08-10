import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, FileText, Folder as FolderIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSignedUrl, formatBytes } from "@/lib/storage";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Folder {
  id: string;
  name: string;
  sort_order: number;
}
interface Asset {
  id: string;
  folder_id: string | null;
  storage_bucket: string;
  storage_path: string;
  thumbnail_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  title: string | null;
  asset_type: string | null;
  version_number: number | null;
  is_primary: boolean;
}

function isImage(fileType: string | null) {
  return !!fileType && fileType.toLowerCase().startsWith("image");
}

function AssetThumb({ asset }: { asset: Asset }) {
  const path = asset.thumbnail_path ?? asset.storage_path;
  const { url } = useSignedUrl(isImage(asset.file_type) ? asset.storage_bucket : null, isImage(asset.file_type) ? path : null);
  if (isImage(asset.file_type) && url) {
    return (
      <img
        src={url}
        alt={asset.title ?? asset.file_name ?? "Brand asset"}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
      <FileText className="h-8 w-8" />
    </div>
  );
}

export default function AdminBrandAssets() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [folderRes, assetRes] = await Promise.all([
        supabase.from("asset_folders").select("id, name, sort_order").order("sort_order"),
        supabase
          .from("brand_assets")
          .select(
            "id, folder_id, storage_bucket, storage_path, thumbnail_path, file_name, file_type, file_size, title, asset_type, version_number, is_primary",
          )
          .order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      setFolders((folderRes.data ?? []) as Folder[]);
      setAssets((assetRes.data ?? []) as Asset[]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!assets) return [];
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (activeFolder !== "all" && a.folder_id !== activeFolder) return false;
      if (!q) return true;
      return (
        (a.title ?? "").toLowerCase().includes(q) ||
        (a.file_name ?? "").toLowerCase().includes(q) ||
        (a.asset_type ?? "").toLowerCase().includes(q)
      );
    });
  }, [assets, activeFolder, search]);

  const isEmpty = !loading && assets && assets.length === 0;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <header>
        <div className="ax-section-header mb-2">Creative</div>
        <h1 className="text-3xl font-bold">Brand Assets</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Logos, fonts, color schemes, and brand files — organized by folder.
        </p>
      </header>

      {isEmpty ? (
        <div className="ax-card p-12 text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-[12px] bg-[hsl(var(--ax-accent)/0.12)] text-[hsl(var(--ax-accent))] flex items-center justify-center">
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium">No brand assets yet</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            This is where logos, wordmarks, fonts, and brand guidelines live. Once assets are added to the
            brand library, they'll appear here grouped by folder.
          </p>
        </div>
      ) : (
        <>
          {(folders.length > 0 || !loading) && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search assets…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          )}

          {folders.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => setActiveFolder("all")}
                className={cn(
                  "px-3 h-8 rounded-[10px] text-sm font-medium transition-colors",
                  activeFolder === "all"
                    ? "bg-[hsl(var(--ax-accent))] text-white"
                    : "text-muted-foreground hover:bg-[hsl(var(--muted))]",
                )}
              >
                All
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFolder(f.id)}
                  className={cn(
                    "px-3 h-8 rounded-[10px] text-sm font-medium transition-colors inline-flex items-center gap-1.5",
                    activeFolder === f.id
                      ? "bg-[hsl(var(--ax-accent))] text-white"
                      : "text-muted-foreground hover:bg-[hsl(var(--muted))]",
                  )}
                >
                  <FolderIcon className="h-3.5 w-3.5" />
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square w-full rounded-[12px]" />
              ))}
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filtered.map((a) => (
                <div key={a.id} className="rounded-[12px] overflow-hidden border border-border">
                  <div className="aspect-square w-full bg-[hsl(var(--muted))]">
                    <AssetThumb asset={a} />
                  </div>
                  <div className="p-2.5">
                    <div className="text-sm font-medium truncate">
                      {a.title ?? a.file_name ?? "Untitled"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[a.asset_type, a.version_number ? `v${a.version_number}` : null, formatBytes(a.file_size)]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && assets && assets.length > 0 && filtered.length === 0 && (
            <div className="ax-card p-8 text-center text-sm text-muted-foreground">
              No assets match your search.
            </div>
          )}
        </>
      )}
    </div>
  );
}
