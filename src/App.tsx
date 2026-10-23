import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireAdmin, RequirePortal, RequireFan, RequireAffiliate } from "@/auth/guards";
import { LoadingScreen } from "@/components/brand/LoadingScreen";
import { v2Pages } from "@/lib/v2/page-loaders";

// Eager: entry + auth + the fan experience (the primary consumer surface).
import RootRedirect from "./pages/RootRedirect";
import Login from "./pages/Login";
import PendingAccess from "./pages/PendingAccess";
import SetPassword from "./pages/SetPassword";
import NotFound from "./pages/NotFound";
import LockerHostRoute from "./pages/LockerHostRoute";

import FanLayout from "@/components/fan/FanLayout";
import FanJoin from "./pages/fan/FanJoin";
import FanHome from "./pages/fan/FanHome";
import FanDiscover from "./pages/fan/FanDiscover";
import FanFollowing from "./pages/fan/FanFollowing";
import FanProfile from "./pages/fan/FanProfile";
import FanAccess from "./pages/fan/FanAccess";
import FanShop from "./pages/fan/FanShop";
import FanSaved from "./pages/fan/FanSaved";
import FanCamps from "./pages/fan/FanCamps";
import FanNotifications from "./pages/fan/FanNotifications";
import FanOnboarding from "./pages/fan/FanOnboarding";
import AthletePublicProfile from "./pages/fan/AthletePublicProfile";
import FanProductDetail from "./pages/fan/ProductDetail";
import { RedirectKeepSearch } from "@/components/portal/RedirectKeepSearch";

// Lazy: internal surfaces (admin, portal, affiliate, catalog) are code-split so
// fans never download them. Only these bundles change on the respective routes.
const QuestionnairePublic = lazy(() => import("./pages/QuestionnairePublic"));
const PortalInvite = lazy(() => import("./pages/PortalInvite"));
const PublicLocker = lazy(() => import("./pages/PublicLocker"));
const TestDrive = lazy(() => import("./pages/TestDrive"));
const DemoLink = lazy(() => import("./pages/DemoLink"));

