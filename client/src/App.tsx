import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { WebSocketProvider } from "./context/WebSocketContext";
import { ProtectedRoute } from "./core/ui/ProtectedRoute";
import { Login } from "./pages/Login";
import { BingoList } from "./pages/BingoList";
import { BingoPage } from "./pages/BingoPage";
import { ModPage } from "./pages/ModPage";

export default function App() {
  return (
    <BrowserRouter>
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </WebSocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
