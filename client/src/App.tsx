import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { LazyMotion } from "motion/react";
import { onSlowDown } from "./api/client";
import { AuthProvider } from "./context/AuthContext";
import { WebSocketProvider } from "./context/WebSocketContext";
import { ProtectedRoute } from "./core/ui/ProtectedRoute";
import { ToastRegion, toastOnce } from "./core/ui/Toast";
import { NewVersionNotice } from "./core/ui/NewVersionNotice";
import { useSyncColorSchemeAttribute } from "./core/ui/colorScheme";
import { Login } from "./pages/Login";
import { BingoList } from "./pages/BingoList";
import { LatestBingoRedirect } from "./pages/LatestBingoRedirect";
import { BingoPage } from "./pages/BingoPage";
import { ErrorBoundary } from "./core/ui/ErrorBoundary";
import { PageLoading } from "./themes/default/page/PageStates";
import { useBingoGoneRedirect } from "./headless/useBingoGoneRedirect";
import { useAccessWatch } from "./headless/permissions";
import { usePendingTabTitle } from "./headless/usePendingTabTitle";
import { awaitModule } from "./core/chunkReload";

// The board page and the way to it load up front; every other page is its own
// chunk, so a Player opening the Board doesn't download ag-grid, the Mod Panel or
// stats first.
const PhoneLogin = lazy(() => awaitModule(import("./pages/PhoneLogin")).then((m) => ({ default: m.PhoneLogin })));
const ModPage = lazy(() => awaitModule(import("./pages/ModPage")).then((m) => ({ default: m.ModPage })));
const BuyinsPage = lazy(() => awaitModule(import("./pages/BuyinsPage")).then((m) => ({ default: m.BuyinsPage })));
const DraftPage = lazy(() => awaitModule(import("./pages/DraftPage")).then((m) => ({ default: m.DraftPage })));
const StatsPage = lazy(() => awaitModule(import("./pages/StatsPage")).then((m) => ({ default: m.StatsPage })));
const RewindPage = lazy(() => awaitModule(import("./pages/RewindPage")).then((m) => ({ default: m.RewindPage })));
const WrappedPage = lazy(() => awaitModule(import("./pages/WrappedPage")).then((m) => ({ default: m.WrappedPage })));
const FeedbackPage = lazy(() => awaitModule(import("./pages/FeedbackPage")).then((m) => ({ default: m.FeedbackPage })));
const SiteAdminPage = lazy(() => awaitModule(import("./pages/SiteAdminPage")).then((m) => ({ default: m.SiteAdminPage })));
const TermsPage = lazy(() => awaitModule(import("./pages/legal/LegalPage")).then((m) => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => awaitModule(import("./pages/legal/LegalPage")).then((m) => ({ default: m.PrivacyPage })));
// The animation features of every `m` component (core/ui/motionFeatures.ts), fetched once the app has rendered.
const loadMotionFeatures = () => awaitModule(import("./core/ui/motionFeatures")).then((m) => m.default);

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

function PendingTabTitle() {
  usePendingTabTitle();
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
    <LazyMotion features={loadMotionFeatures}>
    <BrowserRouter>
      <ErrorBoundary>
      <AuthProvider>
        <WebSocketProvider>
          {/* A lazy page's first visit shows the same "Loading…" the board page shows for its own data. */}
          <Suspense fallback={<PageLoading />}>
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
          </Suspense>
          <BingoGoneRedirect />
          <PendingTabTitle />
          <AccessWatch />
          <SlowDownNotice />
          <NewVersionNotice />
          <ToastRegion />
        </WebSocketProvider>
      </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
    </LazyMotion>
  );
}
