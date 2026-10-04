import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { onSlowDown } from "./api/client";
import { AuthProvider } from "./context/AuthContext";
import { WebSocketProvider } from "./context/WebSocketContext";
import { ProtectedRoute } from "./core/ui/ProtectedRoute";
import { ToastRegion, toastOnce } from "./core/ui/Toast";
import { NewVersionNotice } from "./core/ui/NewVersionNotice";
import { useSyncColorSchemeAttribute } from "./core/ui/colorScheme";
import { Login } from "./pages/Login";
import { PhoneLogin } from "./pages/PhoneLogin";
import { BingoList } from "./pages/BingoList";
import { LatestBingoRedirect } from "./pages/LatestBingoRedirect";
import { BingoPage } from "./pages/BingoPage";
import { ModPage } from "./pages/ModPage";
import { BuyinsPage } from "./pages/BuyinsPage";
import { DraftPage } from "./pages/DraftPage";
import { StatsPage } from "./pages/StatsPage";
import { RewindPage } from "./pages/RewindPage";
import { WrappedPage } from "./pages/WrappedPage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { SiteAdminPage } from "./pages/SiteAdminPage";
import { ErrorBoundary } from "./core/ui/ErrorBoundary";
import { PrivacyPage, TermsPage } from "./pages/legal/LegalPage";
import { useBingoGoneRedirect } from "./headless/useBingoGoneRedirect";
import { useAccessWatch } from "./headless/permissions";

// Admin was folded into the Mod Panel — redirect any old /b/:slug/admin
// links there. Builds an absolute path explicitly since relative Navigate
// resolution for a flat (non-nested) route doesn't reliably land on the
// sibling path.
function AdminRedirect() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/b/${slug}/mod`} replace />;
}

// Inside the router, auth and query providers the hooks need; renders nothing.
function BingoGoneRedirect() {
  useBingoGoneRedirect();
  return null;
}

function AccessWatch() {
  useAccessWatch();
  return null;
}

// The server's write limit refused a write (a 429): its "Slow down" message, once for the whole burst.
function SlowDownNotice() {
  useEffect(() => onSlowDown((error) => toastOnce("slow-down", { title: error.message, tone: "warning" })), []);
  return null;
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
            {/* Public: where a phone lands from a logged-in computer's "Log in on your phone" QR code. */}
            <Route path="/login/phone" element={<PhoneLogin />} />
            {/* Public: linked from the Discord application settings and the login page. */}
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            {/* The front door goes to the latest Bingo; the list of every Bingo is /bingos. */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <LatestBingoRedirect />
                </ProtectedRoute>
              }
            />
            <Route
              path="/bingos"
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
              path="/b/:slug/buyins"
              element={
                <ProtectedRoute>
                  <BuyinsPage />
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
            <Route
              path="/b/:slug/rewind"
              element={
                <ProtectedRoute>
                  <RewindPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/b/:slug/wrapped"
              element={
                <ProtectedRoute>
                  <WrappedPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/b/:slug/feedback"
              element={
                <ProtectedRoute>
                  <FeedbackPage />
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
          <BingoGoneRedirect />
          <AccessWatch />
          <SlowDownNotice />
          <NewVersionNotice />
          <ToastRegion />
        </WebSocketProvider>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
