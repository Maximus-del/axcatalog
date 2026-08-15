import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireAdmin, RequirePortal, RequireFan, RequireAffiliate } from "@/auth/guards";
import { LoadingScreen } from "@/components/brand/LoadingScreen";

// Eager: entry + auth + the fan experience (the primary consumer surface).
import RootRedirect from "./pages/RootRedirect";
import Login from "./pages/Login";
import PendingAccess from "./pages/PendingAccess";
import SetPassword from "./pages/SetPassword";
import NotFound from "./pages/NotFound";

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

// Lazy: internal surfaces (admin, portal, affiliate, catalog) are code-split so
// fans never download them. Only these bundles change on the respective routes.
const QuestionnairePublic = lazy(() => import("./pages/QuestionnairePublic"));

const AdminLayout = lazy(() => import("@/components/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminOverview = lazy(() => import("./pages/admin/AdminOverview"));
const AdminContent = lazy(() => import("./pages/admin/AdminContent"));
const AdminAccess = lazy(() => import("./pages/admin/AdminAccess"));
const AdminEvents = lazy(() => import("./pages/admin/AdminEvents"));
const AdminTemplates = lazy(() => import("./pages/admin/AdminTemplates"));
const DesignTemplatesList = lazy(() => import("./pages/admin/DesignTemplatesList"));
const DesignTemplateDetail = lazy(() => import("./pages/admin/DesignTemplateDetail"));
const AthletesList = lazy(() => import("./pages/admin/AthletesList"));
const AthleteDetail = lazy(() => import("./pages/admin/AthleteDetail"));
const ProductsList = lazy(() => import("./pages/admin/ProductsList"));
const AdminProductDetail = lazy(() => import("./pages/admin/ProductDetail"));
const IngestionQueue = lazy(() => import("./pages/admin/IngestionQueue"));
const DesignsList = lazy(() => import("./pages/admin/DesignsList"));
const DesignDetail = lazy(() => import("./pages/admin/DesignDetail"));
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
const AdminMockups = lazy(() => import("./pages/admin/AdminMockups"));
const AdminBrandAssets = lazy(() => import("./pages/admin/AdminBrandAssets"));
const AdminFulfillment = lazy(() => import("./pages/admin/AdminFulfillment"));
const AdminPrintQueue = lazy(() => import("./pages/admin/AdminPrintQueue"));
const AdminInbox = lazy(() => import("./pages/admin/AdminInbox"));

const PortalLayout = lazy(() => import("@/components/portal/PortalLayout"));
const PortalHome = lazy(() => import("./pages/portal/PortalHome"));
const PortalProductDetail = lazy(() => import("./pages/portal/PortalProductDetail"));
const PortalProducts = lazy(() => import("./pages/portal/PortalProducts"));
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
              <Route path="/" element={<RootRedirect />} />
              <Route path="/login" element={<Login />} />
              <Route path="/pending-access" element={<PendingAccess />} />
              <Route path="/set-password" element={<SetPassword />} />
              <Route path="/q/:slug" element={<QuestionnairePublic />} />

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
                <Route path="pulse" element={<AdminDashboard />} />
                <Route path="content" element={<AdminContent />} />
                <Route path="access" element={<AdminAccess />} />
                <Route path="events" element={<AdminEvents />} />
                <Route path="templates" element={<AdminTemplates />} />
                <Route path="design-templates" element={<DesignTemplatesList />} />
                <Route path="design-templates/:id" element={<DesignTemplateDetail />} />
                <Route path="products" element={<ProductsList />} />
                <Route path="products/:id" element={<AdminProductDetail />} />
                <Route path="designs" element={<DesignsList />} />
                <Route path="designs/:id" element={<DesignDetail />} />
                <Route path="blanks" element={<BlanksList />} />
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
                <Route path="team" element={<TeamUsers />} />
                <Route path="users" element={<TeamUsers />} />
                <Route path="ingestion" element={<IngestionQueue />} />
                <Route path="ingestion/:id" element={<IngestionQueue />} />
                <Route path="orders" element={<OrdersList />} />
                <Route path="orders/:id" element={<OrderDetail />} />
                <Route path="pricing" element={<PricingMaster />} />
                <Route path="credits" element={<AthleteCredits />} />
                <Route path="affiliates" element={<AffiliatesList />} />
                <Route path="questionnaires" element={<QuestionnairesList />} />
                <Route path="questionnaires/:id" element={<QuestionnaireEditor />} />
                <Route path="pricing-links" element={<CustomerPricingLinks />} />
                <Route path="print-zones" element={<PrintZonesEditor />} />
                <Route path="imports/orders" element={<ImportsList />} />
                <Route path="imports/orders/:id" element={<ImportBatchDetail />} />
              </Route>

              {/* Portal */}
              <Route path="/portal" element={<RequirePortal><PortalLayout /></RequirePortal>}>
                <Route index element={<PortalHome />} />
                <Route path="products" element={<PortalProducts />} />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
