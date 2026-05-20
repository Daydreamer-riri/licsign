import { Navigate, Route, Routes } from "react-router";

import { AuthProvider, useAuth } from "./auth";
import { AppShell } from "@/components/AppShell";
import { ScopeProvider } from "@/components/ScopeContext";
import { CenteredSpinner } from "@/components/states";
import { LoginPage } from "./pages/Login";
import { ProductsPage } from "./pages/Products";
import { ProductLayout } from "./pages/product/ProductLayout";
import { ProductOverviewPage } from "./pages/product/Overview";
import { ProductBatchesPage } from "./pages/product/Batches";
import { BatchDetailPage } from "./pages/product/BatchDetail";
import { ProductLicensesPage } from "./pages/product/Licenses";
import { LicenseDetailPage } from "./pages/product/LicenseDetail";
import { ProductSettingsPage } from "./pages/product/Settings";
import { SettingsLayout } from "./pages/settings/SettingsLayout";
import { AdminsPage } from "./pages/settings/Admins";
import { AuditPage } from "./pages/settings/Audit";

function ProtectedLayout() {
  const { admin, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <CenteredSpinner />
      </div>
    );
  }
  if (!admin) return <Navigate to="/login" replace />;
  return (
    <ScopeProvider>
      <AppShell />
    </ScopeProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route index element={<ProductsPage />} />
          <Route path="products/:id" element={<ProductLayout />}>
            <Route index element={<ProductOverviewPage />} />
            <Route path="batches" element={<ProductBatchesPage />} />
            <Route path="batches/:batchId" element={<BatchDetailPage />} />
            <Route path="licenses" element={<ProductLicensesPage />} />
            <Route path="licenses/:licenseId" element={<LicenseDetailPage />} />
            <Route path="settings" element={<ProductSettingsPage />} />
          </Route>
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/admins" replace />} />
            <Route path="admins" element={<AdminsPage />} />
            <Route path="audit" element={<AuditPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
