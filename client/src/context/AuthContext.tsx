import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@bingo/shared";
import { clearAuthCache, readAuthCache, writeAuthCache } from "../api/authCache";
import { clearBoardCache } from "../api/boardCache";

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
  // Start from who this browser was last time (see authCache.ts) so a reload
  // isn't a "Loading…" screen; /api/me below confirms or replaces it.
  const [cached] = useState(() => readAuthCache<User>(__BUILD_ID__));
  const [user, setUser] = useState<User | null>(cached?.user ?? null);
  const [devMode, setDevMode] = useState(cached?.devMode ?? false);
  const [canGrantAdmin, setCanGrantAdmin] = useState(cached?.canGrantAdmin ?? false);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const next = data?.user ?? null;
        setUser(next);
        setDevMode(data?.devMode ?? false);
        setCanGrantAdmin(data?.canGrantAdmin ?? false);
        if (next) writeAuthCache(__BUILD_ID__, { user: next, devMode: data?.devMode ?? false, canGrantAdmin: data?.canGrantAdmin ?? false });
        else clearAuthCache();
      })
      // Couldn't ask (offline, server restarting): keep going as the cached user
      // rather than logging you out; the first API call that says otherwise will.
      .catch(() => {
        if (!cached) setUser(null);
      })
      .finally(() => setLoading(false));
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    // The persisted board is per user; do not leave it behind on a shared browser.
    clearBoardCache();
    clearAuthCache();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, devMode, canGrantAdmin, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
