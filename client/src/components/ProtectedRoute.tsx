import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ReactNode } from "react";

export function ProtectedRoute({
  children,
  requireMod = false,
}: {
  children: ReactNode;
  requireMod?: boolean;
}) {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requireMod && !user.isModerator) return <Navigate to="/" replace />;

  return <>{children}</>;
}