const AdminLayout = lazy(() => import("@/components/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminAccess = lazy(() => import("./pages/admin/AdminAccess"));
const AdminEvents = lazy(() => import("./pages/admin/AdminEvents"));
const AdminTemplates = lazy(() => import("./pages/admin/AdminTemplates"));
const DesignTemplatesList = lazy(() => import("./pages/admin/DesignTemplatesList"));
const DesignTemplateDetail = lazy(() => import("./pages/admin/DesignTemplateDetail"));
const DesignTemplateInstance = lazy(() => import("./pages/admin/DesignTemplateInstance"));
const AthletesList = lazy(() => import("./pages/admin/AthletesList"));
const AthleteDetail = lazy(() => import("./pages/admin/AthleteDetail"));
const ProductsList = lazy(() => import("./pages/admin/ProductsList"));
const AdminProductDetail = lazy(() => import("./pages/admin/ProductDetail"));
const IngestionQueue = lazy(() => import("./pages/admin/IngestionQueue"));
const DesignsList = lazy(() => import("./pages/admin/DesignsList"));
const DesignDetail = lazy(() => import("./pages/admin/DesignDetail"));
const BlankCatalog = lazy(() => import("./pages/admin/BlankCatalog"));
const BlanksInventory = lazy(() => import("./pages/admin/BlanksInventory"));
const BlanksList = lazy(() => import("./pages/admin/BlanksList"));
const BlankDetail = lazy(() => import("./pages/admin/BlankDetail"));
const OrdersList = lazy(() => import("./pages/admin/OrdersList"));
const OrderDetail = lazy(() => import("./pages/admin/OrderDetail"));
const PricingMaster = lazy(() => import("./pages/admin/PricingMaster"));
const ImportsList = lazy(() => import("./pages/admin/ImportsList"));
const ImportBatchDetail = lazy(() => import("./pages/admin/ImportBatchDetail"));
const AthleteCredits = lazy(() => import("./pages/admin/AthleteCredits"));
const AffiliatesList = lazy(() => import("./pages/admin/AffiliatesList"));
const QuestionnairesList = lazy(() => import("./pages/admin/QuestionnairesList"));
const QuestionnaireEditor = lazy(() => import("./pages/admin/QuestionnaireEditor"));
const CustomerPricingLinks = lazy(() => import("./pages/admin/CustomerPricingLinks"));
const PrintZonesEditor = lazy(() => import("./pages/admin/PrintZonesEditor"));
const TeamUsers = lazy(() => import("./pages/admin/TeamUsers"));
const TasksList = lazy(() => import("./pages/admin/TasksList"));
const OrganizationsList = lazy(() => import("./pages/admin/OrganizationsList"));
const OrganizationDetail = lazy(() => import("./pages/admin/OrganizationDetail"));
const TeamsList = lazy(() => import("./pages/admin/TeamsList"));
const TeamDetail = lazy(() => import("./pages/admin/TeamDetail"));
const CollectionsList = lazy(() => import("./pages/admin/CollectionsList"));
const CollectionDetail = lazy(() => import("./pages/admin/CollectionDetail"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminPrompts = lazy(() => import("./pages/admin/AdminPrompts"));
const BlankImagesImport = lazy(() => import("./pages/admin/BlankImagesImport"));
const AdminMockups = lazy(() => import("./pages/admin/AdminMockups"));
const AdminBrandAssets = lazy(() => import("./pages/admin/AdminBrandAssets"));
const AdminFulfillment = lazy(() => import("./pages/admin/AdminFulfillment"));
const AdminPrintQueue = lazy(() => import("./pages/admin/AdminPrintQueue"));
const AdminInbox = lazy(() => import("./pages/admin/AdminInbox"));

// AX OS V2 — parallel operator namespace. Everything above is V1 and untouched.
const V2Layout = lazy(() => import("@/components/admin-v2/V2Layout"));
const V2Overview = lazy(v2Pages.overview);
const V2People = lazy(v2Pages.people);
const V2EntityOverview = lazy(v2Pages.entityOverview);
const V2EntityWorkspace = lazy(v2Pages.entityWorkspace);
const V2Creative = lazy(v2Pages.creative);
const V2Commerce = lazy(v2Pages.commerce);
const V2BlankDetail = lazy(v2Pages.blankDetail);
const V2NotFound = lazy(v2Pages.notFound);
const V2Orders = lazy(v2Pages.orders);
const V2Cart = lazy(v2Pages.cart);
const V2ProductDetail = lazy(v2Pages.productDetail);
const V2Desk = lazy(v2Pages.desk);
const V2Lineup = lazy(v2Pages.lineup);
const V2PricingSheet = lazy(v2Pages.pricingSheet);
const V2InvoiceBuilder = lazy(v2Pages.invoiceBuilder);
const V2Work = lazy(v2Pages.work);
const V2Releases = lazy(v2Pages.releases);
const V2ContentReview = lazy(v2Pages.contentReview);

const PortalLayout = lazy(() => import("@/components/portal/PortalLayout"));
const PortalHome = lazy(() => import("./pages/portal/PortalHome"));
const PortalProductDetail = lazy(() => import("./pages/portal/PortalProductDetail"));
const PortalProducts = lazy(() => import("./pages/portal/PortalProducts"));
const PortalMockups = lazy(() => import("./pages/portal/PortalMockups"));
const PortalAnalytics = lazy(() => import("./pages/portal/PortalAnalytics"));
const PortalContent = lazy(() => import("./pages/portal/PortalContent"));
const PortalDrops = lazy(() => import("./pages/portal/PortalDrops"));
const PortalEra = lazy(() => import("./pages/portal/PortalEra"));
const PortalMessages = lazy(() => import("./pages/portal/PortalMessages"));
const PortalStudio = lazy(() => import("./pages/portal/PortalStudio"));
const PortalProfile = lazy(() => import("./pages/portal/PortalProfile"));
const GameDayBuilder = lazy(() => import("./pages/portal/build/GameDayBuilder"));
const CampBuilder = lazy(() => import("./pages/portal/build/CampBuilder"));
const CustomBuilder = lazy(() => import("./pages/portal/build/CustomBuilder"));

const AffiliateLayout = lazy(() => import("@/components/affiliate/AffiliateLayout"));
const AffiliateSignup = lazy(() => import("./pages/affiliate/AffiliateSignup"));
const AffiliateHome = lazy(() => import("./pages/affiliate/AffiliateHome"));
const AffiliateProducts = lazy(() => import("./pages/affiliate/AffiliateProducts"));
const AffiliateSales = lazy(() => import("./pages/affiliate/AffiliateSales"));
const AffiliatePayouts = lazy(() => import("./pages/affiliate/AffiliatePayouts"));

const CatalogLayout = lazy(() => import("./pages/catalog/CatalogLayout"));
const CatalogList = lazy(() => import("./pages/catalog/CatalogList"));
const CatalogProductDetail = lazy(() => import("./pages/catalog/CatalogProductDetail"));
const CatalogCheckout = lazy(() => import("./pages/catalog/CatalogCheckout"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path="/" element={<LockerHostRoute root fallback={<RootRedirect />} />} />
              <Route path="/login" element={<Login />} />
              <Route path="/pending-access" element={<PendingAccess />} />
              <Route path="/set-password" element={<SetPassword />} />
              <Route path="/q/:slug" element={<QuestionnairePublic />} />

              {/* Client portal invites + public lockers (no login) */}
              <Route path="/invite/:token" element={<PortalInvite />} />
              <Route path="/l/:slug" element={<PublicLocker />} />
              {/* No-sign-in, read-only demo of a client portal (portal_demo_links) */}
              <Route path="/demo/:token" element={<DemoLink />} />
              {/* AX only: walk a client's invite → portal → locker as Owner / Team / Customer, nothing saved */}
              <Route path="/test-drive/:entityId" element={<RequireAdmin><TestDrive /></RequireAdmin>} />

              {/* Goat Farm Access (fan) — public entry + shareable pages */}
              <Route path="/join" element={<FanJoin />} />
              <Route path="/a/:slug" element={<AthletePublicProfile />} />
              <Route path="/p/:id" element={<FanProductDetail />} />
              <Route path="/welcome" element={<RequireFan><FanOnboarding /></RequireFan>} />

              {/* Fan feed */}
              <Route path="/feed" element={<RequireFan><FanLayout /></RequireFan>}>
                <Route index element={<FanHome />} />
                <Route path="discover" element={<FanDiscover />} />
                <Route path="access" element={<FanAccess />} />
                <Route path="shop" element={<FanShop />} />
                <Route path="camps" element={<FanCamps />} />
                <Route path="saved" element={<FanSaved />} />
                <Route path="notifications" element={<FanNotifications />} />
                <Route path="following" element={<FanFollowing />} />
                <Route path="profile" element={<FanProfile />} />
              </Route>

              {/* Admin */}
              <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
                <Route index element={<AdminOverview />} />

                {/* A department is a grouping, not a page — so its URL lands on
                    its first tool and the tab strip takes over from there.
                    Having them resolve at all matters: they are what the cards
                    and the icon rail would otherwise 404 on. */}
                <Route path="creative" element={<Navigate to="/admin/designs" replace />} />
                <Route path="commerce" element={<Navigate to="/admin/products" replace />} />
                <Route path="people" element={<Navigate to="/admin/athletes" replace />} />
                <Route path="pulse" element={<AdminDashboard />} />
                <Route path="content" element={<AdminContent />} />
                <Route path="access" element={<AdminAccess />} />
                <Route path="events" element={<AdminEvents />} />
                <Route path="templates" element={<AdminTemplates />} />
                <Route path="design-templates" element={<DesignTemplatesList />} />
                <Route path="design-templates/:id" element={<DesignTemplateDetail />} />
                <Route path="design-templates/:id/instances/:applicationId" element={<DesignTemplateInstance />} />
                <Route path="products" element={<ProductsList />} />
                <Route path="products/:id" element={<AdminProductDetail />} />
                <Route path="designs" element={<DesignsList />} />
                <Route path="designs/:id" element={<DesignDetail />} />
                {/* Blanks, pricing and blank photography are one experience.
                    The old destinations still resolve — /admin/blanks/list is
                    the previous list, and /admin/pricing lands on the pricing
                    view of the catalogue rather than 404ing. */}
                <Route path="blanks" element={<BlankCatalog />} />
                <Route path="blanks/inventory" element={<BlanksInventory />} />
                <Route path="blanks/list" element={<BlanksList />} />
                <Route path="blanks/import-images" element={<BlankImagesImport />} />
                <Route path="blanks/:id" element={<BlankDetail />} />
                <Route path="athletes" element={<AthletesList />} />
                <Route path="athletes/:id" element={<AthleteDetail />} />
                <Route path="teams" element={<TeamsList />} />
                <Route path="teams/:id" element={<TeamDetail />} />
                <Route path="collections" element={<CollectionsList />} />
                <Route path="collections/:id" element={<CollectionDetail />} />
                <Route path="inbox" element={<AdminInbox />} />
                <Route path="tasks" element={<TasksList />} />
                <Route path="organizations" element={<OrganizationsList />} />
                <Route path="organizations/:id" element={<OrganizationDetail />} />
                <Route path="mockups" element={<AdminMockups />} />
                <Route path="brand-assets" element={<AdminBrandAssets />} />
                <Route path="fulfillment" element={<AdminFulfillment />} />
                <Route path="print-queue" element={<AdminPrintQueue />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="prompts" element={<AdminPrompts />} />
                <Route path="team" element={<TeamUsers />} />
                <Route path="users" element={<TeamUsers />} />
                <Route path="ingestion" element={<IngestionQueue />} />
                <Route path="ingestion/:id" element={<IngestionQueue />} />
                <Route path="orders" element={<OrdersList />} />
                <Route path="orders/:id" element={<OrderDetail />} />
                <Route path="pricing" element={<Navigate to="/admin/blanks?view=pricing" replace />} />
                <Route path="pricing/sheet" element={<PricingMaster />} />
                <Route path="credits" element={<AthleteCredits />} />
                <Route path="affiliates" element={<AffiliatesList />} />
                <Route path="questionnaires" element={<QuestionnairesList />} />
                <Route path="questionnaires/:id" element={<QuestionnaireEditor />} />
                <Route path="pricing-links" element={<CustomerPricingLinks />} />
                <Route path="print-zones" element={<PrintZonesEditor />} />
                <Route path="imports/orders" element={<ImportsList />} />
                <Route path="imports/orders/:id" element={<ImportBatchDetail />} />
              </Route>

              {/* AX OS V2 — built in parallel; V1 stays live at /admin */}
              <Route path="/admin-v2" element={<RequireAdmin><V2Layout /></RequireAdmin>}>
                <Route index element={<V2Overview />} />
                <Route path="people" element={<V2People />} />
                {/*
                  An athlete has two addresses. The bare route is the OVERVIEW —
                  what is happening right now. /library is the full pipeline,
                  which this page used to be: it had grown into a vertical feed
                  of every design, mockup, product and collection, which answers
                  "show me everything" rather than "what needs me".
                */}
                <Route path="people/:id" element={<V2EntityOverview />} />
                <Route path="people/:id/library" element={<V2EntityWorkspace />} />
                {/* The operator's draft order for this entity. */}
                <Route path="people/:id/cart" element={<V2Cart />} />
                {/* What the client sees in My Gear: collections and Front / Back pictures. */}
                <Route path="people/:id/lineup" element={<V2Lineup />} />
                {/* Cost, retail, bulk price and the split for every product of this client. */}
                <Route path="people/:id/pricing" element={<V2PricingSheet />} />
                {/* Products + quantities → an invoice, with our side and theirs. */}
                <Route path="people/:id/invoice" element={<V2InvoiceBuilder />} />
                {/* AX Studio OS: Projects & Tasks, Asset Library and Releases. */}
                <Route path="work" element={<V2Work />} />
                <Route path="creative" element={<V2Creative />} />
                <Route path="library" element={<V2Creative variant="library" />} />
                <Route path="releases" element={<V2Releases />} />
                {/* One picture at a time: approve, send back to fix, or archive. */}
                <Route path="review" element={<V2ContentReview />} />
                <Route path="commerce" element={<V2Commerce />} />
                <Route path="commerce/blanks" element={<V2Commerce />} />
                <Route path="commerce/blanks/:id" element={<V2BlankDetail />} />
                <Route path="orders" element={<V2Orders />} />
                {/* What clients sent from their portals: briefs, messages, drops. */}
                <Route path="desk" element={<V2Desk />} />
                {/* A product opened from V2 stays in V2. */}
                <Route path="products/:id" element={<V2ProductDetail />} />
                {/*
                  A wrong V2 address stays inside V2. Falling through to the
                  app-wide 404 threw the operator out of the dashboard shell
                  entirely, with no nav to get back in.
                */}
                <Route path="*" element={<V2NotFound />} />
              </Route>

              {/* Portal */}
              <Route path="/portal" element={<RequirePortal><PortalLayout /></RequirePortal>}>
                <Route index element={<PortalHome />} />
                <Route path="products" element={<PortalProducts />} />
                {/* The Mooney World addresses from the design pack. */}
                <Route path="gear" element={<RedirectKeepSearch to="/portal/products" />} />
                <Route path="brand" element={<RedirectKeepSearch to="/portal/analytics" />} />
                <Route path="mockups" element={<PortalMockups />} />
                <Route path="analytics" element={<PortalAnalytics />} />
                <Route path="content" element={<PortalContent />} />
                <Route path="drops" element={<PortalDrops />} />
                <Route path="era" element={<PortalEra />} />
                <Route path="messages" element={<PortalMessages />} />
                <Route path="studio" element={<PortalStudio />} />
                <Route path="profile" element={<PortalProfile />} />
                <Route path="build/game-day" element={<GameDayBuilder />} />
                <Route path="build/camp" element={<CampBuilder />} />
                <Route path="build/custom" element={<CustomBuilder />} />
                <Route path="products/:id" element={<PortalProductDetail />} />
              </Route>

              {/* Affiliate */}
              <Route path="/affiliate/signup" element={<AffiliateSignup />} />

              {/* Public wholesale catalog (no auth) */}
              <Route path="/catalog" element={<CatalogLayout />}>
                <Route index element={<CatalogList />} />
                <Route path="checkout" element={<CatalogCheckout />} />
                <Route path=":id" element={<CatalogProductDetail />} />
              </Route>

              <Route path="/affiliate" element={<RequireAffiliate><AffiliateLayout /></RequireAffiliate>}>
                <Route index element={<AffiliateHome />} />
                <Route path="products" element={<AffiliateProducts />} />
                <Route path="sales" element={<AffiliateSales />} />
                <Route path="payouts" element={<AffiliatePayouts />} />
              </Route>

              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              {/* lockers.athletexclusive.com/<slug> — a locker; anywhere else a 404 */}
              <Route path="/:slug" element={<LockerHostRoute />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
