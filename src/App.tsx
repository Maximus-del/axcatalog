import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireAdmin, RequirePortal, RequireFan } from "@/auth/guards";

import RootRedirect from "./pages/RootRedirect";
import Login from "./pages/Login";
import PendingAccess from "./pages/PendingAccess";
import SetPassword from "./pages/SetPassword";
import NotFound from "./pages/NotFound";

import AdminLayout from "@/components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AthletesList from "./pages/admin/AthletesList";
import AthleteDetail from "./pages/admin/AthleteDetail";
import ProductsList from "./pages/admin/ProductsList";
import ProductDetail from "./pages/admin/ProductDetail";
import IngestionQueue from "./pages/admin/IngestionQueue";
import DesignsList from "./pages/admin/DesignsList";
import DesignDetail from "./pages/admin/DesignDetail";
import BlanksList from "./pages/admin/BlanksList";
import BlankDetail from "./pages/admin/BlankDetail";
import OrdersList from "./pages/admin/OrdersList";
import OrderDetail from "./pages/admin/OrderDetail";
import PricingMaster from "./pages/admin/PricingMaster";
import ImportsList from "./pages/admin/ImportsList";
import ImportBatchDetail from "./pages/admin/ImportBatchDetail";
import AthleteCredits from "./pages/admin/AthleteCredits";
import AffiliatesList from "./pages/admin/AffiliatesList";
import QuestionnairesList from "./pages/admin/QuestionnairesList";
import QuestionnaireEditor from "./pages/admin/QuestionnaireEditor";
import QuestionnairePublic from "./pages/QuestionnairePublic";
import CustomerPricingLinks from "./pages/admin/CustomerPricingLinks";
import PrintZonesEditor from "./pages/admin/PrintZonesEditor";
import TeamUsers from "./pages/admin/TeamUsers";
import TasksList from "./pages/admin/TasksList";
import OrganizationsList from "./pages/admin/OrganizationsList";
import OrganizationDetail from "./pages/admin/OrganizationDetail";
import TeamsList from "./pages/admin/TeamsList";
import TeamDetail from "./pages/admin/TeamDetail";
import CollectionsList from "./pages/admin/CollectionsList";
import CollectionDetail from "./pages/admin/CollectionDetail";
import AdminAnalytics from "./pages/admin/AdminAnalytics";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminMockups from "./pages/admin/AdminMockups";
import AdminBrandAssets from "./pages/admin/AdminBrandAssets";
import AdminFulfillment from "./pages/admin/AdminFulfillment";
import AdminPrintQueue from "./pages/admin/AdminPrintQueue";
import AdminInbox from "./pages/admin/AdminInbox";

import PortalLayout from "@/components/portal/PortalLayout";
import PortalHome from "./pages/portal/PortalHome";
import PortalProductDetail from "./pages/portal/PortalProductDetail";
import PortalProducts from "./pages/portal/PortalProducts";
import PortalAnalytics from "./pages/portal/PortalAnalytics";
import PortalContent from "./pages/portal/PortalContent";
import PortalDrops from "./pages/portal/PortalDrops";
import PortalEra from "./pages/portal/PortalEra";
import PortalMessages from "./pages/portal/PortalMessages";
import PortalStudio from "./pages/portal/PortalStudio";
import PortalProfile from "./pages/portal/PortalProfile";
import GameDayBuilder from "./pages/portal/build/GameDayBuilder";
import CampBuilder from "./pages/portal/build/CampBuilder";
import CustomBuilder from "./pages/portal/build/CustomBuilder";

import { RequireAffiliate } from "@/auth/guards";
import AffiliateLayout from "@/components/affiliate/AffiliateLayout";
import AffiliateSignup from "./pages/affiliate/AffiliateSignup";
import AffiliateHome from "./pages/affiliate/AffiliateHome";
import AffiliateProducts from "./pages/affiliate/AffiliateProducts";
import AffiliateSales from "./pages/affiliate/AffiliateSales";
import AffiliatePayouts from "./pages/affiliate/AffiliatePayouts";

import CatalogLayout from "./pages/catalog/CatalogLayout";
import CatalogList from "./pages/catalog/CatalogList";
import CatalogProductDetail from "./pages/catalog/CatalogProductDetail";
import CatalogCheckout from "./pages/catalog/CatalogCheckout";

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
import ProductDetail from "./pages/fan/ProductDetail";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/pending-access" element={<PendingAccess />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/q/:slug" element={<QuestionnairePublic />} />

            {/* Goat Farm Access (fan) — public entry + shareable athlete pages */}
            <Route path="/join" element={<FanJoin />} />
            <Route path="/a/:slug" element={<AthletePublicProfile />} />
            <Route path="/p/:id" element={<ProductDetail />} />
            <Route
              path="/welcome"
              element={
                <RequireFan>
                  <FanOnboarding />
                </RequireFan>
              }
            />

            {/* Fan feed (Goat Farm Access) */}
            <Route
              path="/feed"
              element={
                <RequireFan>
                  <FanLayout />
                </RequireFan>
              }
            >
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
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminLayout />
                </RequireAdmin>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="products" element={<ProductsList />} />
              <Route path="products/:id" element={<ProductDetail />} />
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
            <Route
              path="/portal"
              element={
                <RequirePortal>
                  <PortalLayout />
                </RequirePortal>
              }
            >
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

            <Route
              path="/affiliate"
              element={
                <RequireAffiliate>
                  <AffiliateLayout />
                </RequireAffiliate>
              }
            >
              <Route index element={<AffiliateHome />} />
              <Route path="products" element={<AffiliateProducts />} />
              <Route path="sales" element={<AffiliateSales />} />
              <Route path="payouts" element={<AffiliatePayouts />} />
            </Route>

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
