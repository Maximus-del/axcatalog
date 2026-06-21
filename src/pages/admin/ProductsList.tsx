// Mobile-first. Test at 375px before merging.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Download, Filter, Loader2, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, Tag, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ProductFormDrawer } from "@/components/admin/products/ProductFormDrawer";
import { ImportFromUrlDialog } from "@/components/admin/products/ImportFromUrlDialog";
import { ProductDetailDrawer } from "@/components/admin/products/ProductDetailDrawer";
import { ProductCard } from "@/components/admin/products/ProductCard";
import { BulkTagBar } from "@/components/admin/products/BulkTagBar";
import { ProductTagPopover } from "@/components/admin/products/ProductTagPopover";
import { EditTitleDialog } from "@/components/admin/products/EditTitleDialog";
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
import { useAuth } from "@/auth/AuthProvider";
import {
  ProductFilterSidebar,
  type FilterState,
} from "@/components/admin/products/ProductFilterSidebar";
import {
  detectCategory,
  PRICE_BUCKETS,
  type ProductCategory,
  type PriceBucketId,
} from "@/lib/product-category";
import type { ProductStatus } from "@/lib/product-status";
import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { haptic } from "@/lib/haptics";
import { useMarqueeSelection } from "@/hooks/useMarqueeSelection";
import { runMooneySweep } from "@/lib/mooney-sweep";
import { fetchShopifyPrimaryImage, refreshShopifyImages, summarizeRefresh } from "@/lib/shopify-refresh-images";
import { refreshShopifyVariants, summarizeVariantRefresh } from "@/lib/shopify-refresh-variants";

interface ProductRow {
  id: string;
  title: string;
  status: ProductStatus;
  price: number | null;
  compare_at_price: number | null;
  created_at: string;
  updated_at: string;
  primary_image_url: string | null;
  has_image_warning: boolean;
  category: ProductCategory;
  is_hidden_from_dashboard: boolean;
  athletes: Array<{ id: string; name: string }>;
  teams: Array<{ id: string; name: string }>;
}

type SortKey = "newest" | "oldest" | "price_asc" | "price_desc" | "title_asc";
type ViewTab = "live" | "drafts" | "hidden" | "archived" | "all";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "title_asc", label: "Title A–Z" },
];

const TABS: Array<{ id: ViewTab; label: string }> = [
  { id: "live", label: "Live" },
  { id: "hidden", label: "Hidden" },
  { id: "archived", label: "Archived" },
  { id: "drafts", label: "Drafts" },
  { id: "all", label: "All" },
];

function emptyFilters(): FilterState {
  return {
    categories: new Set(),
    athletes: new Set(),
    teams: new Set(),
    statuses: new Set(),
    priceBuckets: new Set(),
  };
}

function bucketIdFor(price: number | null): PriceBucketId | null {
  if (price == null) return null;
  return PRICE_BUCKETS.find((b) => b.test(price))?.id ?? null;
}

/**
 * Tab matcher. When `showHidden` is true, hidden rows are *also* visible
 * inside the Live / Drafts / Archived / All tabs (they appear faded). The
 * Hidden tab itself ignores the toggle.
 */
function matchesTab(r: ProductRow, tab: ViewTab, showHidden: boolean): boolean {
  switch (tab) {
    case "live":
      return r.status === "published" && (showHidden || !r.is_hidden_from_dashboard);
    case "drafts":
      return r.status === "draft" && (showHidden || !r.is_hidden_from_dashboard);
    case "hidden":
      return r.is_hidden_from_dashboard === true;
    case "archived":
      return r.status === "archived" && (showHidden || !r.is_hidden_from_dashboard);
    case "all":
    default:
      return showHidden || !r.is_hidden_from_dashboard;
  }
}

