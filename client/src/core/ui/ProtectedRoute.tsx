import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { type ReactNode } from "react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-bg text-sm text-fg-muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
