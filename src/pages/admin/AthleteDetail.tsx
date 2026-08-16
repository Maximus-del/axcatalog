import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { differenceInYears, parseISO } from "date-fns";
import { Pencil, Plus, Package, Palette, FolderOpen, Eye, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { cn } from "@/lib/utils";
import {
  AthleteFormDialog,
  type AthleteFormValues,
} from "@/components/admin/athletes/AthleteFormDialog";
import { MembershipFormDialog } from "@/components/admin/athletes/MembershipFormDialog";
import { AthletePhoto } from "@/components/fan/ui/AthletePhoto";
import { AthleteContentTab } from "@/components/admin/ecosystem/AthleteContentTab";
import { AthleteAccessTab } from "@/components/admin/ecosystem/AthleteAccessTab";
import { AthleteEventsTab } from "@/components/admin/ecosystem/AthleteEventsTab";
import { AthleteDropsTab } from "@/components/admin/ecosystem/AthleteDropsTab";
import { AthleteCollectionsTab } from "@/components/admin/ecosystem/AthleteCollectionsTab";
import { ApplyTemplateButton } from "@/components/admin/ecosystem/ApplyTemplateButton";
import { ApplyDesignTemplateButton } from "@/components/admin/ecosystem/ApplyDesignTemplateButton";
import { RapidStartButton } from "@/components/admin/ecosystem/RapidStartButton";
import {
  QuickAddProductDialog,
  QuickAddDesignDialog,
  QuickAddCollectionDialog,
} from "@/components/admin/ecosystem/AthleteMerchDialogs";
import { ProductStatusChip, PendingClock } from "@/components/admin/ecosystem/ProductStatusChip";
import { toProductLike } from "@/lib/ecosystem/merch";
import { EntityRolesDialog } from "@/components/admin/ecosystem/EntityRolesDialog";
import { EntityMerchWorkspace } from "@/components/admin/ecosystem/EntityMerchWorkspace";
import { UploadConceptsDialog } from "@/components/admin/ecosystem/UploadConceptsDialog";
import { UploadMockupsDialog } from "@/components/admin/ecosystem/UploadMockupsDialog";
import {
  displayNameOf, entityTypeOf, hasModule, hasRole, isPerson, rolesOf,
  ENTITY_TYPES, AX_ROLES,
} from "@/lib/ecosystem/entity";

const MGMT_TABS = ["merch", "collections", "drops", "content", "access", "events"] as const;

const UNTAGGED_KEY = "__untagged__";
const GENERAL_KEY = "__general__";

interface Athlete {
  id: string;
  organization_id: string;
  first_name: string;
  last_name: string;
  full_name: string | null;
  slug: string;
  position: string | null;
  jersey_number: string | null;
  league: string | null;
  status: "active" | "inactive" | "archived";
  current_team_id: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  entity_type?: string | null;
  roles?: string[] | null;
  display_name?: string | null;
  capabilities?: Record<string, boolean> | null;
}

interface Membership {
  id: string;
  team_id: string;
  start_date: string | null;
  end_date: string | null;
  team: { id: string; name: string } | null;
}

interface ProductLink {
  id: string;
  team_id_at_release: string | null;
  product: {
    id: string;
    title: string;
    description?: string | null;
    blank_id?: string | null;
    updated_at?: string | null;
    approval_state?: string | null;
    approval_note?: string | null;
    shopify_product_id?: string | null;
    shopify_handle?: string | null;
    shopify_sync_status?: string | null;
    shopify_last_synced_at?: string | null;
    metadata?: Record<string, unknown> | null;
    designs?: { design_id: string }[];
    collections?: { collection_id: string }[];
    price: number | null;
    status: string;
    images: Array<{ storage_path: string; storage_bucket: string }>;
  } | null;
}

interface DesignLink {
  team_id_at_creation: string | null;
  design: {
    id: string;
    title: string;
    status: string;
    files: Array<{ storage_path: string; storage_bucket: string }>;
  } | null;
}

interface Collection {
  id: string;
  name: string;
  description: string | null;
  status: string;
  team_id: string | null;
  product_count: number;
}

const STATUS_BADGE: Record<string, string> = {
  active: "ax-badge-success",
  inactive: "ax-badge-pending",
  archived:
    "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider bg-muted text-muted-foreground",
};

function publicImageUrl(bucket: string, path: string): string | null {
  if (!bucket || !path) return null;
  if (bucket !== "product-images") return null; // private buckets need signed URLs
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export default function AthleteDetail() {
  const { id } = useParams<{ id: string }>();
  const [athlete, setAthlete] = useState<Athlete | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [products, setProducts] = useState<ProductLink[]>([]);
  const [designs, setDesigns] = useState<DesignLink[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [membershipOpen, setMembershipOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [mgmtTab, setMgmtTab] = useState<(typeof MGMT_TABS)[number]>("merch");
  // Creating from the athlete page — the whole point is not leaving this context.
  const [addProduct, setAddProduct] = useState<{ concept: boolean } | null>(null);
  const [addDesign, setAddDesign] = useState(false);
  const [addCollection, setAddCollection] = useState(false);
  const [entityOpen, setEntityOpen] = useState(false);
  const [uploadConcepts, setUploadConcepts] = useState(false);
  const [uploadMockups, setUploadMockups] = useState(false);
  const [mockups, setMockups] = useState<Array<{ id: string; title: string; shot_type: string | null; status: string; storage_bucket: string | null; storage_path: string | null }>>([]);

  async function load() {
    if (!id) return;
    setLoading(true);

    const [aRes, mRes, pRes, dRes, cRes, mkRes] = await Promise.all([
      supabase.from("athletes").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("team_memberships")
        .select("id, team_id, start_date, end_date, team:teams(id, name)")
        .eq("athlete_id", id)
        .order("start_date", { ascending: false, nullsFirst: false }),
      supabase
        .from("product_athletes")
        .select(
          `id, team_id_at_release,
           product:products(id, title, description, price, status, blank_id, updated_at,
             approval_state, approval_note,
             shopify_product_id, shopify_handle, shopify_sync_status, shopify_last_synced_at,
             metadata,
             images:product_images(storage_path, storage_bucket),
             designs:product_designs(design_id),
             collections:collection_products(collection_id))`,
        )
        .eq("athlete_id", id),
      supabase
        .from("design_athletes")
        .select(
          `team_id_at_creation,
           design:designs(id, title, status,
             files:design_files(storage_path, storage_bucket))`,
        )
        .eq("athlete_id", id),
      supabase
        .from("collections")
        .select("id, name, description, status, team_id")
        .eq("athlete_id", id),
      supabase
        .from("mockups")
        .select("id, title, shot_type, status, storage_bucket, storage_path")
        .eq("athlete_id", id)
        .order("created_at", { ascending: false }),
    ]);

    setAthlete((aRes.data as Athlete | null) ?? null);
    setMockups((mkRes.data ?? []) as never);
    const memships = (mRes.data ?? []).map((m) => ({
      ...m,
      team: Array.isArray(m.team) ? (m.team[0] ?? null) : (m.team as Membership["team"]),
    })) as Membership[];
    setMemberships(memships);
    setProducts(
      (pRes.data ?? []).map((r) => ({
        ...r,
        product: Array.isArray(r.product) ? r.product[0] : r.product,
      })) as ProductLink[],
    );
    setDesigns(
      (dRes.data ?? []).map((r) => ({
        ...r,
        design: Array.isArray(r.design) ? r.design[0] : r.design,
      })) as DesignLink[],
    );

    // Collection product counts
    const colIds = (cRes.data ?? []).map((c) => c.id);
    const counts = new Map<string, number>();
    if (colIds.length) {
      const { data: cp } = await supabase
        .from("collection_products")
        .select("collection_id")
        .in("collection_id", colIds);
      (cp ?? []).forEach((r) =>
        counts.set(r.collection_id, (counts.get(r.collection_id) ?? 0) + 1),
      );
    }
    setCollections(
      (cRes.data ?? []).map((c) => ({
        ...c,
        product_count: counts.get(c.id) ?? 0,
      })),
    );

    // Default tab
    if (memships.length === 0) {
      setActiveTab(GENERAL_KEY);
    } else {
      const current = memships.find((m) => !m.end_date);
      setActiveTab(current?.team_id ?? memships[0].team_id);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [id]);

  const name = athlete
    ? displayNameOf(athlete)
    : "";

  const tabs = useMemo(() => {
    if (memberships.length === 0) {
      return [{ key: GENERAL_KEY, label: "General", teamId: null as string | null }];
    }
    const list = memberships.map((m) => {
      const start = m.start_date ? new Date(m.start_date).getFullYear() : "?";
      const end = m.end_date ? new Date(m.end_date).getFullYear() : "Now";
      const range = start === end ? `${start}` : `${start}-${end}`;
      return {
        key: m.team_id,
        label: `${m.team?.name ?? "Unknown Team"} · ${range}`,
        teamId: m.team_id,
      };
    });
    // Dedup by team_id keeping the most recent (first since sorted desc)
    const seen = new Set<string>();
    const uniq = list.filter((t) => {
      if (seen.has(t.key)) return false;
      seen.add(t.key);
      return true;
    });
    // Untagged tab if any links have null team
    const hasUntagged =
      products.some((p) => p.team_id_at_release === null) ||
      designs.some((d) => d.team_id_at_creation === null);
    if (hasUntagged) {
      uniq.push({ key: UNTAGGED_KEY, label: "Untagged", teamId: null });
    }
    return uniq;
  }, [memberships, products, designs]);

  const yearsActive = useMemo(() => {
    if (memberships.length === 0) return 0;
    const earliest = memberships
      .map((m) => m.start_date)
      .filter(Boolean)
      .sort()[0];
    if (!earliest) return 0;
    return differenceInYears(new Date(), parseISO(earliest));
  }, [memberships]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-24 w-24 rounded-full" />
          <div className="space-y-3 flex-1">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="p-8 max-w-[1400px] mx-auto">
        <div className="ax-card p-12 text-center space-y-3">
          <p className="text-muted-foreground">Athlete not found.</p>
          <Link to="/admin/athletes" className="text-accent text-sm">
            ← Back to athletes
          </Link>
        </div>
      </div>
    );
  }

  const initialFormValues: AthleteFormValues = {
    id: athlete.id,
    first_name: athlete.first_name,
    last_name: athlete.last_name,
    slug: athlete.slug,
    current_team_id: athlete.current_team_id,
    position: athlete.position ?? "",
    jersey_number: athlete.jersey_number ?? "",
    league: athlete.league as AthleteFormValues["league"],
    status: athlete.status,
    notes: athlete.notes ?? "",
  };

  const currentTeam = memberships.find((m) => m.team_id === athlete.current_team_id)?.team;

  function productsForTab(teamId: string | null, key: string): ProductLink[] {
    if (key === GENERAL_KEY) return products;
    if (key === UNTAGGED_KEY) return products.filter((p) => p.team_id_at_release === null);
    // Era tab: matching team_id_at_release; null releases shown only in Untagged
    return products.filter((p) => p.team_id_at_release === teamId);
  }
  function designsForTab(teamId: string | null, key: string): DesignLink[] {
    if (key === GENERAL_KEY) return designs;
    if (key === UNTAGGED_KEY) return designs.filter((d) => d.team_id_at_creation === null);
    return designs.filter((d) => d.team_id_at_creation === teamId);
  }
  function collectionsForTab(teamId: string | null, key: string): Collection[] {
    if (key === GENERAL_KEY) return collections;
    if (key === UNTAGGED_KEY) return collections.filter((c) => c.team_id === null);
    return collections.filter((c) => c.team_id === teamId);
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8">
      <div className="text-sm">
        <Link to="/admin/athletes" className="text-muted-foreground hover:text-foreground">
          ← Athletes
        </Link>
      </div>

      {/* HERO */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-5">
          <AthletePhoto
            athlete={{
              slug: athlete.slug,
              image_url: (athlete.metadata as { avatar_url?: string } | null)?.avatar_url ?? null,
              full_name: name,
              first_name: athlete.first_name,
              last_name: athlete.last_name,
            }}
            className="h-24 w-24 rounded-full"
            textClass="text-2xl"
          />
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">{name}</h1>
            <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
              {currentTeam && (
                <span className="px-2 py-0.5 rounded-md bg-muted text-foreground text-xs">
                  {currentTeam.name}
                </span>
              )}
              {/* Athletic detail only makes sense for a person. */}
              {isPerson(athlete.entity_type) && athlete.position && <span>{athlete.position}</span>}
              {isPerson(athlete.entity_type) && athlete.jersey_number && (
                <span>#{athlete.jersey_number.replace(/^#/, "")}</span>
              )}
              {isPerson(athlete.entity_type) && athlete.league && <span>{athlete.league}</span>}
              {!isPerson(athlete.entity_type) && (
                <span className="px-2 py-0.5 rounded-md bg-muted text-foreground text-xs capitalize">
                  {ENTITY_TYPES.find((t) => t.value === entityTypeOf(athlete))?.label ?? "Entity"}
                </span>
              )}
              {rolesOf(athlete).map((r) => (
                <span key={r} className="px-2 py-0.5 rounded-md bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))] text-[10px] font-bold uppercase tracking-wider">
                  {AX_ROLES.find((x) => x.value === r)?.label ?? r}
                </span>
              ))}
              <span className={STATUS_BADGE[athlete.status]}>{athlete.status}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasModule(athlete, "fan_profile") && (
          <Button variant="outline" asChild className="gap-2">
            <Link to={`/a/${athlete.slug}`}>
              <Eye className="h-4 w-4" /> View Fan Profile
            </Link>
          </Button>
          )}
          {hasModule(athlete, "athlete_dashboard") && (
          <Button variant="outline" asChild className="gap-2">
            <Link to={`/portal?as=${athlete.id}`}>
              <Eye className="h-4 w-4" /> Athlete Dashboard
            </Link>
          </Button>
          )}
          <ApplyTemplateButton athleteId={athlete.id} />
          <ApplyDesignTemplateButton athleteId={athlete.id} organizationId={athlete.organization_id} />
          <RapidStartButton athleteId={athlete.id} organizationId={athlete.organization_id} lastName={athlete.last_name} />
          <Button variant="outline" onClick={() => setEntityOpen(true)} className="gap-2">
            <ShieldCheck className="h-4 w-4" /> Type &amp; Roles
          </Button>
          <Button variant="outline" onClick={() => setMembershipOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Team Membership
          </Button>
          <Button onClick={() => setEditOpen(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> Edit
          </Button>
        </div>
      </header>

      {/* MANAGEMENT TABS */}
      <div className="flex gap-1 border-b border-[hsl(var(--ax-border))] overflow-x-auto">
        {MGMT_TABS.map((m) => (
          <button
            key={m}
            onClick={() => setMgmtTab(m)}
            className={cn(
              "shrink-0 h-10 px-4 text-sm font-bold capitalize border-b-2 -mb-px transition-colors",
              mgmtTab === m
                ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-accent))]"
                : "border-transparent text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]",
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {mgmtTab === "merch" ? (
        <EntityMerchWorkspace
          entity={athlete}
          teamId={activeTab !== GENERAL_KEY && activeTab !== UNTAGGED_KEY ? activeTab : null}
          products={products
            .map((pl) => pl.product)
            .filter(Boolean)
            .map((p) => ({
              ...p!,
              collection_ids: (p!.collections ?? []).map((c) => c.collection_id),
            }))}
          designs={designs.map((d) => d.design).filter(Boolean) as never}
          mockups={mockups}
          collections={collections}
          onChanged={load}
          onAddProduct={() => setAddProduct({ concept: false })}
          onUploadConcepts={() => setUploadConcepts(true)}
          onAddDesign={() => setAddDesign(true)}
          onCreateCollection={() => setAddCollection(true)}
          onAddMockups={() => setUploadMockups(true)}
        />
      ) : mgmtTab === "collections" ? (
        <AthleteCollectionsTab athleteId={athlete.id} organizationId={athlete.organization_id} />
      ) : mgmtTab === "drops" ? (
        <AthleteDropsTab athleteId={athlete.id} organizationId={athlete.organization_id} />
      ) : mgmtTab === "content" ? (
        <AthleteContentTab athleteId={athlete.id} organizationId={athlete.organization_id} athleteName={name} />
      ) : mgmtTab === "access" ? (
        <AthleteAccessTab athleteId={athlete.id} organizationId={athlete.organization_id} />
      ) : mgmtTab === "events" ? (
        <AthleteEventsTab athleteId={athlete.id} organizationId={athlete.organization_id} athleteName={name} />
      ) : (
      <>
      {/* ERA TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((t) => {
          const tabProducts = productsForTab(t.teamId, t.key);
          const tabDesigns = designsForTab(t.teamId, t.key);
          const tabCollections = collectionsForTab(t.teamId, t.key);
          return (
            <TabsContent key={t.key} value={t.key} className="space-y-8 mt-6">
              {/* PRODUCTS */}
              <EraSection
                title="Products"
                icon={<Package className="h-4 w-4" />}
                count={tabProducts.length}
                emptyText="No products yet"
                emptyHint={`Create the first product for ${name}, or upload a concept while the setup gets finished.`}
                actions={
                  <>
                    <SectionAction onClick={() => setAddProduct({ concept: false })}>+ Add Product</SectionAction>
                    <SectionAction onClick={() => setAddProduct({ concept: true })}>+ Upload Concept</SectionAction>
                  </>
                }
              >
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {tabProducts.slice(0, 12).map((pl) =>
                    pl.product ? (
                      <div
                        key={pl.id}
                        className="ax-card-hover w-44 shrink-0 p-3"
                      >
                        <div className="aspect-square rounded-md bg-muted mb-2 overflow-hidden relative">
                          <span className="absolute top-1.5 right-1.5 z-10">
                            <PendingClock product={toProductLike(pl.product)} />
                          </span>
                          {pl.product.images?.[0] && (
                            <img
                              src={
                                publicImageUrl(
                                  pl.product.images[0].storage_bucket,
                                  pl.product.images[0].storage_path,
                                ) ?? ""
                              }
                              alt={pl.product.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          )}
                        </div>
                        <div className="text-sm font-medium truncate">
                          {pl.product.title}
                        </div>
                        <div className="flex items-center justify-between mt-1 gap-1">
                          <span className="text-xs text-muted-foreground">
                            {pl.product.price != null
                              ? `$${Number(pl.product.price).toFixed(2)}`
                              : "—"}
                          </span>
                          <ProductStatusChip product={toProductLike(pl.product)} />
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              </EraSection>

              {/* DESIGNS */}
              <EraSection
                title="Designs"
                icon={<Palette className="h-4 w-4" />}
                count={tabDesigns.length}
                emptyText="No designs yet"
                emptyHint="Upload final artwork — transparent PNG, isolated, high resolution."
                actions={<SectionAction onClick={() => setAddDesign(true)}>+ Add Design</SectionAction>}
              >
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {tabDesigns.slice(0, 12).map((dl, i) =>
                    dl.design ? (
                      <div
                        key={`${dl.design.id}-${i}`}
                        className="ax-card-hover w-44 shrink-0 p-3"
                      >
                        <div className="aspect-square rounded-md bg-muted mb-2 flex items-center justify-center">
                          <Palette className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium truncate">
                          {dl.design.title}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                          {dl.design.status}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              </EraSection>

              {/* COLLECTIONS */}
              <EraSection
                title="Collections"
                icon={<FolderOpen className="h-4 w-4" />}
                count={tabCollections.length}
                emptyText="No collections yet"
                emptyHint="A collection is the permanent creative family. Drops release from it."
                actions={<SectionAction onClick={() => setAddCollection(true)}>+ Create Collection</SectionAction>}
              >
                <div className="space-y-2">
                  {tabCollections.map((c) => (
                    <div
                      key={c.id}
                      className="ax-card flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        {c.description && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {c.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                        <span>{c.product_count} products</span>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full uppercase tracking-wider text-[10px]",
                            c.status === "active"
                              ? "bg-accent/15 text-accent"
                              : "bg-muted",
                          )}
                        >
                          {c.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </EraSection>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* ALL-TIME */}
      <section className="space-y-3">
        <div className="ax-section-header">All-Time</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatTile label="Total Products" value={products.length} />
          <StatTile label="Total Designs" value={designs.length} />
          <StatTile label="Total Collections" value={collections.length} />
          <StatTile label="Years Active" value={yearsActive} />
        </div>
      </section>
      </>
      )}

      <AthleteFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={initialFormValues}
        onSaved={load}
      />
      <MembershipFormDialog
        open={membershipOpen}
        onOpenChange={setMembershipOpen}
        athleteId={athlete.id}
        organizationId={athlete.organization_id}
        onSaved={load}
      />

      {addProduct && athlete && (
        <QuickAddProductDialog
          athlete={{ id: athlete.id, organization_id: athlete.organization_id, name }}
          teamId={activeTab !== GENERAL_KEY && activeTab !== UNTAGGED_KEY ? activeTab : null}
          conceptOnly={addProduct.concept}
          onClose={() => setAddProduct(null)}
          onCreated={load}
        />
      )}
      {addDesign && athlete && (
        <QuickAddDesignDialog
          athlete={{ id: athlete.id, organization_id: athlete.organization_id, name }}
          onClose={() => setAddDesign(false)}
          onCreated={load}
        />
      )}
      {uploadMockups && athlete && (
        <UploadMockupsDialog
          entity={{ id: athlete.id, organization_id: athlete.organization_id, name }}
          onClose={() => setUploadMockups(false)}
          onCreated={load}
        />
      )}
      {uploadConcepts && athlete && (
        <UploadConceptsDialog
          entity={{ id: athlete.id, organization_id: athlete.organization_id, name }}
          teamId={activeTab !== GENERAL_KEY && activeTab !== UNTAGGED_KEY ? activeTab : null}
          onClose={() => setUploadConcepts(false)}
          onCreated={load}
        />
      )}
      {entityOpen && athlete && (
        <EntityRolesDialog
          entity={athlete}
          onClose={() => setEntityOpen(false)}
          onSaved={load}
        />
      )}
      {addCollection && athlete && (
        <QuickAddCollectionDialog
          athlete={{ id: athlete.id, organization_id: athlete.organization_id, name }}
          onClose={() => setAddCollection(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}

function SectionAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-semibold text-[hsl(var(--ax-accent))] hover:underline whitespace-nowrap"
    >
      {children}
    </button>
  );
}

function EraSection({
  title,
  icon,
  count,
  emptyText,
  emptyHint,
  actions,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  emptyText: string;
  emptyHint?: string;
  /** Create affordances — shown in the header and again in the empty state. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 ax-section-header">
          {icon}
          <span>{title}</span>
          <span className="text-muted-foreground normal-case tracking-normal text-xs ml-1">
            ({count})
          </span>
        </div>
        <div className="flex items-center gap-3">
          {count > 12 && (
            <span className="text-xs text-muted-foreground">{count} total</span>
          )}
          {actions}
        </div>
      </div>
      {count === 0 ? (
        <div className="ax-card p-6 text-center space-y-2">
          <div className="text-sm text-muted-foreground">{emptyText}</div>
          {emptyHint && <div className="text-xs text-muted-foreground">{emptyHint}</div>}
          {actions && <div className="flex items-center justify-center gap-2 pt-1">{actions}</div>}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="ax-card">
      <div className="ax-label mb-2">{label}</div>
      <div className="ax-stat">{value}</div>
    </div>
  );
}
