import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { WebSocketProvider } from "./context/WebSocketContext";
import { ProtectedRoute } from "./core/ui/ProtectedRoute";
import { ToastRegion } from "./core/ui/Toast";
import { useSyncColorSchemeAttribute } from "./core/ui/colorScheme";
import { Login } from "./pages/Login";
import { BingoList } from "./pages/BingoList";
import { BingoPage } from "./pages/BingoPage";
import { ModPage } from "./pages/ModPage";
import { DraftPage } from "./pages/DraftPage";
import { StatsPage } from "./pages/StatsPage";
import { SiteAdminPage } from "./pages/SiteAdminPage";
import { ErrorBoundary } from "./core/ui/ErrorBoundary";

// Admin was folded into the Mod Panel — redirect any old /b/:slug/admin
// links there. Builds an absolute path explicitly since relative Navigate
// resolution for a flat (non-nested) route doesn't reliably land on the
// sibling path.
function AdminRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/b/${slug}/mod`} replace />;
}

export default function App() {
  useSyncColorSchemeAttribute();
  return (
    <BrowserRouter>
      <ErrorBoundary>
      <AuthProvider>
        <WebSocketProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <BingoList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/b/:slug"
              element={
                <ProtectedRoute>
                  <BingoPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/b/:slug/mod"
              element={
                <ProtectedRoute>
                  <ModPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/b/:slug/draft"
              element={
                <ProtectedRoute>
                  <DraftPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/b/:slug/stats"
              element={
                <ProtectedRoute>
                  <StatsPage />
                </ProtectedRoute>
              }
            />
            <Route path="/b/:slug/admin" element={<AdminRedirect />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <SiteAdminPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ToastRegion />
        </WebSocketProvider>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
