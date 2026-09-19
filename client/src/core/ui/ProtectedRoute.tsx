import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { type ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { EmptyState } from "./Card";
import { LockIcon } from "./icons";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="delayed-in flex min-h-screen items-center justify-center bg-background text-sm text-on-surface-muted">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // Mirrors the server's requireGuildMember: every bingo route 403s for
  // these users, so explain why instead of showing a broken page.
  if (!user.inGuild && !user.isAdmin) return <NotInGuild />;

  return <>{children}</>;
}

function NotInGuild() {
  return (
    <div className="min-h-screen">
      <AppHeader title="Tectonic Bingo" />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <EmptyState icon={<LockIcon />} title="Clan members only">
          Tectonic Bingo is for members of the Tectonic Discord server, and your Discord account isn't in it. Join the server, then log out and back in
          here so we can re-check.
        </EmptyState>
      </main>
    </div>
  );
}
