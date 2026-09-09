import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@bingo/shared";

interface AuthState {
  user: User | null;
  loading: boolean;
  devMode: boolean;
  /** Only admins listed in the server's ADMIN_DISCORD_IDS may grant site admin. */
  canGrantAdmin: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [canGrantAdmin, setCanGrantAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setUser(data?.user ?? null);
        setDevMode(data?.devMode ?? false);
        setCanGrantAdmin(data?.canGrantAdmin ?? false);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, devMode, canGrantAdmin, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
