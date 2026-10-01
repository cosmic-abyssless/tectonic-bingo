import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@bingo/shared";
import { clearAuthCache, readAuthCache, writeAuthCache } from "../api/authCache";
import { clearBoardCache } from "../api/boardCache";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** /api/me has been asked on this load: `user` is the server's record (or, if it couldn't be asked, the cached one stands). */
  confirmed: boolean;
  devMode: boolean;
  /** Only admins listed in the server's ADMIN_DISCORD_IDS may grant site admin. */
  canGrantAdmin: boolean;
  /** Dev only: the viewer is an admin who switched their admin powers off (the account switcher), so `user.isAdmin` is false. */
  devAdminOff: boolean;
  logout: () => Promise<void>;
  /** Replaces the viewer's record with a fresher one the server sent back (e.g. after marking the Tutorial seen). */
  updateUser: (user: User) => void;
  /** Asks /api/me again, keeping the current record if it can't be asked. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Start from who this browser was last time (see authCache.ts) so a reload
  // isn't a "Loading…" screen; /api/me below confirms or replaces it.
  const [cached] = useState(() => readAuthCache<User>(__BUILD_ID__));
  const [user, setUser] = useState<User | null>(cached?.user ?? null);
  const [devMode, setDevMode] = useState(cached?.devMode ?? false);
  const [canGrantAdmin, setCanGrantAdmin] = useState(cached?.canGrantAdmin ?? false);
  const [devAdminOff, setDevAdminOff] = useState(cached?.devAdminOff ?? false);
  const [loading, setLoading] = useState(!cached);
  const [confirmed, setConfirmed] = useState(false);

  const load = (keepOnFailure: boolean) =>
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const next = data?.user ?? null;
        setUser(next);
        setDevMode(data?.devMode ?? false);
        setCanGrantAdmin(data?.canGrantAdmin ?? false);
        setDevAdminOff(data?.devAdminOff ?? false);
        if (next)
          writeAuthCache(__BUILD_ID__, {
            user: next,
            devMode: data?.devMode ?? false,
            canGrantAdmin: data?.canGrantAdmin ?? false,
            devAdminOff: data?.devAdminOff ?? false,
          });
        else clearAuthCache();
      })
      // Couldn't ask (offline, server restarting): keep going as the cached user
      // rather than logging you out; the first API call that says otherwise will.
      .catch(() => {
        if (!keepOnFailure) setUser(null);
      });

  useEffect(() => {
    load(!!cached).finally(() => {
      setLoading(false);
      setConfirmed(true);
    });
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Asked again when the viewer's Admin flag changes (access_changed) or the Site admin pages refuse them.
  const refresh = async () => {
    await load(true);
  };

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    // The persisted board is per user; do not leave it behind on a shared browser.
    clearBoardCache();
    clearAuthCache();
    setUser(null);
  };

  const updateUser = (next: User) => {
    setUser(next);
    writeAuthCache(__BUILD_ID__, { user: next, devMode, canGrantAdmin, devAdminOff });
  };

  return <AuthContext.Provider value={{ user, loading, confirmed, devMode, canGrantAdmin, devAdminOff, logout, updateUser, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