export default function ProductsList() {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<ProductRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [tab, setTab] = useState<ViewTab>("live");
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagPopover, setTagPopover] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [editTitleFor, setEditTitleFor] = useState<{ id: string; title: string } | null>(null);
  const [archiveFor, setArchiveFor] = useState<{ id: string; title: string } | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [allAthletes, setAllAthletes] = useState<Array<{ id: string; slug: string; name: string }>>([]);
  const [allTeams, setAllTeams] = useState<Array<{ id: string; slug: string; name: string }>>([]);
  const [sweepBusy, setSweepBusy] = useState(false);
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const detailId = params.id ?? null;
  const detailOpen = !!detailId && !bulkMode;
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Marquee (drag-rectangle) selection. Enters bulk mode on first drag.
  const marquee = useMarqueeSelection({
    selected,
    onChange: setSelected,
    onActivate: () => {
      if (!bulkMode) setBulkMode(true);
      haptic.tap();
    },
  });

  // Pull-to-refresh on touch devices
  const { pullPx, refreshing } = usePullToRefresh({
    onRefresh: async () => {
      haptic.tap();
      await load();
    },
  });

  function openDetail(id: string) {
    navigate(`/admin/products/${id}`);
  }
  function closeDetail(open: boolean) {
    if (!open) navigate("/admin/products");
  }

  async function load() {
    setLoading(true);
    try {
      const productsRes = await supabase
        .from("products")
        .select(
          "id, title, status, price, compare_at_price, created_at, updated_at, is_hidden_from_dashboard",
        )
        .order("updated_at", { ascending: false });

      if (productsRes.error) console.error("products query error:", productsRes.error);
      const products = productsRes.data ?? [];

      const ids = products.map((p) => p.id);
      if (ids.length === 0) {
        setRows([]);
        return;
      }

      const [imagesRes, athletesLinkRes, teamsLinkRes, tagsLinkRes] = await Promise.all([
        supabase
          .from("product_images")
          .select("product_id, storage_path, is_primary, sort_order, metadata")
          .in("product_id", ids),
        supabase
          .from("product_athletes")
          .select(
            "product_id, athlete:athletes!product_athletes_athlete_id_fkey(id, first_name, last_name, full_name)",
          )
          .in("product_id", ids),
        supabase
          .from("product_teams")
          .select("product_id, team:teams!product_teams_team_id_fkey(id, name)")
          .in("product_id", ids),
        supabase
          .from("product_tags")
          .select("product_id, tag:tags!product_tags_tag_id_fkey(name)")
          .in("product_id", ids),
      ]);

      const images = imagesRes.data ?? [];
      const athleteLinks = athletesLinkRes.data ?? [];
      const teamLinks = teamsLinkRes.data ?? [];
      const tagLinks = tagsLinkRes.data ?? [];

      const imagesByProduct = new Map<string, typeof images>();
      images.forEach((img) => {
        const arr = imagesByProduct.get(img.product_id) ?? [];
        arr.push(img);
        imagesByProduct.set(img.product_id, arr);
      });
      const imageMap = new Map<string, string>();
      const warningSet = new Set<string>();
      imagesByProduct.forEach((imgs, productId) => {
        const primary = imgs.find((i) => i.is_primary);
        const fallback = [...imgs].sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
        )[0];
        const chosen = primary ?? fallback;
        if (chosen?.storage_path) imageMap.set(productId, chosen.storage_path);
        if (
          imgs.some(
            (i) =>
              (i as any).metadata?.shopify_orphaned === true ||
              (i as any).metadata?.last_refresh_failed === true,
          )
        ) {
          warningSet.add(productId);
        }
      });

      const athletesByProduct = new Map<string, Array<{ id: string; name: string }>>();
      athleteLinks.forEach((l) => {
        const a = Array.isArray(l.athlete) ? l.athlete[0] : l.athlete;
        if (!a) return;
        const name = a.full_name ?? `${a.first_name} ${a.last_name}`;
        const arr = athletesByProduct.get(l.product_id) ?? [];
        arr.push({ id: a.id, name });
        athletesByProduct.set(l.product_id, arr);
      });

      const teamsByProduct = new Map<string, Array<{ id: string; name: string }>>();
      teamLinks.forEach((l) => {
        const t = Array.isArray(l.team) ? l.team[0] : l.team;
        if (!t) return;
        const arr = teamsByProduct.get(l.product_id) ?? [];
        arr.push({ id: t.id, name: t.name });
        teamsByProduct.set(l.product_id, arr);
      });

      const tagsByProduct = new Map<string, string[]>();
      tagLinks.forEach((l) => {
        const t = Array.isArray(l.tag) ? l.tag[0] : l.tag;
        if (!t?.name) return;
        const arr = tagsByProduct.get(l.product_id) ?? [];
        arr.push(t.name);
        tagsByProduct.set(l.product_id, arr);
      });

      setRows(
        products.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status as ProductStatus,
          price: p.price,
          compare_at_price: p.compare_at_price,
          created_at: p.created_at,
          updated_at: p.updated_at,
          is_hidden_from_dashboard: (p as any).is_hidden_from_dashboard ?? false,
          primary_image_url: imageMap.get(p.id) ?? null,
          has_image_warning: warningSet.has(p.id),
          category: detectCategory(p.title, tagsByProduct.get(p.id) ?? []),
          athletes: athletesByProduct.get(p.id) ?? [],
          teams: teamsByProduct.get(p.id) ?? [],
        })),
      );
    } catch (err) {
      console.error("ProductsList load failed:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Athlete + team option lists (with slugs) for the bulk tag bar quick-pick.
  useEffect(() => {
    void (async () => {
      const [aRes, tRes] = await Promise.all([
        supabase.from("athletes").select("id, slug, first_name, last_name, full_name").order("last_name"),
        supabase.from("teams").select("id, slug, name").order("name"),
      ]);
      setAllAthletes(
        (aRes.data ?? []).map((a) => ({
          id: a.id,
          slug: a.slug,
          name: a.full_name ?? `${a.first_name} ${a.last_name}`,
        })),
      );
      setAllTeams((tRes.data ?? []) as Array<{ id: string; slug: string; name: string }>);
    })();
  }, []);

  async function handleMooneySweep() {
    if (sweepBusy) return;
    setSweepBusy(true);
    try {
      const res = await runMooneySweep();
      const msg = `Linked Mooney → ${res.productsLinked}/${res.productsScanned} products, ${res.designsLinked}/${res.designsScanned} designs`;
      if (res.errors.length) toast.error(`${msg} (errors: ${res.errors.join("; ")})`);
      else toast.success(msg);
      await load();
    } catch (e: any) {
      toast.error(`Sweep failed: ${e?.message ?? e}`);
    } finally {
      setSweepBusy(false);
    }
  }

  const [refreshBusy, setRefreshBusy] = useState(false);
  async function handleRefreshAllImages() {
    if (refreshBusy) return;
    setRefreshBusy(true);
    const t = toast.loading("Refreshing Shopify images…");
    try {
      const res = await refreshShopifyImages();
      toast.success(summarizeRefresh(res), { id: t });
      await load();
    } catch (e: any) {
      toast.error(`Refresh failed: ${e?.message ?? e}`, { id: t });
    } finally {
      setRefreshBusy(false);
    }
  }

  const [variantsBusy, setVariantsBusy] = useState(false);
  async function handleRefreshAllVariants() {
    if (variantsBusy) return;
    setVariantsBusy(true);
    const t = toast.loading("Refreshing Shopify variants…");
    try {
      const res = await refreshShopifyVariants();
      if (res.errors.length) {
        toast.warning(`Partial sync — ${summarizeVariantRefresh(res)}`, { id: t });
        console.warn("Variant sync errors:", res.errors);
      } else {
        toast.success(summarizeVariantRefresh(res), { id: t });
      }
    } catch (e: any) {
      toast.error("Variant refresh failed. Please try again.", { id: t });
      console.error("Variant refresh failed:", e);
    } finally {
      setVariantsBusy(false);
    }
  }

  const [fetchImageBusyId, setFetchImageBusyId] = useState<string | null>(null);
  async function handleFetchImage(productId: string) {
    if (fetchImageBusyId) return;
    setFetchImageBusyId(productId);
    const t = toast.loading("Fetching primary image from Shopify…");
    try {
      const res = await fetchShopifyPrimaryImage({ product_id: productId });
      if (res.ok && res.url) {
        toast.success("Image updated", { id: t });
        // Optimistically update the row's image + clear the warning pill.
        setRows((rs) =>
          rs
            ? rs.map((r) =>
                r.id === productId
                  ? { ...r, primary_image_url: res.url!, has_image_warning: false }
                  : r,
              )
            : rs,
        );
      } else if (res.no_image && res.shopify_admin_url) {
        toast.error("No image found in Shopify — re-upload there first", {
          id: t,
          action: {
            label: "Open Shopify",
            onClick: () => window.open(res.shopify_admin_url!, "_blank", "noopener,noreferrer"),
          },
        });
      } else {
        toast.error(res.message ?? "Fetch failed", { id: t });
      }
    } catch (e: any) {
      const url = e?.shopifyAdminUrl;
      toast.error(`Fetch failed: ${e?.message ?? e}`, {
        id: t,
        action: url
          ? { label: "Open Shopify", onClick: () => window.open(url, "_blank", "noopener,noreferrer") }
          : undefined,
      });
    } finally {
      setFetchImageBusyId(null);
    }
  }

  // Keep ?search= in the URL in sync with the search box. We use replace
  // so each keystroke doesn't pollute browser history — only the final
  // value is what back/forward restores.
  useEffect(() => {
    const current = searchParams.get("search") ?? "";
    if (current === search) return;
    const next = new URLSearchParams(searchParams);
    if (search) next.set("search", search);
    else next.delete("search");
    setSearchParams(next, { replace: true });
  }, [search, searchParams, setSearchParams]);

  // Tab counts are canonical (showHidden=false) so the labels are stable.
  // The Hidden tab counts hidden; all other tabs exclude hidden.
  const tabCounts = useMemo(() => {
    const c: Record<ViewTab, number> = { live: 0, drafts: 0, hidden: 0, archived: 0, all: 0 };
    (rows ?? []).forEach((r) => {
      c.all += 1;
      if (matchesTab(r, "live", false)) c.live += 1;
      if (matchesTab(r, "drafts", false)) c.drafts += 1;
      if (matchesTab(r, "hidden", false)) c.hidden += 1;
      if (matchesTab(r, "archived", false)) c.archived += 1;
    });
    return c;
  }, [rows]);

  // Filter sidebar counts derive from the active tab's slice (with current showHidden).
  const tabRows = useMemo(
    () => (rows ?? []).filter((r) => matchesTab(r, tab, showHidden)),
    [rows, tab, showHidden],
  );

  const { categoryCounts, athleteOptions, teamOptions, statusCounts, priceBucketCounts } =
    useMemo(() => {
      const cat = new Map<string, number>();
      const ath = new Map<string, { name: string; count: number }>();
      const team = new Map<string, { name: string; count: number }>();
      const stat = new Map<ProductStatus, number>();
      const price = new Map<PriceBucketId, number>();
      tabRows.forEach((r) => {
        cat.set(r.category, (cat.get(r.category) ?? 0) + 1);
        stat.set(r.status, (stat.get(r.status) ?? 0) + 1);
        const b = bucketIdFor(r.price);
        if (b) price.set(b, (price.get(b) ?? 0) + 1);
        r.athletes.forEach((a) => {
          const cur = ath.get(a.id) ?? { name: a.name, count: 0 };
          ath.set(a.id, { name: a.name, count: cur.count + 1 });
        });
        r.teams.forEach((t) => {
          const cur = team.get(t.id) ?? { name: t.name, count: 0 };
          team.set(t.id, { name: t.name, count: cur.count + 1 });
        });
      });
      return {
        categoryCounts: cat,
        statusCounts: stat,
        priceBucketCounts: price,
        athleteOptions: Array.from(ath.entries())
          .map(([id, v]) => ({ id, name: v.name, count: v.count }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        teamOptions: Array.from(team.entries())
          .map(([id, v]) => ({ id, name: v.name, count: v.count }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    }, [tabRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = tabRows.filter((r) => {
      if (filters.categories.size > 0 && !filters.categories.has(r.category)) return false;
      if (filters.statuses.size > 0 && !filters.statuses.has(r.status)) return false;
      if (filters.athletes.size > 0 && !r.athletes.some((a) => filters.athletes.has(a.id)))
        return false;
      if (filters.teams.size > 0 && !r.teams.some((t) => filters.teams.has(t.id)))
        return false;
      if (filters.priceBuckets.size > 0) {
        const b = bucketIdFor(r.price);
        if (!b || !filters.priceBuckets.has(b)) return false;
      }
      if (q && !r.title.toLowerCase().includes(q)) return false;
      return true;
    });
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return +new Date(a.created_at) - +new Date(b.created_at);
        case "price_asc":
          return (a.price ?? Infinity) - (b.price ?? Infinity);
        case "price_desc":
          return (b.price ?? -Infinity) - (a.price ?? -Infinity);
        case "title_asc":
          return a.title.localeCompare(b.title);
        case "newest":
        default:
          return +new Date(b.created_at) - +new Date(a.created_at);
      }
    });
    return sorted;
  }, [tabRows, search, filters, sort]);

  const isEmpty = !loading && rows && rows.length === 0;
  const activeFilterCount =
    filters.categories.size +
    filters.athletes.size +
    filters.teams.size +
    filters.statuses.size +
    filters.priceBuckets.size;

  function clearAll() {
    setFilters(emptyFilters());
    setSearch("");
  }

  function removeFilter(kind: keyof FilterState, value: string) {
    setFilters((f) => {
      const next = { ...f };
      const set = new Set(next[kind] as Set<string>);
      set.delete(value);
      (next as Record<string, Set<string>>)[kind] = set;
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitBulkMode() {
    setBulkMode(false);
    setSelected(new Set());
  }

  // Optimistic local toggle for is_hidden_from_dashboard
  async function toggleHidden(id: string) {
    const row = rows?.find((r) => r.id === id);
    if (!row) return;
    const next = !row.is_hidden_from_dashboard;
    setRows((rs) =>
      rs ? rs.map((r) => (r.id === id ? { ...r, is_hidden_from_dashboard: next } : r)) : rs,
    );
    const { error } = await supabase
      .from("products")
      .update({ is_hidden_from_dashboard: next })
      .eq("id", id);
    if (error) {
      // revert on failure
      setRows((rs) =>
        rs ? rs.map((r) => (r.id === id ? { ...r, is_hidden_from_dashboard: !next } : r)) : rs,
      );
      toast.error("Could not update visibility");
    } else {
      toast.success(next ? "Hidden from dashboard" : "Shown on dashboard");
    }
  }

  // Archive a product locally + push to Shopify.
  async function archiveProduct(id: string) {
    const row = rows?.find((r) => r.id === id);
    if (!row) return;
    const prevStatus = row.status;
    setRows((rs) =>
      rs ? rs.map((r) => (r.id === id ? { ...r, status: "archived" as ProductStatus } : r)) : rs,
    );
    const { error } = await supabase
      .from("products")
      .update({ status: "archived" })
      .eq("id", id);
    if (error) {
      setRows((rs) =>
        rs ? rs.map((r) => (r.id === id ? { ...r, status: prevStatus } : r)) : rs,
      );
      toast.error("Could not archive product");
      return;
    }
    const { error: fnErr } = await supabase.functions.invoke(
      "shopify-update-product",
      { body: { product_id: id, status: "archived" } },
    );
    if (fnErr) {
      toast.success("Archived locally — Shopify sync failed");
    } else {
      toast.success(`Archived "${row.title}"`);
    }
  }

  // Keyboard shortcuts: B toggles bulk mode, Esc exits.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "Escape") {
        if (bulkMode) {
          e.preventDefault();
          exitBulkMode();
        }
        return;
      }
      if (inField) return;
      if (e.key === "b" || e.key === "B") {
        if (filtered.length === 0) return;
        e.preventDefault();
        if (bulkMode) exitBulkMode();
        else setBulkMode(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkMode, filtered.length]);

  const sidebar = (
    <ProductFilterSidebar
      filters={filters}
      onChange={setFilters}
      categoryCounts={categoryCounts}
      athleteOptions={athleteOptions}
      teamOptions={teamOptions}
      statusCounts={statusCounts}
      priceBucketCounts={priceBucketCounts}
    />
  );

  return (
    <div className={cn(
      "p-4 lg:p-8 max-w-[1600px] mx-auto",
      // Reserve room above the fixed mobile bulk bar so content isn't covered
      bulkMode && "pb-48 md:pb-0",
    )}>
      {/* Pull-to-refresh indicator */}
      {(pullPx > 0 || refreshing) && (
        <div
          className="md:hidden flex items-center justify-center text-muted-foreground"
          style={{
            height: refreshing ? 36 : Math.min(pullPx, 80),
            opacity: refreshing ? 1 : Math.min(pullPx / 70, 1),
            transition: refreshing ? "height 200ms ease" : "none",
          }}
          aria-hidden
        >
          <Loader2 className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </div>
      )}

      {bulkMode && (
        <BulkTagBar
          selectedIds={Array.from(selected)}
          onCancel={exitBulkMode}
          onApplied={() => {
            setSelected(new Set());
            load();
          }}
          athleteOptions={allAthletes}
          teamOptions={allTeams}
        />
      )}

      <header className="flex items-center justify-between gap-3 flex-wrap mb-6 mt-4">
        <div>
          <div className="ax-section-header mb-2">Catalog</div>
          <h1 className="text-2xl md:text-3xl font-bold">Products</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2 h-11 md:h-10 pressable">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create</span>
          </Button>
          <Button onClick={() => setImportOpen(true)} className="gap-2 h-11 md:h-10 pressable">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Import URL</span>
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleMooneySweep}
              disabled={sweepBusy}
              className="gap-2 h-11 md:h-10 pressable"
              title="Auto-link Darnell Mooney to any product/design mentioning Mooney, Mooney World, or MWrld"
            >
              {sweepBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span className="hidden md:inline">Auto-link Mooney</span>
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleRefreshAllImages}
              disabled={refreshBusy}
              className="gap-2 h-11 md:h-10 pressable"
              title="Pull fresh image URLs from Shopify for every product in this org"
            >
              {refreshBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden md:inline">Refresh Images</span>
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleRefreshAllVariants}
              disabled={variantsBusy}
              className="gap-2 h-11 md:h-10 pressable"
              title="Pull colors, sizes, prices and inventory from Shopify for every product in this org"
            >
              {variantsBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden md:inline">Refresh Variants</span>
            </Button>
          )}
        </div>
      </header>

      {/* View tabs */}
      {!isEmpty && (
        <div className="flex items-center gap-1 mb-4 border-b border-border overflow-x-auto">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  if (bulkMode) setSelected(new Set());
                }}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors tabular-nums",
                  active
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}{" "}
                <span className={cn("ml-1 text-xs", active ? "text-accent" : "text-muted-foreground/70")}>
                  ({tabCounts[t.id]})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {isEmpty && (
        <div className="ax-card p-12 text-center space-y-4">
          <p className="text-muted-foreground">
            No products yet. Create one manually or import from a URL.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Create Manually
            </Button>
            <Button onClick={() => setImportOpen(true)} className="gap-2">
              <Download className="h-4 w-4" /> Import from URL
            </Button>
          </div>
        </div>
      )}

      {!isEmpty && (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6">
          <aside className="hidden lg:block bg-card border border-border rounded-xl sticky top-4 h-[calc(100vh-2rem)] overflow-y-auto scroll-touch">
            {sidebar}
          </aside>

          <section className="space-y-4 min-w-0">
            {/* Search — sticky on mobile, regular on desktop */}
            <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/85 backdrop-blur-md md:static md:mx-0 md:px-0 md:py-0 md:bg-transparent md:backdrop-blur-none">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search products…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputMode="search"
                  className="pl-9 h-11 md:h-10"
                />
              </div>
            </div>

            {/* Toolbar — wraps to multiple rows on small screens */}
            <div className="flex items-center gap-2 flex-wrap">
              <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="lg:hidden gap-2 h-11 px-3 pressable">
                    <Filter className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="bg-accent text-accent-foreground rounded-full text-[10px] font-bold w-5 h-5 inline-flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                {/* On phones, slide up from bottom; on tablets, slide from left */}
                <SheetContent
                  side="bottom"
                  className="p-0 rounded-t-2xl max-h-[85vh] flex flex-col md:hidden"
                >
                  <div className="mx-auto mt-2 mb-1 h-1.5 w-10 rounded-full bg-muted shrink-0" />
                  <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
                    <SheetTitle className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4" /> Filters
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto scroll-touch pb-safe">{sidebar}</div>
                </SheetContent>
                <SheetContent side="left" className="hidden md:flex p-0 w-[300px] sm:w-[340px] flex-col">
                  <SheetHeader className="p-4 border-b border-border shrink-0">
                    <SheetTitle className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4" /> Filters
                    </SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto scroll-touch">{sidebar}</div>
                </SheetContent>
              </Sheet>

              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="flex-1 min-w-[140px] md:flex-none md:w-[180px] h-11 md:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {tab !== "hidden" && (
                <label
                  className={cn(
                    "flex items-center gap-2 px-3 h-11 md:h-10 rounded-md border border-border bg-card text-sm cursor-pointer whitespace-nowrap pressable",
                    showHidden && "border-accent/60 bg-accent/5 text-accent",
                  )}
                  title="Temporarily include hidden products in this view"
                >
                  <Checkbox
                    checked={showHidden}
                    onCheckedChange={(v) => setShowHidden(!!v)}
                    aria-label="Show hidden products"
                    className="h-5 w-5"
                  />
                  <span>Show hidden</span>
                </label>
              )}

              <label
                className={cn(
                  "flex items-center gap-2 px-3 h-11 md:h-10 rounded-md border border-border bg-card text-sm cursor-pointer pressable",
                  filtered.length === 0 && "opacity-50 cursor-not-allowed",
                  bulkMode && "border-accent bg-accent/10",
                )}
                title="Toggle bulk tag mode (B)"
              >
                <Tag className="h-4 w-4" />
                <span className="whitespace-nowrap">Bulk Tag</span>
                <Switch
                  checked={bulkMode}
                  disabled={filtered.length === 0}
                  onCheckedChange={(v) => {
                    if (v) setBulkMode(true);
                    else exitBulkMode();
                  }}
                />
              </label>
            </div>

            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {Array.from(filters.categories).map((c) => (
                  <FilterChip key={`c-${c}`} label={c} onRemove={() => removeFilter("categories", c)} />
                ))}
                {Array.from(filters.statuses).map((s) => (
                  <FilterChip
                    key={`s-${s}`}
                    label={s.charAt(0).toUpperCase() + s.slice(1)}
                    onRemove={() => removeFilter("statuses", s)}
                  />
                ))}
                {Array.from(filters.priceBuckets).map((p) => {
                  const lbl = PRICE_BUCKETS.find((b) => b.id === p)?.label ?? p;
                  return (
                    <FilterChip
                      key={`p-${p}`}
                      label={lbl}
                      onRemove={() => removeFilter("priceBuckets", p)}
                    />
                  );
                })}
                {Array.from(filters.athletes).map((id) => {
                  const a = athleteOptions.find((x) => x.id === id);
                  return (
                    <FilterChip
                      key={`a-${id}`}
                      label={a?.name ?? id}
                      onRemove={() => removeFilter("athletes", id)}
                    />
                  );
                })}
                {Array.from(filters.teams).map((id) => {
                  const t = teamOptions.find((x) => x.id === id);
                  return (
                    <FilterChip
                      key={`t-${id}`}
                      label={t?.name ?? id}
                      onRemove={() => removeFilter("teams", id)}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-muted-foreground hover:text-accent underline-offset-2 hover:underline ml-1"
                >
                  Clear all
                </button>
              </div>
            )}

            {!loading && (
              <div className="text-xs text-muted-foreground tabular-nums">
                {filtered.length} {filtered.length === 1 ? "product" : "products"}
              </div>
            )}

            {/* Grid */}
            {loading ? (
              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl overflow-hidden">
                    <Skeleton className="aspect-square w-full rounded-none" />
                    <div className="p-3 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="ax-card p-12 text-center space-y-4">
                <p className="text-muted-foreground">{emptyMessage(tab, activeFilterCount > 0 || search.trim() !== "")}</p>
                {(activeFilterCount > 0 || search.trim() !== "") && (
                  <Button variant="outline" onClick={clearAll}>
                    Clear all filters
                  </Button>
                )}
              </div>
            ) : (
              <div
                ref={marquee.containerRef}
                className="relative grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 select-none"
              >
                {marquee.overlay}
                {filtered.map((r) => (
                  <div key={r.id} data-marquee-id={r.id}>
                  <ProductCard
                    key={r.id}
                    id={r.id}
                    title={r.title}
                    price={r.price}
                    compareAtPrice={r.compare_at_price}
                    status={r.status}
                    imageUrl={r.primary_image_url}
                    isHidden={r.is_hidden_from_dashboard}
                    hasImageWarning={r.has_image_warning}
                    isAdmin={isAdmin}
                    bulkMode={bulkMode}
                    selected={selected.has(r.id)}
                    onClick={() => {
                      if (bulkMode) toggleSelected(r.id);
                      else openDetail(r.id);
                    }}
                    onToggleHidden={() => toggleHidden(r.id)}
                    onOpenTagPopover={(anchor) => setTagPopover({ id: r.id, anchor })}
                    onViewDetails={() => openDetail(r.id)}
                    onEditTitle={() => setEditTitleFor({ id: r.id, title: r.title })}
                    onArchive={() => setArchiveFor({ id: r.id, title: r.title })}
                    onFetchImage={() => handleFetchImage(r.id)}
                    fetchImageBusy={fetchImageBusyId === r.id}
                  />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <ProductFormDrawer open={createOpen} onOpenChange={setCreateOpen} onSaved={load} />
      <ImportFromUrlDialog open={importOpen} onOpenChange={setImportOpen} />
      <ProductDetailDrawer
        productId={detailId}
        open={detailOpen}
        onOpenChange={closeDetail}
        onChanged={load}
      />
      <ProductTagPopover
        productId={tagPopover?.id ?? null}
        anchor={tagPopover?.anchor ?? null}
        onClose={() => setTagPopover(null)}
        onSaved={load}
      />
      <EditTitleDialog
        productId={editTitleFor?.id ?? null}
        initialTitle={editTitleFor?.title ?? ""}
        open={!!editTitleFor}
        onOpenChange={(o) => !o && setEditTitleFor(null)}
        onSaved={(newTitle) => {
          if (!editTitleFor) return;
          setRows((rs) =>
            rs ? rs.map((r) => (r.id === editTitleFor.id ? { ...r, title: newTitle } : r)) : rs,
          );
        }}
      />
      <AlertDialog open={!!archiveFor} onOpenChange={(o) => !o && setArchiveFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive “{archiveFor?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from your storefront.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (archiveFor) archiveProduct(archiveFor.id);
                setArchiveFor(null);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function emptyMessage(tab: ViewTab, hasFilters: boolean): string {
  if (hasFilters) return "No products match these filters";
  switch (tab) {
    case "drafts":
      return "No draft products. Drafts from Shopify appear here.";
    case "hidden":
      return "No hidden products. Hide products you don't want shown on this dashboard using the eye icon.";
    case "archived":
      return "No archived products.";
    case "live":
      return "No live products. Published, non-hidden products appear here.";
    default:
      return "No products to show.";
  }
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-accent/15 text-accent border border-accent/30">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="hover:bg-accent/20 rounded-full p-0.5 -mr-1"
        aria-label={`Remove ${label}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
