import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/auth/AuthProvider";
import { RequireAdmin, RequirePortal } from "@/auth/guards";

import RootRedirect from "./pages/RootRedirect";
import Login from "./pages/Login";
import PendingAccess from "./pages/PendingAccess";
import NotFound from "./pages/NotFound";

import AdminLayout from "@/components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminPlaceholder from "./pages/admin/AdminPlaceholder";
import AthletesList from "./pages/admin/AthletesList";
import AthleteDetail from "./pages/admin/AthleteDetail";
import ProductsList from "./pages/admin/ProductsList";
import IngestionQueue from "./pages/admin/IngestionQueue";
import DesignsList from "./pages/admin/DesignsList";
import DesignDetail from "./pages/admin/DesignDetail";
import BlanksList from "./pages/admin/BlanksList";
import BlankDetail from "./pages/admin/BlankDetail";

import PortalLayout from "@/components/portal/PortalLayout";
import PortalHome from "./pages/portal/PortalHome";

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
              <Route path="products/:id" element={<ProductsList />} />
              <Route path="designs" element={<DesignsList />} />
              <Route path="designs/:id" element={<DesignDetail />} />
              <Route path="blanks" element={<BlanksList />} />
              <Route path="blanks/:id" element={<BlankDetail />} />
              <Route path="athletes" element={<AthletesList />} />
              <Route path="athletes/:id" element={<AthleteDetail />} />
              <Route path="teams" element={<AdminPlaceholder title="Teams" />} />
              <Route path="collections" element={<AdminPlaceholder title="Collections" />} />
              <Route path="ingestion" element={<IngestionQueue />} />
              <Route path="ingestion/:id" element={<IngestionQueue />} />
              <Route path="orders" element={<AdminPlaceholder title="Orders" />} />
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
